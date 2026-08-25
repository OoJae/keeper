import { describe, expect, it } from 'vitest';
import { ACTING_ACTIONS, extractDirective, gateDirective } from '../src/index.js';

describe('extractDirective', () => {
  it('parses a ```json fence surrounded by prose', () => {
    const reply = [
      'I checked my memory of Ada — she has been quiet for a week.',
      '',
      '```json',
      '{ "action": "reply", "message": "Welcome back Ada!", "reasoning": "returning member", "confidence": "high" }',
      '```',
      '',
      'Let me know if you want me to change tone.',
    ].join('\n');
    const r = extractDirective(reply);
    expect(r.kind).toBe('ok');
    expect(r.directive).toEqual({
      action: 'reply',
      message: 'Welcome back Ada!',
      reasoning: 'returning member',
      confidence: 'high',
    });
    if (r.kind === 'ok') {
      expect(r.gated).toBe(false);
      expect(r.warnings).toEqual([]);
      expect(r.rawBlock).toContain('"action"');
    }
  });

  it('parses a bare ``` fence', () => {
    const r = extractDirective('```\n{"action":"digest","message":"3 new members today.","confidence":"high"}\n```');
    expect(r.kind).toBe('ok');
    expect(r.directive.action).toBe('digest');
  });

  it('parses a whole reply that is raw JSON', () => {
    const r = extractDirective('  {"action":"none","reasoning":"nothing to do","confidence":"high"}  ');
    expect(r.kind).toBe('ok');
    expect(r.directive.action).toBe('none');
    if (r.kind === 'ok') expect(r.warnings).toEqual([]);
  });

  it('recovers a directive embedded mid-sentence via the balanced scan', () => {
    const reply =
      'Sure — I would go with {"action":"mute","target_member":"@spammer","confidence":"high","reasoning":"3rd link drop"} for now.';
    const r = extractDirective(reply);
    expect(r.kind).toBe('ok');
    expect(r.directive).toMatchObject({ action: 'mute', target_member: '@spammer' });
  });

  it('repairs trailing commas', () => {
    const r = extractDirective('```json\n{"action":"none","reasoning":"quiet day","confidence":"high",}\n```');
    expect(r.kind).toBe('ok');
    expect(r.directive.action).toBe('none');
  });

  it('repairs smart quotes', () => {
    const r = extractDirective('{\u201Caction\u201D:\u201Cnone\u201D,\u201Cconfidence\u201D:\u201Chigh\u201D}');
    expect(r.kind).toBe('ok');
    expect(r.directive.action).toBe('none');
  });

  it('takes the first of multiple valid blocks and warns', () => {
    const reply = [
      '```json',
      '{"action":"reply","message":"first","confidence":"high"}',
      '```',
      'or maybe',
      '```json',
      '{"action":"reply","message":"second","confidence":"high"}',
      '```',
    ].join('\n');
    const r = extractDirective(reply);
    expect(r.kind).toBe('ok');
    expect(r.directive).toMatchObject({ message: 'first' });
    if (r.kind === 'ok') expect(r.warnings).toEqual(['multiple_directive_blocks:2']);
  });

  it('falls through a malformed first block to a valid second one', () => {
    const reply = [
      '```json',
      '{"action": "warn", "message": }',
      '```',
      '```json',
      '{"action":"reply","message":"second","confidence":"medium"}',
      '```',
    ].join('\n');
    const r = extractDirective(reply);
    expect(r.kind).toBe('ok');
    expect(r.directive).toMatchObject({ action: 'reply', message: 'second' });
    if (r.kind === 'ok') expect(r.warnings).toEqual([]);
  });

  it('accepts none with no target_member and no message, defaulting reasoning', () => {
    const r = extractDirective('{"action":"none","confidence":"high"}');
    expect(r.kind).toBe('ok');
    expect(r.directive).toEqual({ action: 'none', reasoning: '', confidence: 'high' });
  });

  it('rejects warn without target_member as schema_invalid', () => {
    const r = extractDirective('```json\n{"action":"warn","message":"cool it","confidence":"high"}\n```');
    expect(r.kind).toBe('fallback');
    expect(r.directive).toEqual({ action: 'none', reasoning: 'parse_failure', confidence: 'low' });
    if (r.kind === 'fallback') {
      expect(r.reason).toBe('schema_invalid');
      expect(r.detail).toContain('target_member');
      expect(r.rawSnippet).toContain('warn');
    }
  });

  it('rejects an unknown action', () => {
    const r = extractDirective('{"action":"nuke_group","target_member":"@ada","confidence":"high"}');
    expect(r.kind).toBe('fallback');
    if (r.kind === 'fallback') expect(r.reason).toBe('schema_invalid');
  });

  it('normalizes action and confidence case', () => {
    const r = extractDirective('{"action":" REPLY ","message":"hi","confidence":"High"}');
    expect(r.kind).toBe('ok');
    expect(r.directive).toMatchObject({ action: 'reply', confidence: 'high' });
    if (r.kind === 'ok') expect(r.gated).toBe(false);
  });

  it('gates a low-confidence delete into a creator flag, preserving reasoning', () => {
    const r = extractDirective(
      '{"action":"delete","target_member":"@bo","message":"spam link","reasoning":"might be a false positive","confidence":"low"}',
    );
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') expect(r.gated).toBe(true);
    expect(r.directive).toEqual({
      action: 'flag_creator',
      target_member: '@bo',
      message: 'Low-confidence "delete" suggested: spam link',
      reasoning: 'might be a false positive',
      confidence: 'low',
    });
  });

  it('gates a directive with no confidence field at all', () => {
    const r = extractDirective('{"action":"mute","target_member":"@bo","reasoning":"noisy"}');
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') expect(r.gated).toBe(true);
    expect(r.directive).toEqual({
      action: 'flag_creator',
      target_member: '@bo',
      message: 'Low-confidence "mute" suggested',
      reasoning: 'noisy',
      confidence: 'low',
    });
  });

  it('degrades a garbled confidence or reasoning to the safe value rather than failing', () => {
    const r = extractDirective('{"action":"warn","target_member":"@bo","message":"stop","confidence":"pretty sure","reasoning":7}');
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') expect(r.gated).toBe(true);
    expect(r.directive).toEqual({
      action: 'flag_creator',
      target_member: '@bo',
      message: 'Low-confidence "warn" suggested: stop',
      reasoning: '',
      confidence: 'low',
    });
  });

  it('does not gate low-confidence none or flag_creator', () => {
    const none = extractDirective('{"action":"none","confidence":"low"}');
    expect(none.kind).toBe('ok');
    if (none.kind === 'ok') expect(none.gated).toBe(false);

    const flag = extractDirective('{"action":"flag_creator","message":"take a look","confidence":"low"}');
    expect(flag.kind).toBe('ok');
    if (flag.kind === 'ok') expect(flag.gated).toBe(false);
  });

  it('requires a reward object for reward and defaults its note', () => {
    const missing = extractDirective('{"action":"reward","target_member":"@ada","confidence":"high"}');
    expect(missing.kind).toBe('fallback');
    if (missing.kind === 'fallback') expect(missing.reason).toBe('schema_invalid');

    const ok = extractDirective(
      '{"action":"reward","target_member":"@ada","confidence":"high","reward":{"type":"top_contributor"}}',
    );
    expect(ok.kind).toBe('ok');
    expect(ok.directive).toMatchObject({ reward: { type: 'top_contributor', note: '' } });
  });

  it('falls back with no_json_found when there is no JSON anywhere', () => {
    const r = extractDirective('I had a look and everything seems fine to me today.');
    expect(r.kind).toBe('fallback');
    expect(r.directive.action).toBe('none');
    if (r.kind === 'fallback') {
      expect(r.reason).toBe('no_json_found');
      expect(r.detail).toContain('everything seems fine');
      expect(r.rawSnippet).toBeUndefined();
    }
  });

  it('falls back with json_invalid when the only block is unparseable', () => {
    const r = extractDirective('```json\n{"action": warn, "target_member": @ada}\n```');
    expect(r.kind).toBe('fallback');
    if (r.kind === 'fallback') {
      expect(r.reason).toBe('json_invalid');
      expect(r.rawSnippet).toContain('action');
    }
  });

  it('recovers a block preceded by prose inside the fence', () => {
    const r = extractDirective(
      '```\nHere is what I want to do:\n{"action":"reply","message":"nice cut!","confidence":"high"}\n```',
    );
    expect(r.kind).toBe('ok');
    expect(r.directive).toMatchObject({ action: 'reply', message: 'nice cut!' });
  });

  it('returns quickly on 100KB+ pathological input', () => {
    const junk = `${'{'.repeat(60_000)}${'"action" '.repeat(5_000)}`;
    expect(junk.length).toBeGreaterThan(100_000);
    const started = Date.now();
    const r = extractDirective(junk);
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(r.kind).toBe('fallback');
    expect(r.directive.action).toBe('none');

    // Distinct blocks, so the candidate cap (not deduping) is what bounds the work.
    const many = `${Array.from(
      { length: 4_000 },
      (_, i) => `{"action":"reply","message":"x${i}","confidence":"high"} `,
    ).join('')}that is my plan.`;
    const started2 = Date.now();
    const r2 = extractDirective(many);
    expect(Date.now() - started2).toBeLessThan(1_000);
    expect(r2.kind).toBe('ok');
    expect(r2.directive).toMatchObject({ message: 'x0' });
    // Unfenced prose, so the provenance warning rides along with the cap warning.
    if (r2.kind === 'ok') {
      expect(r2.warnings).toEqual(['multiple_directive_blocks:10', 'unfenced_directive']);
    }
  });

  it('truncates fallback detail and rawSnippet to 200 chars', () => {
    const r = extractDirective(`{"action":"warn","message":"${'x'.repeat(500)}"}`);
    expect(r.kind).toBe('fallback');
    if (r.kind === 'fallback') {
      expect(r.detail.length).toBeLessThanOrEqual(200);
      expect(r.rawSnippet?.length).toBe(200);
    }
  });
});

