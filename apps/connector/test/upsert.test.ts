import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Mirror } from '../src/db/mirror.js';

let mirror: Mirror;
beforeEach(() => { mirror = Mirror.open(':memory:'); });
afterEach(() => mirror.close());

describe('touchMember survives a row appearing between read and write', () => {
  it('merges instead of throwing when the member is inserted concurrently', () => {
    // Simulates exactly the crash that took the connector down mid-seed on 2026-08-25:
    // the read said "new", something inserted the row, and the insert then violated the
    // primary key. A community steward must not die because two paths raced.
    const ID = -2384096863;
    const first = Date.UTC(2026, 7, 24, 10, 0, 0);
    const second = Date.UTC(2026, 7, 26, 10, 0, 0);

    // Pre-existing row, as if another path had just created it.
    mirror.touchMember({ telegramId: ID, handle: 'dr0pshipper_99', display: 'drop', tsMs: first, spoke: true });

    // A second touch that believes it is inserting must not throw.
    expect(() =>
      mirror.touchMember({ telegramId: ID, handle: 'dr0pshipper_99', display: 'drop', tsMs: second, spoke: true }),
    ).not.toThrow();

    const row = mirror.getMember(ID);
    expect(row?.firstSeenMs).toBe(first);  // earliest wins
    expect(row?.lastSeenMs).toBe(second);  // latest wins
    expect(row?.messageCount).toBe(2);     // both counted
  });

  it('a join arriving twice does not invent a last_seen', () => {
    const ID = -1888000004;
    const t = Date.UTC(2026, 7, 26, 10, 0, 0);
    mirror.touchMember({ telegramId: ID, handle: 'new_kid_kai', display: 'Kai', tsMs: t, spoke: false });
    mirror.touchMember({ telegramId: ID, handle: 'new_kid_kai', display: 'Kai', tsMs: t, spoke: false });
    const row = mirror.getMember(ID);
    // A join is not a conversation turn; last_seen must stay null or the member's first
    // real message would never classify as member_returned.
    expect(row?.lastSeenMs).toBeNull();
    expect(row?.messageCount).toBe(0);
  });
});
