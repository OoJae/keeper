/**
 * TELEGRAM RELAY — TYPED STUB. Deliberately not implemented.
 *
 * This file exists so that wiring never has to change if we are forced onto a
 * Telegram-shaped fallback. It implements MindTransport fully at type level and
 * throws at runtime. Read this header before writing a single line of it.
 *
 * ---------------------------------------------------------------------------
 * (1) THIS TRANSPORT SHOULD RARELY WIN — and the obvious version of it is impossible.
 *
 *     Telegram bots provably cannot see or message other bots: the Bot API drops
 *     bot-authored messages to other bots (the official anti-loop rule), and
 *     getUpdates never delivers them. A Mind appears on Telegram as a bot. Therefore
 *     "our Keeper bot talks to the Mind's bot" cannot work — not "is discouraged",
 *     cannot. The Messaging API (transports/messaging-api.ts) is the sanctioned
 *     surface for builder -> Mind traffic, and it is the one we ship. Everything
 *     below is disaster insurance for the case where the Messaging API is down or
 *     rate-limited during the demo window.
 *
 * (2) REAL IMPLEMENTATION = MTProto USER SESSION (GramJS) ON A BURNER ACCOUNT.
 *
 *     A *user* account can DM a bot, so a GramJS client signed in as a human relays
 *     text to the Mind's bot and reads its replies. Cost: a phone number, a session
 *     string treated as a credential, and standing on ToS-fragile ground — Telegram
 *     bans automated user accounts at its discretion, and losing the account mid-demo
 *     is a worse failure than the one we are insuring against. Demo fallback only.
 *     Never product. If it is ever built: dedicated burner account, session string in
 *     .env and never committed, and a hard kill switch.
 *
 * (3) HUMAN-RELAY MODE — BUILD THIS FIRST IF THE FALLBACK IS EVER NEEDED.
 *
 *     send() prints: HUMAN ACTION REQUIRED: paste "<text>" into the Mind's Telegram chat
 *     awaitReply() prompts the operator to paste the Mind's reply back on stdin.
 *     Zero code risk, zero ToS risk, no new credentials, and on a live-demo stage a
 *     human is standing there anyway. It is strictly the cheapest correct fallback,
 *     so it is ranked above (2) despite looking less impressive on a slide.
 * ---------------------------------------------------------------------------
 */

import { TransportUnavailableError } from '../errors.js';
import type {
  AwaitOpts,
  ConversationRef,
  Exchange,
  HealthReport,
  HistoryOpts,
  MindMessage,
  MindTransport,
  SendReceipt,
} from '../types.js';

/** The config the real implementation would need, accepted now so wiring is final. */
export interface TelegramRelayOptions {
  /** MTProto app id (option 2 only). */
  apiId?: number;
  /** MTProto app hash (option 2 only). */
  apiHash?: string;
  /** GramJS session string for the burner account. Treat as a credential. */
  sessionString?: string;
  /** e.g. "@keeper_steward_bot" — the Mind's Telegram handle. */
  mindBotUsername?: string;
  /** From GET /v1/minds/{mindId}.telegramBotId. */
  telegramBotId?: string | number;
}

const STUB_DETAIL =
  'stub — see file header: Telegram bots cannot message other bots; use the Messaging API. ' +
  'Fallbacks, in order: human-relay mode, then a GramJS user session on a burner account.';

export class TelegramRelayTransport implements MindTransport {
  readonly kind = 'telegram-relay' as const;

  readonly options: TelegramRelayOptions;

  constructor(options: TelegramRelayOptions = {}) {
    this.options = options;
  }

  async ensureConversation(_alias: string): Promise<ConversationRef> {
    throw this.unavailable('ensureConversation');
  }

  async send(_alias: string, _text: string): Promise<SendReceipt> {
    throw this.unavailable('send');
  }

  async awaitReply(_alias: string, _opts: AwaitOpts): Promise<MindMessage> {
    throw this.unavailable('awaitReply');
  }

  async sendAndAwaitReply(
    _alias: string,
    _text: string,
    _opts?: Partial<AwaitOpts>,
  ): Promise<Exchange> {
    throw this.unavailable('sendAndAwaitReply');
  }

  async getHistory(_alias: string, _opts?: HistoryOpts): Promise<MindMessage[]> {
    throw this.unavailable('getHistory');
  }

  async healthCheck(): Promise<HealthReport> {
    return { ok: false, class: 'UNREACHABLE', detail: STUB_DETAIL };
  }

  private unavailable(op: string): TransportUnavailableError {
    return new TransportUnavailableError('telegram-relay', `${op}() — ${STUB_DETAIL}`);
  }
}
