/**
 * Snapshot what Keeper actually did, with real timestamps, into docs/EVIDENCE/.
 *
 *   pnpm evidence:capture
 *
 * BUILD_PLAN Phase 3 accepts only when the persistence behaviours have "fired at least once
 * with real timestamps, screenshotted into docs/EVIDENCE/". Screenshots are the human half;
 * this is the machine half — the moderation log, the unprompted feed and the Cognition spend,
 * dumped from the mirror so the dates cannot drift from what happened.
 *
 * Reads only. It never asks the Mind anything, so it costs nothing and can be run mid-demo.
 */
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import dotenv from 'dotenv';

import { ConnectorConfigError, loadConnectorConfig } from '../config.js';
import { Mirror } from '../db/mirror.js';

const ROOT = resolve(import.meta.dirname, '..', '..', '..', '..');
dotenv.config({ path: join(ROOT, '.env') });

const iso = (ms: number | null): string => (ms === null ? '—' : new Date(ms).toISOString().replace('T', ' ').slice(0, 19));
const cell = (s: string): string => s.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

function cognitionToday(): { calls: number; note: string } {
  try {
    const lines = readFileSync(join(ROOT, 'var', 'minds-calls.jsonl'), 'utf8').trim().split('\n');
    const today = new Date().toISOString().slice(0, 10);
    const calls = lines.filter((l) => l.includes(today) && l.includes('sendAndAwaitReply')).length;
    return { calls, note: 'exchanges logged today (each ~0.8-0.9 credits, see docs/API-NOTES.md)' };
  } catch {
    return { calls: 0, note: 'var/minds-calls.jsonl not found' };
  }
}

function main(): void {
  const config = loadConnectorConfig();
  const mirror = Mirror.open(resolve(ROOT, config.mirrorPath));
  try {
    const members = mirror.listMembers().sort((a, b) => a.firstSeenMs - b.firstSeenMs);
    const actions = mirror.listActions(200);
    const unprompted = actions.filter((a) => a.eventId === null);
    const cognition = cognitionToday();
    const stamp = new Date().toISOString();

    const out: string[] = [
      `## Evidence capture — ${stamp}`,
      '',
      `Group: **${config.groupName}**. Mirror: \`${config.mirrorPath}\`.`,
      '',
      '### Members as the mirror sees them',
      '',
      'The mirror is a MIRROR: it holds no judgments and no profiles. Who these people *are*',
      'lives in the Steward Mind — delete this database and Keeper still knows them.',
      '',
      '| member | first seen | last seen | messages |',
      '|---|---|---|---|',
      ...members.map(
        (m) => `| @${m.handle ?? m.telegramId} | ${iso(m.firstSeenMs)} | ${iso(m.lastSeenMs)} | ${m.messageCount} |`,
      ),
      '',
      '### Unprompted — what Keeper did with nobody asking',
      '',
      unprompted.length === 0
        ? '_Nothing yet. These are actions with no triggering event: the Mind acted on its own._'
        : '| when | action | status | reasoning |',
      ...(unprompted.length === 0
        ? []
        : [
            '|---|---|---|---|',
            ...unprompted.map(
              (a) => `| ${iso(a.tsMs)} | ${a.action} | ${a.status} | ${cell(a.reasoning).slice(0, 160)} |`,
            ),
          ]),
      '',
      '### Moderation log',
      '',
      'Every row is the Mind’s judgement plus what the connector did with it. **What we',
      'refused** (`converted`) and **what the creator reversed** (`overridden`) are different',
      'columns on purpose: one is the machine declining to act, the other is a human taking',
      'it back. Principle 7 — every action logged, reversible, overridable — is this table.',
      '',
      '| when | action | asked for | confidence | status | we refused | creator override | target | the Mind’s reasoning |',
      '|---|---|---|---|---|---|---|---|---|',
      ...actions
        .slice(0, 40)
        .map((a) => {
          const gated = a.gated ? ' · gated (low confidence)' : '';
          const refused = a.converted === null ? '—' : `\`${a.converted}\`${gated}`;
          const override =
            a.overridden
              ? `**yes**${a.overriddenAtMs === null ? '' : ` at ${iso(a.overriddenAtMs)}`}` +
                `${a.overrideNote === null ? '' : ` — ${cell(a.overrideNote)}`}`
              : '—';
          return (
            `| ${iso(a.tsMs)} | ${a.action} | ${a.originalAction} | ${a.confidence} | ${a.status}` +
            ` | ${refused} | ${override} | ${a.targetHandle === null ? '—' : `@${a.targetHandle}`} | ` +
            `${cell(a.reasoning).slice(0, 200)} |`
          );
        }),
      '',
      '### Cognition',
      '',
      `${cognition.calls} ${cognition.note}`,
      '',
      '---',
      '',
    ];

    const dir = join(ROOT, 'docs', 'EVIDENCE');
    mkdirSync(dir, { recursive: true });
    const path = join(dir, 'keeper-log.md');
    appendFileSync(path, `${out.join('\n')}\n`, 'utf8');

    process.stdout.write(
      `\nWrote docs/EVIDENCE/keeper-log.md\n` +
        `  ${members.length} member(s) · ${actions.length} action(s) · ${unprompted.length} unprompted\n` +
        `  ${cognition.calls} exchange(s) logged today\n\n` +
        (unprompted.length === 0
          ? '  Note: no unprompted actions yet. The digest and day-2 check-in are what fill that\n' +
            '  section, and they are the autonomy evidence — capture again after one fires.\n\n'
          : ''),
    );
  } finally {
    mirror.close();
  }
}

try {
  main();
} catch (error) {
  if (error instanceof ConnectorConfigError) {
    process.stderr.write(`${error.message}\n`);
    process.exit(2);
  }
  throw error;
}
