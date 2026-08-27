# Keeper connector — Telegram bot, Mind relay, SQLite mirror, and the dashboard API.
#
# A Dockerfile rather than leaving it to nixpacks autodetection: this is a pnpm workspace and
# better-sqlite3 is a NATIVE module, so the install needs build tools present and the workspace
# root available. Guessing at that on a deploy the demo depends on is how you find out at 3am.
#
# Node 22, not 20. The repo's engine floor is >=20, but this lockfile's pnpm (11.x) needs 22+
# and dies on 20 with ERR_UNKNOWN_BUILTIN_MODULE — found by building this image rather than by
# reading it. 22 satisfies the floor and matches what pnpm actually requires.
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable

# better-sqlite3 compiles from source when no prebuilt binary matches the platform.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Manifests first: this layer only busts when a dependency actually changes.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/protocol/package.json      packages/protocol/
COPY packages/minds-client/package.json  packages/minds-client/
COPY apps/connector/package.json         apps/connector/

# --ignore-scripts=false: the native build IS the point. Only the connector and what it
# depends on; the dashboard is a separate deployment and its 300MB has no business here.
RUN pnpm install --frozen-lockfile --filter @keeper/connector...

COPY packages/ packages/
COPY apps/connector/ apps/connector/
# tsconfig.base.json too: the project references resolve through it, and without it tsc
# reports the referenced packages as non-composite rather than as a missing file.
COPY tsconfig.json tsconfig.base.json ./

# Fail the BUILD on a type error rather than the container at boot.
RUN pnpm exec tsc --build

# The mirror and the Minds conversation state must outlive a redeploy, so /app/var is a mounted
# volume. It is declared by the PLATFORM, not here: Railway rejects a Dockerfile VOLUME outright
# ("docker VOLUME is not supported, use Railway Volumes"). Locally, bind-mount it yourself:
#   docker run -v "$PWD/var:/app/var" …
# Losing var/ loses the moderation log and the audit trail the demo rests on.
ENV KEEPER_MIRROR_PATH=/app/var/keeper.db

COPY apps/connector/docker-entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 4000
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["pnpm", "--filter", "@keeper/connector", "start"]
