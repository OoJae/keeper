process.env['KEEPER_LOG_SILENT'] = '1';

import { describe, expect, it } from 'vitest';

import { SequentialQueue } from '../src/pipeline/queue.js';

const tick = (ms = 0): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe('SequentialQueue', () => {
  it('runs jobs for one chat strictly in order, however long each takes', async () => {
    const order: string[] = [];
    const queue = new SequentialQueue({ maxPending: 10, onError: () => {} });

    queue.enqueue('chat', async () => {
      await tick(20);
      order.push('slow');
    });
    queue.enqueue('chat', async () => {
      order.push('fast');
    });

    await queue.drain();
    expect(order).toEqual(['slow', 'fast']);
  });

  it('runs different chats concurrently', async () => {
    const order: string[] = [];
    const queue = new SequentialQueue({ maxPending: 10, onError: () => {} });
    queue.enqueue('a', async () => {
      await tick(20);
      order.push('a');
    });
    queue.enqueue('b', async () => {
      order.push('b');
    });
    await queue.drain();
    expect(order).toEqual(['b', 'a']);
  });

  it('refuses work past the backlog limit instead of growing without bound', async () => {
    const queue = new SequentialQueue({ maxPending: 2, onError: () => {} });
    expect(queue.enqueue('chat', () => tick(5))).toBe(true);
    expect(queue.enqueue('chat', () => tick(5))).toBe(true);
    expect(queue.enqueue('chat', () => tick(5))).toBe(false);
    expect(queue.pending('chat')).toBe(2);
    await queue.drain();
    expect(queue.size).toBe(0);
    expect(queue.enqueue('chat', () => tick(1))).toBe(true);
    await queue.drain();
  });

  it('reports a failing job and keeps the chain alive', async () => {
    const errors: unknown[] = [];
    const queue = new SequentialQueue({ maxPending: 5, onError: (e) => errors.push(e) });
    const order: string[] = [];
    queue.enqueue('chat', async () => {
      throw new Error('mind timed out');
    });
    queue.enqueue('chat', async () => {
      order.push('after');
    });
    await queue.drain();
    expect(errors).toHaveLength(1);
    expect(order).toEqual(['after']);
  });
});
