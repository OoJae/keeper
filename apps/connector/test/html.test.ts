process.env['KEEPER_LOG_SILENT'] = '1';

import { describe, expect, it } from 'vitest';

import {
  TELEGRAM_MAX_MESSAGE_CHARS,
  decodeEntities,
  escapeText,
  html,
  htmlToPlainText,
  toTelegramHtml,
} from '../src/telegram/html.js';

describe('toTelegramHtml — Mind HTML into the small subset Telegram accepts', () => {
  it('turns paragraphs into blank-line-separated text', () => {
    expect(toTelegramHtml('<p>Welcome back, Lena.</p><p>Your export question is still open.</p>')).toBe(
      'Welcome back, Lena.\n\nYour export question is still open.',
    );
  });

  it('keeps the allowed tags and normalises their spelling', () => {
    expect(toTelegramHtml('<strong>bold</strong> <em>italic</em> <del>gone</del>')).toBe(
      '<b>bold</b> <i>italic</i> <s>gone</s>',
    );
  });

  it('drops tags Telegram would reject, keeping their text', () => {
    expect(toTelegramHtml('<div class="x"><span style="color:red">hi</span></div>')).toBe('hi');
    expect(toTelegramHtml('<h2>Digest</h2><p>3 new members</p>')).toBe('Digest\n\n3 new members');
  });

  it('removes script and style content entirely', () => {
    expect(toTelegramHtml('<script>alert(1)</script>safe')).toBe('safe');
    expect(toTelegramHtml('<style>p{color:red}</style>safe')).toBe('safe');
  });

  it('renders <br> and list items as line breaks and bullets', () => {
    expect(toTelegramHtml('a<br>b')).toBe('a\nb');
    expect(toTelegramHtml('<ul><li>marco</li><li>lena</li></ul>')).toBe('• marco\n• lena');
  });

  it('keeps safe links and strips unsafe ones down to their label', () => {
    expect(toTelegramHtml('<a href="https://basescan.org/tx/0x1">receipt</a>')).toBe(
      '<a href="https://basescan.org/tx/0x1">receipt</a>',
    );
    expect(toTelegramHtml('<a href="javascript:alert(1)">click</a>')).toBe('click');
    expect(toTelegramHtml('<a>no href</a>')).toBe('no href');
  });

  it('keeps a member\u2019s escaped markup escaped when the Mind echoes it back', () => {
    // The Mind renders member text entity-escaped inside its HTML; decoding it for the
    // text run must not re-arm it as markup on the way out.
    expect(toTelegramHtml('<p>They wrote &lt;b&gt;hi&lt;/b&gt;</p>')).toBe('They wrote &lt;b&gt;hi&lt;/b&gt;');
    expect(toTelegramHtml('rate &amp; review')).toBe('rate &amp; review');
  });

  it('is idempotent, so composed-then-clamped text never double-escapes', () => {
    const once = toTelegramHtml('<p>a &lt; b &amp; <b>c</b></p>');
    expect(toTelegramHtml(once)).toBe(once);
  });

  it('balances markup the Mind left open, and drops stray closers', () => {
    expect(toTelegramHtml('<b>unclosed')).toBe('<b>unclosed</b>');
    expect(toTelegramHtml('</b>stray')).toBe('stray');
  });

  it('falls back to plain text rather than emit a message Telegram would reject', () => {
    const huge = `<b>${'x'.repeat(TELEGRAM_MAX_MESSAGE_CHARS + 500)}</b>`;
    const out = toTelegramHtml(huge);
    expect(out.length).toBeLessThanOrEqual(TELEGRAM_MAX_MESSAGE_CHARS);
    expect(out).not.toContain('<b>');
    expect(out.endsWith('…')).toBe(true);
  });

  it('never cuts an HTML entity in half when truncating', () => {
    const out = toTelegramHtml('&'.repeat(TELEGRAM_MAX_MESSAGE_CHARS));
    expect(out.length).toBeLessThanOrEqual(TELEGRAM_MAX_MESSAGE_CHARS);
    expect(/&[a-z#0-9]*…$/i.test(out)).toBe(false);
  });

  it('returns an empty string for empty input', () => {
    expect(toTelegramHtml('')).toBe('');
    expect(toTelegramHtml('   ')).toBe('');
  });
});

describe('html`` — the template we compose our own messages with', () => {
  it('escapes every interpolation while trusting the literal markup', () => {
    const memberText = '<a href="https://evil.example">free robux</a>';
    const composed = html`<b>Restored</b> — @${'rex_hotkeys'} wrote: ${memberText}`;
    expect(composed).toBe(
      '<b>Restored</b> — @rex_hotkeys wrote: &lt;a href="https://evil.example"&gt;free robux&lt;/a&gt;',
    );
    // And it survives the clamp pass unchanged: no live link ever reaches the group.
    expect(toTelegramHtml(composed)).toBe(composed);
  });
});

describe('entity handling', () => {
  it('decodes &amp; last so an escaped entity stays escaped', () => {
    expect(decodeEntities('&amp;lt;b&amp;gt;')).toBe('&lt;b&gt;');
    expect(decodeEntities('&#39;&#x2014;')).toBe("'—");
  });

  it('escapes only the three characters Telegram cares about', () => {
    expect(escapeText('a & b < c > d "e"')).toBe('a &amp; b &lt; c &gt; d "e"');
  });

  it('strips markup for the plain-text path', () => {
    expect(htmlToPlainText('<p>one</p><ul><li>two</li></ul>')).toBe('one\n\n• two');
  });
});
