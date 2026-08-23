/**
 * Creator override commands (BUILD_PLAN §5 Phase 4).
 *
 * pause / resume / undo / why are handled ENTIRELY in the connector — no Mind call.
 * That is deliberate: they must answer instantly and must keep working when the Mind is
 * slow, out of credits, or the reason the creator is reaching for the off switch.
 * `/keeper ask` is the one that costs Cognition, and it says so.
 */
import type { ConnectorConfig } from './config.js';
import type { Mirror } from './db/mirror.js';
import { log } from './log.js';
import { applyUndo, type UndoPlan } from './pipeline/executor.js';
import { dayWindow } from './pipeline/prefilter.js';
import type { EventRouter } from './pipeline/router.js';
import { html, toTelegramHtml } from './telegram/html.js';
import type { TelegramSurface } from './telegram/surface.js';

export interface CommandDeps {
  mirror: Mirror;
  surface: TelegramSurface;
  config: ConnectorConfig;
  router: EventRouter;
  now?: () => number;
}

export interface CommandInput {
  text: string;
  chatId: number;
  fromId: number;
  messageId?: number;
  member: { telegramId: number; handle: string | null; display: string };
  tsMs: number;
}

const USAGE = [
  '<b>Keeper commands</b> (creator only)',
  '/keeper pause — stop acting on anything but your commands',
  '/keeper resume — start again',
  '/keeper why — the Mind’s reasoning for its last action',
  '/keeper undo — reverse the last executed action',
  '/keeper status — pause state, today’s Cognition budget, mirror counts',
  '/keeper ask &lt;question&gt; — ask the Steward Mind (costs one exchange)',
].join('\n');

export function isKeeperCommand(text: string): boolean {
  return /^\/keeper(@[A-Za-z0-9_]+)?\b/.test(text.trim());
}

/** Returns true when the message was consumed as a command (routed or not). */
export async function handleCreatorCommand(deps: CommandDeps, input: CommandInput): Promise<boolean> {
  const raw = input.text.trim();
  if (!isKeeperCommand(raw)) return false;

  const now = deps.now ?? Date.now;
  // Everything reaching `reply` is composed with the `html` tagged template (or is a
  // constant), so member- and Mind-supplied values are already escaped. toTelegramHtml
  // then clamps it to Telegram's limits; it is idempotent, so nothing double-escapes.
  const reply = async (body: string): Promise<void> => {
    const opts = input.messageId === undefined ? {} : { replyToMessageId: input.messageId };
    try {
      await deps.surface.sendGroupMessage(input.chatId, toTelegramHtml(body), opts);
    } catch (e) {
      log.error('command_reply_failed', { detail: e instanceof Error ? e.message : String(e) });
    }
  };

  if (input.fromId !== deps.config.creatorTelegramId) {
    log.warn('command_refused', { fromId: input.fromId, text: raw });
    await reply('Only the creator can run Keeper commands.');
    return true;
  }

  const rest = raw.replace(/^\/keeper(@[A-Za-z0-9_]+)?\s*/, '');
  const [verbRaw = '', ...argParts] = rest.split(/\s+/);
  const verb = verbRaw.toLowerCase();
  const args = argParts.join(' ').trim();

  switch (verb) {
    case '':
    case 'help':
      await reply(USAGE);
      return true;

    case 'pause':
      deps.mirror.setPaused(true, now());
      log.info('command', { verb: 'pause' });
      await reply('Paused. I’ll keep mirroring the group but I won’t act or spend Cognition until you say <code>/keeper resume</code>.');
      return true;

    case 'resume':
      deps.mirror.setPaused(false, now());
      log.info('command', { verb: 'resume' });
      await reply('Resumed. Watching the group again.');
      return true;

    case 'why': {
      const last = deps.mirror.latestAction();
      if (last === undefined) {
        await reply('I haven’t taken an action yet.');
        return true;
      }
      await reply(formatWhy(last));
      return true;
    }

    case 'undo': {
      const last = deps.mirror.latestUndoableAction();
      if (last === undefined) {
        await reply('Nothing to undo — my last action didn’t change anything in the group.');
        return true;
      }
      const plan = (last.undo ?? { kind: 'none', note: 'nothing reversible was recorded' }) as UndoPlan;
      const result = await applyUndo({ surface: deps.surface, mirror: deps.mirror }, plan);
      deps.mirror.markOverridden(last.id, `undo by creator: ${result.detail}`);
      log.info('command', { verb: 'undo', actionId: last.id, ok: result.ok, detail: result.detail });
      await reply(
        html`Undid action #${last.id} (<b>${last.action}</b>): ${result.detail}. Logged as overridden.`,
      );
      return true;
    }

    case 'status': {
      await reply(formatStatus(deps, now()));
      return true;
    }

    case 'ask': {
      if (args === '') {
        await reply('Ask me something: <code>/keeper ask what do you remember about @lena_learns?</code>');
        return true;
      }
      const decision = deps.router.ingest({
        kind: 'creator_command',
        member: input.member,
        text: args,
        chatId: input.chatId,
        responseChatId: input.chatId,
        ...(input.messageId === undefined ? {} : { messageId: input.messageId }),
        tsMs: input.tsMs,
      });
      log.info('command', { verb: 'ask', routed: decision.routed, reason: decision.reason });
      await reply(
        decision.routed
          ? 'Asked the Steward Mind. It takes about a minute to think — I’ll post the answer here.'
          : html`I didn’t ask: ${decision.reason}.`,
      );
      return true;
    }

    default:
      await reply(`${html`I don’t know <code>${verb}</code>.`}\n\n${USAGE}`);
      return true;
  }
}

function formatWhy(last: {
  id: number;
  action: string;
  originalAction: string;
  reasoning: string;
  confidence: string;
  gated: boolean;
  converted: string | null;
  status: string;
  detail: string;
  warnings: string[];
  overridden: boolean;
}): string {
  const lines = [
    html`<b>Action #${last.id} — ${last.action}</b> (${last.status})`,
    html`Confidence: ${last.confidence}`,
    html`Reasoning: ${last.reasoning === '' ? '(the Mind gave none)' : last.reasoning}`,
  ];
  if (last.gated) {
    lines.push('Gated: low confidence, so I flagged you instead of acting.');
  }
  if (last.converted !== null) {
    lines.push(html`Rewritten: the Mind asked for <b>${last.originalAction}</b>; I refused (${last.converted}).`);
  }
  if (last.warnings.length > 0) lines.push(html`Parser warnings: ${last.warnings.join(', ')}`);
  if (last.overridden) lines.push('You have already overridden this one.');
  lines.push(html`Outcome: ${last.detail}`);
  return lines.join('\n');
}

function formatStatus(deps: CommandDeps, nowMs: number): string {
  const { fromMs, toMs } = dayWindow(nowMs, deps.config.utcOffsetMinutes);
  const used = deps.mirror.routedCountBetween(fromMs, toMs);
  const last = deps.mirror.latestAction();
  return [
    '<b>Keeper status</b>',
    html`State: ${deps.mirror.isPaused() ? 'PAUSED' : 'watching'}`,
    html`Cognition today: ${used}/${deps.config.dailyMindBudget} exchanges (${deps.config.priorityReserve} reserved for joins, returns and your commands)`,
    html`Members mirrored: ${deps.mirror.listMembers().length}`,
    html`Mind conversation: <code>${deps.config.mindAlias}</code>`,
    last === undefined ? 'Last action: none yet' : html`Last action: #${last.id} ${last.action} (${last.status})`,
  ].join('\n');
}
