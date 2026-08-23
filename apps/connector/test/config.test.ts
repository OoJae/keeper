process.env['KEEPER_LOG_SILENT'] = '1';

import { describe, expect, it } from 'vitest';

import { ConnectorConfigError, loadConnectorConfig } from '../src/config.js';

const MINIMAL = {
  TELEGRAM_BOT_TOKEN: '7654321:AAF-abcdefghijklmnopqrstuvwxyz012345',
  CREATOR_TELEGRAM_ID: '900',
  DEMO_GROUP_ID: '-1001234567890',
};

describe('loadConnectorConfig', () => {
  it('fills sane defaults from three required values', () => {
    const config = loadConnectorConfig(MINIMAL);
    expect(config).toMatchObject({
      creatorTelegramId: 900,
      groupChatId: -1001234567890,
      dailyMindBudget: 40,
      priorityReserve: 10,
      ambientSampleRate: 12,
      utcOffsetMinutes: 480,
      mindAlias: 'keeper-steward',
      deleteWindowMs: 172_800_000,
    });
  });

  it('treats a blank value the same as an absent one', () => {
    expect(() => loadConnectorConfig({ ...MINIMAL, TELEGRAM_BOT_TOKEN: '   ' })).toThrow(ConnectorConfigError);
  });

  it('names every missing variable with the exact line to paste into .env', () => {
    try {
      loadConnectorConfig({});
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ConnectorConfigError);
      const problems = (e as ConnectorConfigError).problems.join('\n');
      expect(problems).toContain('TELEGRAM_BOT_TOKEN=');
      expect(problems).toContain('@BotFather');
      expect(problems).toContain('CREATOR_TELEGRAM_ID=');
      expect(problems).toContain('DEMO_GROUP_ID=-1001234567890');
      expect((e as Error).message).toContain('Fix your .env');
    }
  });

  it('rejects a token that is not shaped like a Telegram token', () => {
    expect(() => loadConnectorConfig({ ...MINIMAL, TELEGRAM_BOT_TOKEN: 'not-a-token' })).toThrow(
      /BotFather/,
    );
  });

  it('refuses a reserve that would starve ordinary traffic entirely', () => {
    expect(() =>
      loadConnectorConfig({ ...MINIMAL, KEEPER_DAILY_MIND_BUDGET: '10', KEEPER_PRIORITY_RESERVE: '10' }),
    ).toThrow(/strictly less than/);
  });

  it('accepts an ambient sample rate of 0 as "never sample"', () => {
    expect(loadConnectorConfig({ ...MINIMAL, KEEPER_AMBIENT_SAMPLE_RATE: '0' }).ambientSampleRate).toBe(0);
  });
});
