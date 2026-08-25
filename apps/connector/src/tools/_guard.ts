/**
 * A CLI tool and the connector must not talk to the Mind at the same time.
 *
 * There is one Mind conversation and no correlation id in the platform. The connector's
 * watcher treats any Mind message it did not send as unprompted — so a tool that sends
 * envelopes directly (judgment test, charter teacher, probes) has its replies picked up by
 * the watcher and executed as if the Mind had volunteered them.
 *
 * That is not hypothetical: on 2026-08-25 a judgment-test run alongside a live connector
 * produced 10 stray replies in the community group and 36 digest DMs to the creator.
 *
 * The connector already holds a pid lockfile beside the mirror, so the check is cheap.
 */
import { readFileSync } from 'node:fs';

export function assertConnectorNotRunning(mirrorPath: string, toolName: string): void {
  let pid: number | null = null;
  try {
    pid = Number(readFileSync(`${mirrorPath}.lock`, 'utf8').trim());
  } catch {
    return; // no lock, nothing running
  }
  if (pid === null || !Number.isInteger(pid)) return;
  try {
    process.kill(pid, 0);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EPERM') return; // stale lock
  }
  process.stderr.write(
    `\nThe Keeper connector (pid ${pid}) is running, so ${toolName} must not run now.\n\n` +
      `  Both would be reading the same Mind conversation. The connector's watcher treats\n` +
      `  any Mind message it did not send as unprompted, so this tool's replies would be\n` +
      `  executed as if the Mind had volunteered them — real posts into the community group\n` +
      `  and real DMs to the creator.\n\n` +
      `  Stop it first:  kill ${pid}\n` +
      `  Then re-run ${toolName}, and start the connector again afterwards.\n\n`,
  );
  process.exit(2);
}
