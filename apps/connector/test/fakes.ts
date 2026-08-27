/**
 * Test doubles for the two things Keeper cannot own: Telegram and the Minds platform.
 * Both are behind narrow interfaces precisely so the tests never touch a network.
 */
import type {
  AwaitOpts,
  ConversationRef,
  Exchange,
  HealthReport,
  HistoryOpts,
  MindMessage,
  MindTransport,
  SendReceipt,
} from '@keeper/minds-client';

import type { ConnectorConfig } from '../src/config.js';
import type {
  AdminRights,
  DeleteOutcome,
  DmOutcome,
  SendOptions,
  SentMessage,
  SimpleOutcome,
  TelegramSurface,
} from '../src/telegram/surface.js';

export interface SentGroupMessage {
  chatId: number;
  html: string;
  opts: SendOptions;
  messageId: number;
}

export class FakeSurface implements TelegramSurface {
  readonly botUsername = 'keeperbot';
  readonly groupMessages: SentGroupMessage[] = [];
  readonly directMessages: Array<{ userId: number; html: string }> = [];
  readonly deleted: Array<{ chatId: number; messageId: number }> = [];
  readonly restricted: Array<{ chatId: number; userId: number; untilUnixSeconds: number }> = [];
  readonly lifted: Array<{ chatId: number; userId: number }> = [];

  dmOutcome: DmOutcome = { ok: true, messageId: 1 };
  deleteOutcome: DeleteOutcome = { ok: true };
  groupSendError: Error | null = null;
  adminRights: AdminRights = { isAdmin: true, canDeleteMessages: true, canRestrictMembers: true, detail: 'administrator' };

  private nextMessageId = 1000;

  async sendGroupMessage(chatId: number, html: string, opts: SendOptions = {}): Promise<SentMessage> {
    if (this.groupSendError !== null) throw this.groupSendError;
    const messageId = this.nextMessageId++;
    this.groupMessages.push({ chatId, html, opts, messageId });
    return { messageId };
  }

  async sendDirectMessage(userId: number, html: string): Promise<DmOutcome> {
    this.directMessages.push({ userId, html });
    return this.dmOutcome;
  }

  async deleteMessage(chatId: number, messageId: number): Promise<DeleteOutcome> {
    if (this.deleteOutcome.ok) this.deleted.push({ chatId, messageId });
    return this.deleteOutcome;
  }

  async restrictMember(chatId: number, userId: number, untilUnixSeconds: number): Promise<SimpleOutcome> {
    this.restricted.push({ chatId, userId, untilUnixSeconds });
    return { ok: true, detail: 'muted' };
  }

  async liftRestriction(chatId: number, userId: number): Promise<SimpleOutcome> {
    this.lifted.push({ chatId, userId });
    return { ok: true, detail: 'unmuted' };
  }

  async checkAdminRights(): Promise<AdminRights> {
    return this.adminRights;
  }
}

/** Replays canned Mind replies; records the envelopes it was given. */
export class FakeTransport implements MindTransport {
  readonly kind = 'messaging-api' as const;
  readonly sentEnvelopes: string[] = [];
  /** What getHistory serves, oldest first. The watcher reads this. */
  history: MindMessage[] = [];
  historyCalls = 0;
  replies: string[] = [];
  error: Error | null = null;

  constructor(reply = '') {
    if (reply !== '') this.replies = [reply];
  }

  async ensureConversation(alias: string): Promise<ConversationRef> {
    return { alias, conversationId: 'conv-test', raw: {} };
  }

  async send(alias: string, text: string): Promise<SendReceipt> {
    this.sentEnvelopes.push(text);
    return { alias, sentText: text, cursor: null, sentAt: new Date(), notBefore: null, raw: {} };
  }

  async awaitReply(): Promise<MindMessage> {
    return this.nextReply();
  }

  async sendAndAwaitReply(alias: string, text: string): Promise<Exchange> {
    if (this.error !== null) throw this.error;
    const sent = await this.send(alias, text);
    return { sent, reply: this.nextReply(), latencyMs: 42, cognitionDelta: null };
  }

  async getHistory(_alias: string, opts: { limit?: number; after?: string } = {}): Promise<MindMessage[]> {
    this.historyCalls += 1;
    if (opts.after === undefined) return [...this.history];
    const index = this.history.findIndex((m) => m.id === opts.after);
    return index === -1 ? [...this.history] : this.history.slice(index + 1);
  }

  async healthCheck(): Promise<HealthReport> {
    return { ok: true, class: 'OK', detail: 'fake' };
  }

  private nextReply(): MindMessage {
    const text = this.replies.length > 1 ? this.replies.shift() ?? '' : this.replies[0] ?? '';
    return { id: 'm1', text, sender: 'mind', at: new Date(), raw: {} };
  }
}

export function testConfig(overrides: Partial<ConnectorConfig> = {}): ConnectorConfig {
  return {
    botToken: '123456:TEST-TOKEN-not-used-by-these-tests',
    creatorTelegramId: 900,
    groupChatId: -1001,
    groupName: "Ada's Editing Lab",
    mirrorPath: ':memory:',
    seedAttribution: false,
    watchIntervalMs: 0, // tests drive sweeps explicitly; no timers
    watchMaxDispatchPerPass: 3,
    digestAtMinutes: 21 * 60,
    digestArmLeadMs: 3 * 60 * 60 * 1000,
    digestCutoffMs: 60 * 60 * 1000,
    checkinAtMinutes: 10 * 60,
    mindAlias: 'keeper-steward-test',
    mindTimeoutMs: 1000,
    utcOffsetMinutes: 480,
    dailyMindBudget: 40,
    priorityReserve: 10,
    ambientSampleRate: 12,
    queueMaxPending: 20,
    deleteWindowMs: 172_800_000,
    apiPort: 0, // tests construct the server directly; never bind a real port
    apiAdminToken: 'test-admin-token',
    dashboardOrigin: 'http://localhost:3000',
    ...overrides,
  };
}
