/**
 * Mind HTML -> Telegram HTML.
 *
 * LIVE-VERIFIED (docs/API-NOTES.md, 2026-08-22): the Minds platform answers in HTML
 * (`<p>…</p>`). Telegram's `parse_mode: "HTML"` accepts only a small allow-list of tags
 * and rejects the whole message with 400 `can't parse entities` on anything else — so an
 * unconverted Mind reply does not degrade, it fails to send.
 *
 * The same function is used for plain text we compose ourselves. That is deliberate:
 * one outbound path means a member who types `<b>` can never inject markup, because
 * every text run is escaped and only tags we emitted ourselves survive.
 */

/** Telegram's documented limit for sendMessage. */
export const TELEGRAM_MAX_MESSAGE_CHARS = 4096;

/** Telegram HTML allow-list, mapped to the canonical spelling we emit. */
const KEEP: Record<string, string> = {
  b: 'b',
  strong: 'b',
  i: 'i',
  em: 'i',
  u: 'u',
  ins: 'u',
  s: 's',
  strike: 's',
  del: 's',
  code: 'code',
  pre: 'pre',
  blockquote: 'blockquote',
  'tg-spoiler': 'tg-spoiler',
  a: 'a',
};

/** Tags whose boundaries are line breaks once the markup is gone. */
const BLOCK = new Set([
  'p', 'div', 'section', 'article', 'header', 'footer', 'ul', 'ol', 'li', 'tr', 'table',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'br',
]);

/** Dropped wholesale, contents and all. */
const DROP_CONTENT_RE = /<(script|style|template|head)\b[\s\S]*?<\/\1\s*>/gi;

const TOKEN_RE = /<!--[\s\S]*?-->|<\/?[a-zA-Z][a-zA-Z0-9-]*(?:\s[^>]*)?\/?>/g;
const TAG_NAME_RE = /^<\/?\s*([a-zA-Z][a-zA-Z0-9-]*)/;
const HREF_RE = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s">]+))/i;

const SAFE_URL_RE = /^(https?:\/\/|tg:\/\/|mailto:)/i;

/**
 * Tagged template for text WE compose: the literal parts are trusted markup, every
 * interpolation is escaped. Member text and Mind reasoning arrive as values, so
 * `html`Restored: ${memberText}`` can never smuggle a tag into the group.
 *
 * Pass the result through {@link toTelegramHtml} to clamp and tidy it — that function is
 * idempotent on its own output, so the double pass costs nothing and cannot double-escape.
 */
export function html(strings: TemplateStringsArray, ...values: unknown[]): string {
  let out = strings[0] ?? '';
  for (let i = 0; i < values.length; i += 1) {
    out += escapeText(String(values[i] ?? '')) + (strings[i + 1] ?? '');
  }
  return out;
}

export function escapeText(raw: string): string {
  return raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * `&amp;` is decoded LAST so that `&amp;lt;` becomes the literal text `&lt;` and not a
 * `<`. Getting that order wrong is how an escaped tag turns back into a real one.
 */
export function decodeEntities(raw: string): string {
  return raw
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex: string) => codePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec: string) => codePoint(parseInt(dec, 10)))
    .replace(/&amp;/gi, '&');
}

function codePoint(n: number): string {
  if (!Number.isFinite(n) || n < 0 || n > 0x10ffff) return '';
  try {
    return String.fromCodePoint(n);
  } catch {
    return '';
  }
}

/** Strip every tag; used for the over-length fallback and for log excerpts. */
export function htmlToPlainText(input: string): string {
  const withoutDropped = input.replace(DROP_CONTENT_RE, '');
  const withBreaks = withoutDropped
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*\/\s*(p|div|li|tr|h[1-6]|blockquote|ul|ol)\s*>/gi, '\n')
    .replace(/<\s*li\b[^>]*>/gi, '\n• ');
  return collapse(decodeEntities(withBreaks.replace(TOKEN_RE, '')));
}

