/**
 * Sequential per-chat job queue.
 *
 * A Mind exchange takes 23-65s (LIVE-VERIFIED, docs/API-NOTES.md). A Telegram update
 * handler that awaits one blocks grammY's sequential update processing and eventually
 * times out the whole bot, so handlers return immediately and hand the exchange to this.
 *
 * Ordering matters within a chat — the Mind's memory is a conversation, and two
 * envelopes racing would interleave in its history. So: one chain per chat key, strictly
 * in order. Across chats, parallel. That is the entire design; Keeper runs one community
 * and does not need a job system.
 */

export interface QueueOptions {
  /** Backlog per key before new jobs are refused (and the refusal is logged). */
  maxPending: number;
  onError: (error: unknown, key: string) => void;
}

export class SequentialQueue {
  private readonly chains = new Map<string, Promise<void>>();
  private readonly depths = new Map<string, number>();

  constructor(private readonly opts: QueueOptions) {}

  /** Returns false when the backlog is full: the caller must log the drop, not retry. */
  enqueue(key: string, job: () => Promise<void>): boolean {
    const depth = this.depths.get(key) ?? 0;
    if (depth >= this.opts.maxPending) return false;
    this.depths.set(key, depth + 1);

    const previous = this.chains.get(key) ?? Promise.resolve();
    const next = previous
      .then(() => job())
      .catch((error: unknown) => {
        this.opts.onError(error, key);
      })
      .finally(() => {
        const remaining = (this.depths.get(key) ?? 1) - 1;
        if (remaining <= 0) {
          // Safe: enqueue() increments depth synchronously, so depth 0 here means
          // nothing chained on behind us.
          this.depths.delete(key);
          this.chains.delete(key);
        } else {
          this.depths.set(key, remaining);
        }
      });

    this.chains.set(key, next);
    return true;
  }

  pending(key: string): number {
    return this.depths.get(key) ?? 0;
  }

  get size(): number {
    let total = 0;
    for (const depth of this.depths.values()) total += depth;
    return total;
  }

  /** Waits for everything currently queued, including jobs queued by those jobs. */
  async drain(): Promise<void> {
    for (let i = 0; i < 1000 && this.chains.size > 0; i += 1) {
      await Promise.all([...this.chains.values()]);
    }
  }
}
