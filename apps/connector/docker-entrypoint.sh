#!/bin/sh
# First-boot restore, then hand off to the connector.
#
# WHY THIS EXISTS. A fresh platform volume is empty, and an empty mirror is not merely blank: it
# loses the moderation log (the audit trail the demo rests on) and the first_seen/last_seen
# bookkeeping, so a returning member stops being recognisable as one.
#
# WHY ENV VARS AND NOT A FILE. `railway up` honours .gitignore, and the seed is deliberately
# gitignored — it is a point-in-time copy of a live mirror and has no business in a public repo.
# So the payload travels as gzip+base64 in variables instead, split across
# KEEPER_SEED_DB_B64_0..N because a single variable is capped at 32768 bytes. Chunked rather
# than "it fits today": the whole DB compressed to 32104 bytes, 664 short of the cap.
#
# WHY IT COUNTS ROWS. The connector creates keeper.db and bootstraps an empty schema on first
# boot, so a file-exists check passes immediately and then refuses to restore for ever after —
# which is exactly what happened on 2026-08-27. "Does the volume hold DATA" is the real question.
set -e

VAR_DIR=/app/var
mkdir -p "$VAR_DIR"

# The single-instance lock lives on the volume, so it OUTLIVES the container that wrote it —
# and the pid recorded in it belongs to a dead container's pid namespace, where "is pid 31
# alive?" is meaningless and usually answers yes. Every redeploy then refuses to start.
#
# Clearing it here is safe precisely BECAUSE this is a container: if this entrypoint is running,
# the previous container is gone, and railway.toml pins numReplicas=1 so the platform - not a
# lock file - is what guarantees a single instance. The lock stays exactly as it is for local
# runs, where it is a real protection against two connectors sharing one bot token.
if [ -f "$VAR_DIR/keeper.db.lock" ]; then
  echo "[entrypoint] clearing a stale instance lock left by the previous container"
  rm -f "$VAR_DIR/keeper.db.lock"
fi

seed_b64() {
  # Concatenate the chunks in order. Missing chunk => end of payload.
  i=0
  while :; do
    eval "chunk=\${KEEPER_SEED_DB_B64_${i}:-}"
    [ -z "$chunk" ] && break
    printf '%s' "$chunk"
    i=$((i + 1))
  done
}

# Ask the database how many rows it holds. Used both to decide whether the volume is really
# empty and to VERIFY a restore actually landed — a byte count proves the pipe ran, not that the
# result is a database.
count_rows() {
  (cd /app/apps/connector && node -e "
    try {
      const db = require('better-sqlite3')('$1', { readonly: true });
      const n = ['members','events','actions'].reduce((sum, t) => {
        try { return sum + db.prepare('select count(*) c from ' + t).get().c; } catch { return sum; }
      }, 0);
      process.stdout.write(String(n));
    } catch (e) { process.stdout.write('ERR:' + e.message); }
  " 2>/dev/null || echo 'ERR:node-failed')
}

restore() {
  payload=$(seed_b64)
  if [ -z "$payload" ]; then
    echo "[entrypoint] no seed configured — starting with a blank mirror"
    return 0
  fi
  echo "[entrypoint] restoring keeper.db from the seed variables (${#payload} b64 chars)"
  # Remove the write-ahead log and shared-memory files FIRST.
  #
  # The mirror runs in WAL mode, so keeper.db is only half the database. Overwriting the main
  # file while a -wal from the *previous* database is still sitting beside it means SQLite opens
  # the restored file and then replays a WAL belonging to something else over the top of it. The
  # symptom is maddening and was observed on 2026-08-27: the right number of bytes lands on disk,
  # gunzip is happy, and the database reports zero rows.
  rm -f "$VAR_DIR/keeper.db-wal" "$VAR_DIR/keeper.db-shm"
  printf '%s' "$payload" | base64 -d | gunzip > "$VAR_DIR/keeper.db"
  echo "[entrypoint] wrote $(wc -c < "$VAR_DIR/keeper.db") bytes; verifying…"
  verified=$(count_rows "$VAR_DIR/keeper.db")
  echo "[entrypoint] restored database reports: $verified rows"
  case "$verified" in
    ERR:*|0)
      # Loud, not silent. A restore that yields an empty database is the failure mode that
      # looks like success and then quietly serves a blank dashboard.
      echo "[entrypoint] !! RESTORE DID NOT PRODUCE A USABLE DATABASE ($verified)"
      ;;
  esac
  # The Minds conversation state matters as much as the mirror: without it the watcher loses its
  # timestamp floor, and API-NOTES is explicit that a lost cursor can replay old directives into
  # a live group.
  if [ -n "${KEEPER_SEED_STATE_B64:-}" ]; then
    echo "[entrypoint] restoring minds-state.json (watcher floor + conversation ids)"
    printf '%s' "$KEEPER_SEED_STATE_B64" | base64 -d | gunzip > "$VAR_DIR/minds-state.json"
  fi
}

if [ ! -f "$VAR_DIR/keeper.db" ]; then
  echo "[entrypoint] volume has no keeper.db"
  restore
else
  ROWS=$(count_rows "$VAR_DIR/keeper.db")
  if [ "$ROWS" = "0" ]; then
    echo "[entrypoint] keeper.db present but EMPTY (0 rows) — treating as first boot"
    restore
  else
    echo "[entrypoint] volume holds $ROWS rows of live data — leaving it alone"
  fi
fi

# The Mind's cached recollections restore on their OWN terms, not as part of the database's
# first boot. They are a different artifact - the Mind's memory, not the mirror's - and a volume
# that already holds live rows can still be missing them, which renders the dashboard's best
# panel empty while everything else looks fine.
if [ -n "${KEEPER_SEED_RECALL_B64:-}" ] && [ ! -f "$VAR_DIR/member-recall.json" ]; then
  echo "[entrypoint] restoring member-recall.json (the Mind's own words)"
  printf '%s' "$KEEPER_SEED_RECALL_B64" | base64 -d | gunzip > "$VAR_DIR/member-recall.json"
  echo "[entrypoint] recall holds $(grep -o '"warmth"' "$VAR_DIR/member-recall.json" | wc -l) member summaries"
fi

exec "$@"