function collapse(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function sanitizeHref(tag: string): string | null {
  const m = HREF_RE.exec(tag);
  if (m === null) return null;
  const raw = decodeEntities((m[1] ?? m[2] ?? m[3] ?? '').trim());
  if (raw === '' || !SAFE_URL_RE.test(raw)) return null;
  return raw.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Converts Mind HTML (or plain text) into something Telegram will accept with
 * `parse_mode: "HTML"`. Never throws; on anything it cannot model it falls back to
 * escaped plain text, because a plain message that sends beats a rich one that 400s.
 */
export function toTelegramHtml(input: string, maxChars = TELEGRAM_MAX_MESSAGE_CHARS): string {
  if (typeof input !== 'string' || input.trim() === '') return '';

  const source = input.replace(DROP_CONTENT_RE, '');
  const out: string[] = [];
  const open: string[] = [];
  let cursor = 0;

  const pushText = (raw: string): void => {
    if (raw === '') return;
    out.push(escapeText(decodeEntities(raw)));
  };

  TOKEN_RE.lastIndex = 0;
  for (let m = TOKEN_RE.exec(source); m !== null; m = TOKEN_RE.exec(source)) {
    pushText(source.slice(cursor, m.index));
    cursor = m.index + m[0].length;

    const tag = m[0];
    if (tag.startsWith('<!--')) continue;

    const nameMatch = TAG_NAME_RE.exec(tag);
    const name = (nameMatch?.[1] ?? '').toLowerCase();
    const closing = /^<\s*\//.test(tag);

    if (name === 'br') {
      out.push('\n');
      continue;
    }
    if (name === 'li') {
      // The opener carries the bullet; the closer must not add a second break or every
      // list item ends up separated by a blank line.
      if (!closing) out.push('\n• ');
      continue;
    }

    const kept = KEEP[name];
    if (kept === undefined) {
      // Unknown/disallowed tag: drop the markup, keep the text, break the line if it
      // was a block element so paragraphs do not run together.
      if (BLOCK.has(name)) out.push('\n');
      continue;
    }

    if (closing) {
      const idx = open.lastIndexOf(kept);
      if (idx === -1) continue; // stray closer: Telegram would reject it
      // Close anything opened inside it too, innermost first.
      for (let i = open.length - 1; i >= idx; i -= 1) out.push(`</${open[i]}>`);
      open.splice(idx, 1);
      // Re-open the ones we closed only to unwind; simplest correct behaviour is to
      // leave them closed — Mind replies do not rely on overlapping markup.
      continue;
    }

    if (kept === 'a') {
      const href = sanitizeHref(tag);
      if (href === null) continue; // unsafe/absent href: render the label as plain text
      out.push(`<a href="${href}">`);
      open.push('a');
      continue;
    }

    out.push(`<${kept}>`);
    open.push(kept);
  }

  pushText(source.slice(cursor));
  for (let i = open.length - 1; i >= 0; i -= 1) out.push(`</${open[i]}>`);

  const rendered = collapseHtml(out.join(''));
  if (rendered.length <= maxChars) return rendered;

  // Truncating inside markup would produce unbalanced tags and a 400 from Telegram.
  // Degrade to escaped plain text instead — boring, and it always sends.
  return truncateEscaped(escapeText(htmlToPlainText(input)), maxChars);
}

/** Whitespace tidy-up that must not touch the inside of a tag. */
function collapseHtml(html: string): string {
  const parts: string[] = [];
  let cursor = 0;
  TOKEN_RE.lastIndex = 0;
  for (let m = TOKEN_RE.exec(html); m !== null; m = TOKEN_RE.exec(html)) {
    parts.push(collapseRun(html.slice(cursor, m.index)));
    parts.push(m[0]);
    cursor = m.index + m[0].length;
  }
  parts.push(collapseRun(html.slice(cursor)));
  return parts.join('').replace(/^\s+/, '').replace(/\s+$/, '');
}

function collapseRun(text: string): string {
  return text.replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ');
}

function truncateEscaped(escaped: string, maxChars: number): string {
  if (escaped.length <= maxChars) return escaped;
  // Never cut through an entity: `&am` would render literally and look broken.
  const cut = escaped.slice(0, Math.max(0, maxChars - 1)).replace(/&[a-z#0-9]*$/i, '');
  return `${cut}…`;
}
