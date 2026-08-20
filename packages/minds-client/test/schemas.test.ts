import { describe, expect, it } from 'vitest';
import { MindsShapeError } from '../src/errors.js';
import {
  MessageRecordListSchema,
  MessageRecordSchema,
  mapSenderType,
  parseOrThrow,
  toMindMessage,
  unwrapArray,
} from '../src/schemas.js';

describe('mapSenderType', () => {
  // Undocumented enum: the official .d.ts only carries a comment (0|2 = Mind, 1 = human).
  it.each([
    [0, 'mind'],
    [2, 'mind'],
    [1, 'human'],
  ] as const)('maps %i to %s', (input, expected) => {
    expect(mapSenderType(input)).toBe(expected);
  });

  it('maps null, undefined and unrecognised codes to unknown, never to mind', () => {
    expect(mapSenderType(null)).toBe('unknown');
    expect(mapSenderType(undefined)).toBe('unknown');
    expect(mapSenderType(99)).toBe('unknown');
    expect(mapSenderType(-1)).toBe('unknown');
  });
});

describe('MessageRecordSchema', () => {
  it('preserves unknown fields through passthrough', () => {
    const raw = {
      fingerprint: 'fp-1',
      messageText: 'hello',
      senderType: 0,
      // Fields the platform may add tomorrow:
      sentimentScore: 0.42,
      worldContext: { sceneId: 'x' },
      brandNewField: 'do not drop me',
    };

    const parsed = parseOrThrow(MessageRecordSchema, 'test', raw);

    expect(parsed.fingerprint).toBe('fp-1');
    expect(parsed['sentimentScore']).toBe(0.42);
    expect(parsed['worldContext']).toEqual({ sceneId: 'x' });
    expect(parsed['brandNewField']).toBe('do not drop me');
  });

  it('tolerates a null messageText and an absent senderType', () => {
    const parsed = parseOrThrow(MessageRecordSchema, 'test', {
      fingerprint: 'fp-2',
      messageText: null,
    });
    expect(toMindMessage(parsed)).toMatchObject({ id: 'fp-2', text: null, sender: 'unknown', at: null });
  });

  it('throws MindsShapeError when the load-bearing fingerprint is missing', () => {
    const raw = { messageText: 'no fingerprint here', senderType: 0 };

    expect(() => parseOrThrow(MessageRecordSchema, 'GET /v1/messaging/histories/{alias}', raw)).toThrow(
      MindsShapeError,
    );

    try {
      parseOrThrow(MessageRecordSchema, 'GET /v1/messaging/histories/{alias}', raw);
      expect.unreachable('parseOrThrow should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(MindsShapeError);
      const err = e as MindsShapeError;
      expect(err.kind).toBe('shape');
      expect(err.endpoint).toBe('GET /v1/messaging/histories/{alias}');
      expect(err.rawBody).toBe(raw);
      expect(err.zodIssues.some((i) => i.path.join('.') === 'fingerprint')).toBe(true);
      // The banner is the debugging surface — it must carry the endpoint and the raw body.
      expect(err.toString()).toContain('SHAPE DRIFT at GET /v1/messaging/histories/{alias}');
      expect(err.toString()).toContain('no fingerprint here');
    }
  });

  it('throws MindsShapeError when a list element drifts, naming the index', () => {
    const raw = [{ fingerprint: 'ok' }, { messageText: 'broken' }];
    try {
      parseOrThrow(MessageRecordListSchema, 'GET /v1/messaging/histories/{alias}', raw);
      expect.unreachable('parseOrThrow should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(MindsShapeError);
      expect((e as MindsShapeError).zodIssues[0]?.path.join('.')).toBe('1.fingerprint');
    }
  });
});

describe('toMindMessage', () => {
  it('carries raw and parses createdAt, tolerating a garbage date', () => {
    const record = parseOrThrow(MessageRecordSchema, 'test', {
      fingerprint: 'fp-3',
      messageText: 'reply',
      senderType: 2,
      createdAt: '2026-08-20T10:00:00.000Z',
    });
    const message = toMindMessage(record);
    expect(message.sender).toBe('mind');
    expect(message.at?.toISOString()).toBe('2026-08-20T10:00:00.000Z');
    expect(message.raw).toBe(record);

    const garbage = parseOrThrow(MessageRecordSchema, 'test', {
      fingerprint: 'fp-4',
      createdAt: 'not-a-date',
    });
    expect(toMindMessage(garbage).at).toBeNull();
  });
});

describe('unwrapArray', () => {
  it('accepts a bare array or a common envelope', () => {
    expect(unwrapArray([1, 2])).toEqual([1, 2]);
    expect(unwrapArray({ data: [1] })).toEqual([1]);
    expect(unwrapArray({ items: [2] })).toEqual([2]);
    expect(unwrapArray({ nope: 1 })).toEqual({ nope: 1 });
  });
});
