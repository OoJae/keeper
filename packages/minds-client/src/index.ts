/**
 * @keeper/minds-client — the ONLY path from Keeper to the Minds platform.
 *
 * Product code depends on `MindTransport` and nothing below it. Spikes may import the
 * concrete `MessagingApiTransport` for raw endpoint pokes.
 */

export {
  DEFAULT_AWAIT_TIMEOUT_MS,
  DEFAULT_HISTORY_PAGE_SIZE,
  DEFAULT_POLL_INTERVAL_MS,
  isCognitionSampler,
  type AwaitOpts,
  type CognitionSampler,
  type ConversationRef,
  type Exchange,
  type HealthClass,
  type HealthReport,
  type HistoryOpts,
  type MindMessage,
  type MindTransport,
  type SenderKind,
  type SendReceipt,
  type TransportKind,
} from './types.js';

export {
  MindReplyTimeoutError,
  MindsConfigError,
  MindsError,
  MindsHttpError,
  MindsShapeError,
  MindsUnreachableError,
  TransportUnavailableError,
  isMindsError,
  type MindsErrorKind,
} from './errors.js';

export {
  BuilderMindSchema,
  CognitionBalanceSchema,
  ConversationListSchema,
  ConversationSchema,
  MessageRecordListSchema,
  MessageRecordSchema,
  SendResponseSchema,
  mapSenderType,
  parseOrThrow,
  toMindMessage,
  unwrapArray,
  type BuilderMind,
  type CognitionBalance,
  type Conversation,
  type MessageRecord,
  type SendResponse,
} from './schemas.js';

export {
  DEFAULT_BASE_URL,
  createMindClient,
  loadMindClientConfig,
  type EnvLike,
  type MindClient,
  type MindClientConfig,
} from './config.js';

export {
  CallLog,
  withCallLog,
  type CallLogLine,
  type WithCallLogOptions,
} from './logging/call-log.js';

export {
  MessagingApiTransport,
  type AuthHeaderMode,
  type MessagingApiTransportOptions,
} from './transports/messaging-api.js';

export {
  TelegramRelayTransport,
  type TelegramRelayOptions,
} from './transports/telegram-relay.js';
