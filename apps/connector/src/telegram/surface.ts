/**
 * The thin seam between Keeper's logic and Telegram.
 *
 * Everything above this interface is testable without a network, a token, or grammY.
 * Everything below it is grammY. Keep the interface small: if a method needs a
 * grammY type in its signature, the abstraction has leaked.
 */
import type { Api } from 'grammy';
import { GrammyError, HttpError } from 'grammy';

export interface SendOptions {
  /** Post as a Telegram reply to this message, when it still exists. */
  replyToMessageId?: number;
}

export interface SentMessage {
  messageId: number;
}

export type DmOutcome =
  | { ok: true; messageId: number }
  /**
   * `not_started` is the one every demo hits: Telegram answers 403 "bot can't initiate
   * conversation with a user" until the creator has pressed /start once. It is a setup
   * problem, not an error, and the caller falls back to an in-group ping.
   */
  | { ok: false; reason: 'not_started' | 'blocked' | 'error'; detail: string };

export type DeleteOutcome =
  | { ok: true }
  | { ok: false; reason: 'too_old' | 'not_found' | 'forbidden' | 'error'; detail: string };

export interface SimpleOutcome {
  ok: boolean;
  detail: string;
}

export interface AdminRights {
  isAdmin: boolean;
  canDeleteMessages: boolean;
  canRestrictMembers: boolean;
  detail: string;
}

export interface TelegramSurface {
  /** Bot's own @username, without '@'. Used by the mention heuristic. */
  readonly botUsername: string;
  sendGroupMessage(chatId: number, html: string, opts?: SendOptions): Promise<SentMessage>;
  sendDirectMessage(userId: number, html: string): Promise<DmOutcome>;
  deleteMessage(chatId: number, messageId: number): Promise<DeleteOutcome>;
  restrictMember(chatId: number, userId: number, untilUnixSeconds: number): Promise<SimpleOutcome>;
  liftRestriction(chatId: number, userId: number): Promise<SimpleOutcome>;
  checkAdminRights(chatId: number): Promise<AdminRights>;
}

const NOT_STARTED_RE = /bot can't initiate conversation|bot was blocked|user is deactivated|chat not found/i;
const TOO_OLD_RE = /message can't be deleted|too old|MESSAGE_DELETE_FORBIDDEN/i;
const NOT_FOUND_RE = /message to delete not found|message identifier is not specified/i;

export class GrammyTelegramSurface implements TelegramSurface {
  constructor(
    private readonly api: Api,
    readonly botUsername: string,
    private readonly botId: number,
  ) {}

  async sendGroupMessage(chatId: number, html: string, opts: SendOptions = {}): Promise<SentMessage> {
    const params: Parameters<Api['sendMessage']>[2] = {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    };
    if (opts.replyToMessageId !== undefined) {
      // The message we are replying to may have been deleted in the meantime; Telegram
      // errors instead of degrading, so tell it not to.
      params.reply_parameters = { message_id: opts.replyToMessageId, allow_sending_without_reply: true };
    }
    const sent = await this.api.sendMessage(chatId, html, params);
    return { messageId: sent.message_id };
  }

  async sendDirectMessage(userId: number, html: string): Promise<DmOutcome> {
    try {
      const sent = await this.api.sendMessage(userId, html, {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
      });
      return { ok: true, messageId: sent.message_id };
    } catch (e) {
      const detail = describe(e);
      if (e instanceof GrammyError && (e.error_code === 403 || NOT_STARTED_RE.test(e.description))) {
        return { ok: false, reason: NOT_STARTED_RE.test(e.description) ? 'not_started' : 'blocked', detail };
      }
      return { ok: false, reason: 'error', detail };
    }
  }

  async deleteMessage(chatId: number, messageId: number): Promise<DeleteOutcome> {
    try {
      await this.api.deleteMessage(chatId, messageId);
      return { ok: true };
    } catch (e) {
      const detail = describe(e);
      if (e instanceof GrammyError) {
        if (NOT_FOUND_RE.test(e.description)) return { ok: false, reason: 'not_found', detail };
        if (TOO_OLD_RE.test(e.description)) return { ok: false, reason: 'too_old', detail };
        if (e.error_code === 403) return { ok: false, reason: 'forbidden', detail };
      }
      return { ok: false, reason: 'error', detail };
    }
  }

  async restrictMember(chatId: number, userId: number, untilUnixSeconds: number): Promise<SimpleOutcome> {
    try {
      await this.api.restrictChatMember(
        chatId,
        userId,
        { can_send_messages: false, can_send_other_messages: false, can_add_web_page_previews: false },
        { until_date: untilUnixSeconds },
      );
      return { ok: true, detail: `muted until ${new Date(untilUnixSeconds * 1000).toISOString()}` };
    } catch (e) {
      return { ok: false, detail: describe(e) };
    }
  }

  async liftRestriction(chatId: number, userId: number): Promise<SimpleOutcome> {
    try {
      await this.api.restrictChatMember(chatId, userId, {
        can_send_messages: true,
        can_send_audios: true,
        can_send_documents: true,
        can_send_photos: true,
        can_send_videos: true,
        can_send_video_notes: true,
        can_send_voice_notes: true,
        can_send_polls: true,
        can_send_other_messages: true,
        can_add_web_page_previews: true,
      });
      return { ok: true, detail: 'restrictions lifted' };
    } catch (e) {
      return { ok: false, detail: describe(e) };
    }
  }

  async checkAdminRights(chatId: number): Promise<AdminRights> {
    try {
      const me = await this.api.getChatMember(chatId, this.botId);
      if (me.status !== 'administrator') {
        return {
          isAdmin: false,
          canDeleteMessages: false,
          canRestrictMembers: false,
          detail: `bot status in chat is "${me.status}"`,
        };
      }
      return {
        isAdmin: true,
        canDeleteMessages: me.can_delete_messages === true,
        canRestrictMembers: me.can_restrict_members === true,
        detail: 'administrator',
      };
    } catch (e) {
      return { isAdmin: false, canDeleteMessages: false, canRestrictMembers: false, detail: describe(e) };
    }
  }
}

export function describe(e: unknown): string {
  if (e instanceof GrammyError) return `telegram ${e.error_code}: ${e.description}`;
  if (e instanceof HttpError) return `network: ${e.message}`;
  if (e instanceof Error) return e.message;
  return String(e);
}