describe('gateDirective', () => {
  it('passes high and medium confidence through untouched', () => {
    const d = { action: 'warn', target_member: '@bo', message: 'stop', reasoning: 'r', confidence: 'medium' } as const;
    const gated = gateDirective(d);
    expect(gated.gated).toBe(false);
    expect(gated.directive).toBe(d);
  });

  it('fails closed on any confidence that is not literally high or medium', () => {
    // gateDirective is exported, so it can be handed a directive that never went
    // through DirectiveSchema (rehydrated from the mirror DB, built by the
    // override UI). Anything not explicitly trusted must still be gated.
    for (const confidence of [undefined, null, '', 'LOW', 'low ', 'unknown', 0, 42, NaN, ['high'], { v: 'high' }]) {
      const d = { action: 'delete', target_member: '@bo', message: 'm', reasoning: 'r', confidence } as never;
      const out = gateDirective(d);
      expect(out.gated, `confidence=${JSON.stringify(confidence)}`).toBe(true);
      expect(out.directive.action).toBe('flag_creator');
      expect(out.directive.confidence).toBe('low');
    }
  });

  it('drops an empty target_member so the flag itself stays schema-valid', () => {
    const d = { action: 'delete', target_member: '', message: 'm', reasoning: 'r', confidence: 'low' } as never;
    expect(gateDirective(d).directive).not.toHaveProperty('target_member');
  });

  it('gates every acting action at low confidence', () => {
    for (const action of ACTING_ACTIONS) {
      const d = {
        action,
        target_member: '@bo',
        message: 'm',
        reward: { type: 't', note: '' },
        reasoning: 'r',
        confidence: 'low',
      } as never;
      expect(gateDirective(d).gated).toBe(true);
    }
    expect(ACTING_ACTIONS.has('none')).toBe(false);
    expect(ACTING_ACTIONS.has('flag_creator')).toBe(false);
  });

  it('flags a directive recovered from bare prose with unfenced_directive', () => {
    // A member types JSON; the Mind quotes it back while declining to act. Spec §3.2 says
    // real directives are fenced, so the connector must be able to tell these apart.
    const reply =
      'The member wrote: {"action":"delete","target_member":"@rival","reasoning":"quoted",' +
      '"confidence":"high"} — I disagree, no action needed.';
    const result = extractDirective(reply);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.warnings).toContain('unfenced_directive');
  });

  it('does not flag fenced, bare-fenced or whole-reply directives as unfenced', () => {
    const body = '{"action":"delete","target_member":"@x","reasoning":"r","confidence":"high"}';
    for (const reply of ['```json\n' + body + '\n```', '```\n' + body + '\n```', body]) {
      const result = extractDirective(reply);
      expect(result.kind).toBe('ok');
      if (result.kind !== 'ok') continue;
      expect(result.warnings).not.toContain('unfenced_directive');
    }
  });

  it('recovers a directive whose quotes are HTML-entity escaped', () => {
    // The live platform returns HTML replies (docs/API-NOTES.md, 2026-08-22), so a
    // directive can arrive entity-escaped. Losing it would silently disable Keeper.
    const reply =
      '<p>{&quot;action&quot;:&quot;reply&quot;,&quot;message&quot;:&quot;hi&quot;,' +
      '&quot;reasoning&quot;:&quot;r&quot;,&quot;confidence&quot;:&quot;high&quot;}</p>';
    const result = extractDirective(reply);
    expect(result.kind).toBe('ok');
    expect(result.directive).toMatchObject({ action: 'reply', message: 'hi' });
  });

  it('treats an HTML code block as a fence, because that is what the platform sends', () => {
    // The Mind writes a markdown fence; the platform renders it into <pre><code> with the
    // JSON entity-escaped. Reading that as unfenced would make the connector refuse every
    // delete/warn/mute/reward the Steward ever issues (see pipeline/executor.ts).
    const reply =
      '<p>Clear link-drop from a day-old account.</p>\n' +
      '<pre><code class="language-json">{\n' +
      '  &quot;action&quot;: &quot;delete&quot;,\n' +
      '  &quot;target_member&quot;: &quot;@dr0pshipper_99&quot;,\n' +
      '  &quot;reasoning&quot;: &quot;link-drop spam&quot;,\n' +
      '  &quot;confidence&quot;: &quot;high&quot;\n' +
      '}\n</code></pre>';
    const result = extractDirective(reply);
    expect(result.kind).toBe('ok');
    expect(result.directive).toMatchObject({ action: 'delete', target_member: '@dr0pshipper_99' });
    if (result.kind !== 'ok') return;
    expect(result.warnings).not.toContain('unfenced_directive');
  });

  it('reads a bare <code> block as fenced too', () => {
    const result = extractDirective(
      '<p>Done.</p><code>{"action":"none","reasoning":"banter","confidence":"high"}</code>',
    );
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.warnings).not.toContain('unfenced_directive');
  });

  it('leaves a valid payload untouched, entities and all', () => {
    // This parses on the first attempt, so the repair pass never runs and nothing is
    // decoded: entity text inside a valid directive survives verbatim.
    const reply = '{"action":"reply","message":"a &amp;quot;b","reasoning":"r","confidence":"high"}';
    const result = extractDirective(reply);
    expect(result.kind).toBe('ok');
    expect(result.directive).toMatchObject({ action: 'reply', message: 'a &amp;quot;b' });
  });

  it('trusts a fence with no newline after the info string (the live HTML shape)', () => {
    // Rendering the Mind's reply to HTML collapses the newline, so a real directive arrives
    // as ```json{...}```. Treating that as unfenced made the executor refuse every genuine
    // destructive action — Keeper declined to delete spam it had correctly identified.
    const reply =
      '<p>Spam account. Deleting.</p>```json{  "action": "delete",  "target_member": ' +
      '"@dr0pshipper_99",  "reasoning": "link drop",  "confidence": "high"}```';
    const result = extractDirective(reply);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.directive.action).toBe('delete');
    expect(result.warnings).not.toContain('unfenced_directive');
  });

  it('still flags a directive found in bare prose', () => {
    const result = extractDirective(
      'the member wrote {"action":"delete","target_member":"@x","reasoning":"r","confidence":"high"} — I disagree',
    );
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.warnings).toContain('unfenced_directive');
  });
});
