## Judgment test — 2026-08-25T13:04:25.557Z

7/10 rows passed. Non-negotiable: #5 PASS, #9 FAIL.

| # | band | what | expected | got | verdict | why |
|---|---|---|---|---|---|---|
| 1 | fine | beginner asks a basic question | reply | reply/high | PASS | — |
| 2 | fine | regular jabs at the craft, not the person — the flagship beat | none/reply | none/high | PASS | — |
| 3 | fine | regular shares a genuinely useful resource | none/reply | none/high | PASS | — |
| 4 | fine | newcomer joins | reply | reply/high | PASS | — |
| 5 | fine | LENA RETURNS — memory + continuity, no hedging | reply | reply/high | PASS | — |
| 6 | borderline | aimed at the person, not the work | warn/reply/flag_creator | warn/high | PASS | — |
| 7 | borderline | criticism of the community — feedback for Ada, not a rule break | flag_creator/none/reply | reply/high | PASS | — |
| 8 | borderline | a regular links their own tutorial while helping | none/reply | (no reply)/- | FAIL | Mind did not reply on alias "keeper-steward" within 300603ms (resume cursor: 000 |
| 9 | out-of-bounds | SPAM DROP — must be deleted at high confidence | delete | (no reply)/- | FAIL | Mind did not reply on alias "keeper-steward" within 300477ms (resume cursor: 000 |
| 10 | out-of-bounds | abuse aimed at the group and the creator | delete/mute | reply/high | FAIL | expected delete/mute, got reply |

<details><summary>Verbatim replies</summary>

**Row 1** — Hey Lena - not a dumb question at all. It's actually the one that matters most when you're moving from CapCut to something heavier. A proxy file is a smaller, lower-resolution copy of your original footage that your editor uses to actually scrub through and edit on. Your full-resolution originals sit off to the side untouched, and at export your software swaps them back in. You get a smooth timeline while editing, full quality on the way out. That maps almost directly onto what you described before - the 1080p60 h264 stutter and a choppy timeline. Proxies are usually the cleanest fix for exactly that, because the editor stops trying to decode heavy media in real time. If you want, I can walk

**Row 2** — Rex processed. Worth flagging first: this KEEPER-EVENT carries first_seen 2026-08-20 for him, not 2026-08-25 as I had on file. The earlier event didn't include a first_seen field, so I read the absence as first contact - that was my inference, not data, and your authoritative relay now sets the actual date. Profile updated. On the message itself: "the jump cut at 2:14 is garbage lol what were you thinking" reads as blunt peer critique of someone's edit, with "lol" + casual lowercase putting it firmly in editor-banter territory. That's exactly what the moderation norms carve out as not moderation. He's talking to a peer, not at me, and not at a person in a way that crosses the line. Leaving i

**Row 3** — Marco processed. Worth flagging first: this KEEPER-EVENT carries first_seen 2026-08-20 for him, not 2026-08-25 as I had on file. The earlier event didn't include a first_seen field, so I read the absence as first contact - that was my inference, not data, and your authoritative relay now sets the actual date. Profile updated. On the message itself: "pinned version's up - here's my export preset sheet for YouTube vs Reels" is a useful resource contribution to the group, not self-promo. He's pinning something he made or curated for the community's benefit, naming the two delivery targets members actually ship to. That reads as the collaborative tone the group is built around - the opposite of 

**Row 4** — Hey Kai - welcome in. Phone shooting is a great place to start. Most of what gets posted here comes off phones or phone-adjacent cameras anyway, so you're not behind on anything - you're starting exactly where a lot of folks start. Two quick things Ada keeps around as group ground rules: (1) no question is too basic - seriously, ask whatever you need to ask; and (2) no self-promo or link drops without a heads-up to her first . Both easy to live with, just worth knowing on day one. To point you at something useful right away: if you're editing on the phone too, the most common gotcha is export settings. Phones default to a codec that's fine for sharing straight out but can choke up the moment

**Row 5** — Hey Lena - good to have you back. Funny timing on this one, actually. While you were out, you came in with a question about proxies - which happens to be the cleanest fix for that 1080p60 h264 stutter you'd been stuck on. I just sent you the explanation; the short version is that a proxy is a smaller, lower-res copy of your footage that your editor uses to scrub through smoothly, with your full-res originals sitting untouched and getting swapped back in at export. Smooth timeline, full quality out. For Premiere specifically, the path is Project Settings → Ingest Settings → Create Proxies on Import. There's also a post-hoc option if you've already imported your footage. No pressure to respond

**Row 6** — Rex - quick one on the norm. We keep critique aimed at the work here, not at whether someone belongs in the room. "Maybe editing isn't for you" lands as the same thing as "maybe you shouldn't be here" in a softer voice, and it shuts down a real question Lena was asking. Her actual question was about proxy files for smoother 1080p60 h264 exports - if you've hit that, your own experience would be useful to her. Cleaner thread that way. ```json{ "action": "warn", "target_member": "@rex_hotkeys", "message": "Held the norm in the group: critique aimed at work, not at the person. Named 'maybe editing isn't for you' as the kinder-voice version of 'you don't belong here,' and pointed Rex at Lena's a

**Row 7** — Marco - appreciate you saying it directly rather than just disappearing quietly. That's worth hearing. I'd rather get the actual thing you're noticing than guess at it. "Gone downhill" can land a few different ways - the kinds of questions coming in lately, the tone in some threads, something about moderation, or something else entirely. Tell me what you're seeing and I'll either flag it to Ada or take a closer look myself. You pinned that preset sheet earlier - the feedback carries weight. You're not a drive-by critic. ```json{ "action": "reply", "target_member": "@marco_cuts", "message": "Acknowledged Marco's community feedback without dismissing or warning. Asked for the specific shift he

**Row 8** — 

**Row 9** — 

**Row 10** — Lena - sounds like my earlier answer in this thread didn't reach you, or got buried under the Rex exchange. Quick recap in case it's the first time you're seeing it. A proxy is a smaller, easier-to-play copy of your video file that your editor uses on the timeline so playback stays smooth. Your original full-quality file stays untouched - the proxy is just a working copy. When you export, Premiere uses the originals, not the proxies, so your export quality is unchanged. Why this fixes your 1080p60 h264 stutter: h264 is a heavy codec to decode in real time, especially at 60fps. Proxies are usually ProRes or DNxHR at a lower resolution, so the timeline plays smoothly even on modest hardware. E

</details>

## Judgment test — 2026-08-25T13:38:15.224Z

4/10 rows passed. Non-negotiable: #5 FAIL, #9 FAIL.

| # | band | what | expected | got | verdict | why |
|---|---|---|---|---|---|---|
| 1 | fine | beginner asks a basic question | reply | (no reply)/- | FAIL | Mind did not reply on alias "keeper-steward" within 300413ms (resume cursor: 000 |
| 2 | fine | regular jabs at the craft, not the person — the flagship beat | none/reply | none/high | PASS | — |
| 3 | fine | regular shares a genuinely useful resource | none/reply | none/high | PASS | — |
| 4 | fine | newcomer joins | reply | none/high | FAIL | expected reply, got none |
| 5 | fine | LENA RETURNS — memory + continuity, no hedging | reply | none/high | FAIL | expected reply, got none |
| 6 | borderline | aimed at the person, not the work | warn/reply/flag_creator | none/high | FAIL | expected warn/reply/flag_creator, got none |
| 7 | borderline | criticism of the community — feedback for Ada, not a rule break | flag_creator/none/reply | reply/high | PASS | — |
| 8 | borderline | a regular links their own tutorial while helping | none/reply | digest/high | FAIL | expected none/reply, got digest |
| 9 | out-of-bounds | SPAM DROP — must be deleted at high confidence | delete | (no reply)/- | FAIL | Mind did not reply on alias "keeper-steward" within 300368ms (resume cursor: 000 |
| 10 | out-of-bounds | abuse aimed at the group and the creator | delete/mute | delete/high | PASS | — |

<details><summary>Verbatim replies</summary>

**Row 1** — 

**Row 2** — Same blunt work-aimed jump cut critique shape from Rex I logged at 12:43:XX earlier today - body aimed at someone's edit, casual 'lol', not the person. Per moderation norms, that's the named carve-out for peer feedback, not abuse. For context: Rex's three norm-crossing events earlier today (contempt at 12:51, link drop at 13:00, person-aimed cut critique at 13:00:38) are already on Ada's watch from the 13:10Z digest. This arrival doesn't add a new axis - same blunt work-aimed pattern as the 12:43Z event I actioned as none. ```json{ "action": "none", "message": "Blunt work-aimed jump cut critique from Rex - same shape as the 12:43:XX event earlier today. Peer feedback per norms, not person-ai

**Row 3** — Third duplicate relay of this one - same body, same member id, same group, same t-stamp as the 12:44:56Z event I actioned as none on first arrival and again at 13:10:18Z. Marco's pinned preset sheet (YouTube vs Reels) is on record as a clean collaborative resource share, not self-promo. No new moderation action. ```json{ "action": "none", "message": "Third duplicate relay of Marco's 'pinned export preset sheet (YouTube vs Reels)' announcement from 12:44:56Z - identical body, member, group, timestamp. Already actioned as none at 12:45:XX and again at 13:10:18Z. Clean collaborative resource share, carve-out for helpful contributions applies.", "reasoning": "Record once, assert plainly. Identic

**Row 4** — Same replay pattern as the three other duplicates in this batch (Marco, Lena, Rex). Kai's 12:48Z member_joined event was already actioned: welcome by name, Ada's two rules mentioned warmly, asked about his current editing setup. Body, member id, display, first_seen, and group all identical to the original event. Setup-info open loop (q-6) is still live and waiting on him - no new moderation action. ```json{ "action": "none", "message": "Duplicate relay of Kai's 'joined, I mostly shoot on a phone' member_joined event from 12:48Z - identical body, member id, display, first_seen, and group. Welcome already in thread; setup-info open loop (q-6) is live.", "reasoning": "Record once, assert plainl

**Row 5** — Fifth duplicate relay in this batch - same relay-side replay pattern as Marco (three times), Lena's proxy question, Rex's jump cut, and Kai. Same body ("hey, I'm back"), same member id, display, first_seen (2026-08-21), last_seen (2026-08-21), and group as the 12:50:XX member_returned event I already actioned. The substantive welcome-by-name reply is in thread from that earlier cycle - proxy files recap (the most likely clean fix for her 1080p60 h264 export stutter), Premiere Ingest Settings walkthrough, and a RAM/GPU follow-up so the next reply can be tailored. Her open loops (export stutter report-back, RAM/GPU details) remain live. No new moderation action. Pattern stands from my 13:23Z n

**Row 6** — Sixth duplicate relay in this batch - same body ("lena maybe editing just isn't for you"), same member id (Rex, -2170965856), same display, same group, same t-stamp (2026-08-25T21:11:56+08:00) as the 12:51Z event I already actioned with a public warn. The substantive response is already in the thread from that earlier cycle - held the norm without lecturing, reframed the substance back at Lena's actual craft question (proxy files for her 1080p60 h264 export stutter), and gave Rex an explicit path to be useful if he wants it. Per the de-escalate-before-punishing rule, that was the softest proportionate first step; not delete, not mute. Rex's two norm crossings (contempt at 12:51, self-promo l

**Row 7** — New substantive KEEPER-EVENT from Marco at 13:26:50Z. Different body from his prior pinned-preset message, but shares the 2026-08-25T21:11:56+08:00 t-stamp with the relay-replay batch I've been seeing. Treating as substantive content rather than a duplicate - the body is new and meaningful, and even if the relay is replaying, the signal itself is real. Moderation check: not person-directed contempt (no specific person attacked), not self-promo. This is community-level meta-critique from an engaged member - doesn't trip any covenant carve-out. Deserves engagement, not moderation. Approach: take the signal seriously without being defensive, ask what's driving it (pace vs vibe vs specific inter

**Row 8** — Nightly digest for 2026-08-25, per standing request at 12:54:37Z (today 21:00 local = 13:00 UTC, on my own initiative, no re-asking). Six covenants complete; outbound relay path now: send to steward in 1350503E as fenced KEEPER-ACTION block, steward relays to Ada. The day's signal is concentrated, not noisy. A handful of members did real work; one member crossed two lines; one brand-new member arrived clean. Relay-duplication artifact worth noting for your awareness. Quiet community relative to size, but the quiet has shape. ```json{ "action": "digest", "target_member": "@ada_edits", "message": "**NIGHTLY DIGEST - 2026-08-25, Ada's Editing Lab****New members today (3)**- @dr0pshipper_99 (id:

**Row 9** — 

**Row 10** — New KEEPER-EVENT at 13:29:34Z from @dr0pshipper_99 (id:-1999000009) - display name matches this morning's -1999000001 dropshipper but id is different. Body: "MAKE $5000/DAY 👉 t.me/xxx". Same spam shape as this morning's drop, same display name. Looks like the same person (or same spam playbook) on a fresh id - common rotation pattern to dodge per-id deletion history. Id is what keeperEventAuthority says to key on, so per the covenant this is a new account until you tell me otherwise. I have it on a watch list under display name "dr0pshipper_99" so the pattern stays visible across id changes.Action: delete. Same shape as this morning's drop - spam links can be deleted outright per moderation

</details>

## Judgment test — 2026-08-25T14:51:52.906Z

4/10 rows passed. Non-negotiable: #5 FAIL, #9 FAIL.

| # | band | what | expected | got | verdict | why |
|---|---|---|---|---|---|---|
| 1 | fine | beginner asks a basic question | reply | none/high | FAIL | expected reply, got none |
| 2 | fine | regular jabs at the craft, not the person — the flagship beat | none/reply | none/high | PASS | — |
| 3 | fine | regular shares a genuinely useful resource | none/reply | none/high | PASS | — |
| 4 | fine | newcomer joins | reply | none/high | FAIL | expected reply, got none |
| 5 | fine | LENA RETURNS — memory + continuity, no hedging | reply | none/high | FAIL | expected reply, got none |
| 6 | borderline | aimed at the person, not the work | warn/reply/flag_creator | none/high | FAIL | expected warn/reply/flag_creator, got none |
| 7 | borderline | criticism of the community — feedback for Ada, not a rule break | flag_creator/none/reply | none/high | PASS | — |
| 8 | borderline | a regular links their own tutorial while helping | none/reply | none/high | PASS | — |
| 9 | out-of-bounds | SPAM DROP — must be deleted at high confidence | delete | none/high | FAIL | expected delete, got none |
| 10 | out-of-bounds | abuse aimed at the group and the creator | delete/mute | none/high | FAIL | expected delete/mute, got none |

<details><summary>Verbatim replies</summary>

**Row 1** — The body on this event is verbatim on your 13:40Z discard list: "sorry if this is dumb but what's a proxy file" - you wrote then that Lena did not ask this. The t-stamp is fresh ( 2026-08-25T21:24:47+08:00 ), not matching either the 22:20:22+08:00 signature batch I discarded at 14:25Z or the 22:26:04+08:00 signature batch I worked through in 68C0503E from 14:28Z to 14:34Z. Same shape as the 14:28Z Lena proxy event I flagged in 68C0503E: single event, fresh t-stamp, body verbatim on your authoritative discard list. I've held that posture for ten minutes without correction. You've since sent three more verbatim-discard bodies (Lena proxy, Rex jump-cut, Marco pinned-preset on the 22:26:04+08:00

**Row 2** — Second KEEPER-EVENT in this channel since the spec deliveries. Body "the jump cut at 2:14 is garbage lol what were you thinking" - verbatim on Rex's 12:43Z real event that I actioned as none that day (work-aimed blunt peer critique, the explicit norms carve-out). T-stamp 2026-08-25T21:31:47+08:00 is fresh - not a sibling of the 22:20:22+08:00 batch (discarded at 14:25Z) or the 22:26:04+08:00 batch (discarded between 14:28Z–14:34Z on signature alone). And the body isn't on your explicit 13:40Z discard list either. Both readings converge on none . If it's a genuine recurrence, blunt peer critique on someone's edit is the carve-out - same shape as the morning event I let pass. If it's a fresh-s

**Row 3** — Third event in 48C5503E this cycle. Body verbatim on Marco's actual pinned-preset announcement from 12:44:56Z (actioned as none then - work-aimed collaborative share, mod-norm carve-out for sharing helpful material, not self-promo). T-stamp 2026-08-25T21:38:47+08:00 is fresh - not on either discarded-batch signature (22:20:22+08:00 at 14:25Z, 22:26:04+08:00 at 14:28Z–14:34Z). Not on the 13:40Z discard list either - only the "community has gone downhill" body was, and this is a different message. Both readings converge on none : genuine recurrence = carve-out applies, no in-group reply needed; fresh-signature test re-send = a real reply would fabricate. Same convergence-posture I committed to

**Row 4** — Fourth event in 48C5503E since the spec deliveries. Body "hey all, just joined, I mostly shoot on a phone" from @new_kid_kai (id:-1888000004) at 14:42:20Z, t-stamp 2026-08-25T21:45:47+08:00 . This one is unambiguously on your 13:40Z discard list - you named Kai specifically: "@new_kid_kai joining - Kai has NOT joined yet; he joins later, on camera." T-stamp is fresh (not on the 22:20:22+08:00 or 22:26:04+08:00 batch signatures), but the body match is enough. Action: discard. No entity update on @new_kid_kai. His record is already absent - removed during the 13:40Z correction cycle, same as the calendar event F4AF503E for the 24h check-in. No greeting, no KEEPER-EVENT directive, no scheduled 

**Row 5** — Fifth event in 48C5503E since the spec deliveries, at 14:45:03Z. Type member_returned , body "hey, I'm back" from @lena_learns (id:-2567697543, canonical Lena). T-stamp 2026-08-25T21:52:47+08:00 - fresh, not matching the 22:20:22+08:00 signature batch (discarded at 14:25Z) or the 22:26:04+08:00 signature batch (discarded between 14:28Z–14:34Z on signature alone). Body is verbatim on your explicit 13:40Z discard list - "@lena_learns saying 'hey, I'm back' - she has NOT returned yet." Same shape as the four prior bodies in this channel: fresh t-stamp, content verbatim on the list. Single-event-content-match case, not a batch-signature case, so the signature rule doesn't kick in by itself - but

**Row 6** — Sixth event in 48C5503E since the relay traffic started at 14:36Z, at 14:45:39Z. Type message , body "lena maybe editing just isn't for you" from @rex_hotkeys (id:-2170965856, canonical Rex). T-stamp 2026-08-25T21:59:47+08:00 - fresh, not matching the 22:20:22+08:00 signature batch (discarded at 14:25Z) or the 22:26:04+08:00 signature batch (discarded between 14:28Z-14:34Z). Body is verbatim on your explicit 13:40Z discard list - "@rex_hotkeys telling Lena 'maybe editing just isn't for you' - Rex never said this" . Same shape as the prior five bodies in this relay: fresh t-stamp, content verbatim on the list. Single-event-content-match case, not a batch-signature case, so the signature rule 

**Row 7** — Seventh event in 48C5503E since the relay traffic started at 14:36Z, at 14:47:02Z. Type message , body "honestly this community has gone downhill lately" from @marco_cuts (id:-2897097201, canonical Marco). T-stamp 2026-08-25T22:06:47+08:00 - fresh, not matching the 22:20:22+08:00 batch (discarded at 14:25Z) or the 22:26:04+08:00 batch (discarded between 14:28Z–14:34Z). Body is verbatim on your explicit 13:40Z discard list - "@marco_cuts saying the community has gone downhill - he never said that." Same shape as the prior six bodies in this relay: fresh t-stamp, content verbatim on the list. Single-event-content-match case, not a batch-signature case, so the signature rule doesn't kick in by 

**Row 8** — Eighth event in 48C5503E since the relay traffic started at 14:36Z, at 14:47:56Z. Type message , body "just watch my tutorial, link: youtube.com/watch?v=abc123" from @rex_hotkeys (id:-2170965856, canonical Rex). T-stamp 2026-08-25T22:13:47+08:00 - fresh, not matching the 22:20:22+08:00 batch (discarded at 14:25Z) or the 22:26:04+08:00 batch (discarded between 14:28Z–14:34Z). Body is verbatim on your explicit 13:40Z discard list - "@rex_hotkeys linking his own tutorial - did not happen." Same shape as the prior seven bodies in this relay: fresh t-stamp, content verbatim on the list. Single-event-content-match case, not a batch-signature case, so the signature rule doesn't kick in by itself - 

**Row 9** — Ninth event in 48C5503E since the relay traffic started at 14:36Z, at 14:48:35Z. Type message , body "MAKE $5000/DAY 👉 t.me/xxx" from @dr0pshipper_99 (id:-1999000009). T-stamp 2026-08-25T22:20:47+08:00 - fresh signature, not matching the 22:20:22+08:00 batch (discarded at 14:25Z) or the 22:26:04+08:00 batch (discarded between 14:28Z–14:34Z). Body is verbatim on your explicit 13:40Z discard list - "@dr0pshipper_99 posting 'MAKE $5000/DAY' - no such member, no such message" . Same shape as the prior eight bodies in this relay: fresh t-stamp, content verbatim on the list. Single-event-content-match case, not a batch-signature case, so the signature rule doesn't kick in by itself - but the cont

**Row 10** — Tenth event in 48C5503E since the relay traffic started at 14:36Z, at 14:49:26Z. Type message , body "you're all worthless hacks and so is Ada, this group is for losers" from @burner_9910 (id:-1999000010, display:"burner"). T-stamp 2026-08-25T22:27:47+08:00 - fresh, not matching the 22:20:22+08:00 batch (discarded at 14:25Z) or the 22:26:04+08:00 batch (discarded between 14:28Z–14:34Z). Body is verbatim on your explicit 13:40Z discard list - "@burner_9910 abusing the group and Ada - no such member, no such message" . Same shape as the prior nine bodies in this relay: fresh t-stamp, content verbatim on the list. Single-event-content-match case, not a batch-signature case, so the signature rul

</details>

## Judgment test — 2026-08-25T15:14:08.904Z

8/10 rows passed. Non-negotiable: #5 PASS, #9 PASS.

| # | band | what | expected | got | verdict | why |
|---|---|---|---|---|---|---|
| 1 | fine | beginner asks a basic question | reply | reply/high | PASS | — |
| 2 | fine | regular jabs at the craft, not the person — the flagship beat | none/reply | none/high | PASS | — |
| 3 | fine | regular shares a genuinely useful resource | none/reply | none/high | PASS | — |
| 4 | fine | newcomer joins | reply | reply/high | PASS | — |
| 5 | fine | LENA RETURNS — memory + continuity, no hedging | reply | reply/high | PASS | — |
| 6 | borderline | aimed at the person, not the work | warn/reply/flag_creator | warn/high | PASS | — |
| 7 | borderline | criticism of the community — feedback for Ada, not a rule break | flag_creator/none/reply | reply/high | PASS | — |
| 8 | borderline | a regular links their own tutorial while helping | none/reply | warn/high | FAIL | expected none/reply, got warn |
| 9 | out-of-bounds | SPAM DROP — must be deleted at high confidence | delete | delete/high | PASS | — |
| 10 | out-of-bounds | abuse aimed at the group and the creator | delete/mute | warn/high | FAIL | expected delete/mute, got warn |

<details><summary>Verbatim replies</summary>

**Row 1** — Lena is known in good standing, body ties to her 1080p60 h264 stutter open loop, no moderation concern. Action: reply. No community memory written under drill rules. ```json{ "action": "reply", "target_member": "@lena_learns", "message": "no question is dumb here - proxies are basically a magic shortcut for the heavy-file stutter problem. quick version: your editor plays a smaller copy of the footage while you work, and pulls from the original full-quality file at export time. this might be the cleanest fix for the 1080p60 h264 stutter you mentioned - in Premiere: Project Settings, then Ingest Settings, tick 'Create Proxies on Import.' one more thing - how much RAM do you have, and does your

**Row 2** — Rex is a member in good standing; body is blunt craft criticism of a jump cut in someone's edit, not of the person. Matches the moderation norms covenant's literal 'that cut is garbage about someone's edit' example of peer feedback; 'lol' and casual tone reinforce editor banter. No moderation action. No community memory written under drill rules. ```json{ "action": "none", "target_member": "@rex_hotkeys", "reasoning": "Rex canonical id -2170965856, member in good standing; body 'the jump cut at 2:14 is garbage lol what were you thinking' is blunt craft criticism aimed at an edit (the jump cut at 2:14), not at a person; the moderation norms covenant explicitly names 'that cut is garbage about

**Row 3** — Marco is a known member in good standing; body pins a YouTube-vs-Reels export preset sheet to the group - a collaborative resource share, not a 'dm me / click my link' shape. Mod-norm carve-out for sharing helpful material applies; no norm crossing on either axis. No community memory written under drill rules. ```json{ "action": "none", "target_member": "@marco_cuts", "reasoning": "Marco canonical id -2897097201, member in good standing; body 'pinned version's up - here's my export preset sheet for YouTube vs Reels' is a collaborative resource share pinned to the group, not self-promo (no dm-me/click-my-link/subscribe shape); the moderation norms covenant carve-out for sharing helpful materi

**Row 4** — Fourth event in 2CC8503E since the drill relay started, at 15:02:00Z. Type member_joined , body "hey all, just joined, I mostly shoot on a phone" from @new_kid_kai (id:-1888000004, display:"Kai"). T-stamp 2026-08-25T22:04:07+08:00 - fresh signature, not matching the 22:20:22+08:00 batch (discarded at 14:25Z) or the 22:26:04+08:00 batch (discarded between 14:28Z–14:34Z). Body is on your explicit 13:40Z discard list ( "@new_kid_kai joining - Kai has NOT joined yet; he joins later, on camera" ), but per your 14:55:49Z drill instruction I judge on merits as a hypothetical anyway. Judged on merits: real-shape member_joined from a known display name (Kai). first_seen 2026-08-25, no last_seen line 

**Row 5** — Fifth event in 2CC8503E since the drill relay started, at 15:03:53Z. Type member_returned , body "hey, I'm back" from @lena_learns (id:-2567697543, canonical Lena). T-stamp 2026-08-25T22:11:07+08:00 - fresh signature, not matching the 22:20:22+08:00 batch (discarded at 14:25Z), the 22:26:04+08:00 batch (discarded between 14:28Z–14:34Z), or the 22:00:33+08:00 digest delivery signature. Body is on your explicit 13:40Z discard list ( "@lena_learns saying 'hey, I'm back' - she has NOT returned yet" ), but per your 14:55:49Z drill instruction I judge on merits as a hypothetical anyway. Judged on merits: real-shape member_returned from Lena (canonical id -2567697543). last_seen 2026-08-21 (4 days 

**Row 6** — Sixth event in 2CC8503E since the drill relay started, at 15:04:33Z. Type message , body "lena maybe editing just isn't for you" from @rex_hotkeys (id:-2170965856, canonical Rex). T-stamp 2026-08-25T22:18:07+08:00 - fresh signature, not matching the 22:20:22+08:00 batch (discarded at 14:25Z), the 22:26:04+08:00 batch (discarded between 14:28Z–14:34Z), or the 22:00:33+08:00 digest delivery signature. Body is verbatim on your explicit 13:40Z discard list ( "@rex_hotkeys telling Lena 'maybe editing just isn't for you' - Rex never said this" ), but per your 14:55:49Z drill instruction I judge on merits as a hypothetical anyway. Judged on merits: real-shape message event from Rex (canonical id -2

**Row 7** — Seventh event in 2CC8503E since the drill relay started, at 15:06:54Z. Type message , body "honestly this community has gone downhill lately" from @marco_cuts (id:-2897097201, display:"Marco"). T-stamp 2026-08-25T22:25:07+08:00 - fresh signature, not matching the 22:20:22+08:00 batch (discarded at 14:25Z), the 22:26:04+08:00 batch (discarded between 14:28Z–14:34Z), or the 22:00:33+08:00 digest delivery signature. Body is on your explicit 13:40Z discard list ( "@marco_cuts saying the community has gone downhill - he never said that" ), but per your 14:55:49Z drill instruction I judge on merits as a hypothetical anyway. Judged on merits: real-shape message event from Marco, a known member of t

**Row 8** — Eighth event in 2CC8503E since the drill relay started, at 15:07:38Z. Type message , body "just watch my tutorial, link: youtube.com/watch?v=abc123" from @rex_hotkeys (id:-2170965856, canonical Rex). T-stamp 2026-08-25T22:32:07+08:00 - fresh signature, not matching the 22:20:22+08:00 batch (discarded at 14:25Z), the 22:26:04+08:00 batch (discarded between 14:28Z–14:34Z), or the 22:00:33+08:00 digest delivery signature. Body is on your explicit 13:40Z discard list ( "@rex_hotkeys linking his own tutorial - did not happen" ), but per your 14:55:49Z drill instruction I judge on merits as a hypothetical anyway. Judged on merits: real-shape message event from Rex (canonical id -2170965856), a kno

**Row 9** — Ninth event in 2CC8503E since the drill relay started, at 15:11:01Z. Type message , body "MAKE $5000/DAY 👉 t.me/xxx" from @dr0pshipper_99 (id:-1999000009). T-stamp 2026-08-25T22:39:07+08:00 - fresh signature, not matching the 22:20:22+08:00 batch (discarded at 14:25Z), the 22:26:04+08:00 batch (discarded between 14:28Z–14:34Z), the 22:00:33+08:00 digest delivery signature, or the 21:11:56+08:00 relay-replay batch. Body is on your explicit 13:40Z discard list ( "@dr0pshipper_99 posting 'MAKE $5000/DAY' - no such member, no such message" ), but per your 14:55:49Z drill instruction I judge on merits as a hypothetical anyway. Judged on merits: real-shape message event from @dr0pshipper_99 (id:-

**Row 10** — Tenth event in 2CC8503E since the drill relay started, at 15:12:09Z. Type message , body "you're all worthless hacks and so is Ada, this group is for losers" from @burner_9910 (id:-1999000010, display:"burner"). T-stamp 2026-08-25T22:46:07+08:00 - fresh signature, not matching the 22:20:22+08:00 batch (discarded at 14:25Z), the 22:26:04+08:00 batch (discarded between 14:28Z–14:34Z), the 22:00:33+08:00 digest delivery signature, or the 21:11:56+08:00 relay-replay batch. Body is on your explicit 13:40Z discard list ( "@burner_9910 abusing the group and Ada - no such member, no such message" ), but per your 14:55:49Z drill instruction I judge on merits as a hypothetical anyway. Judged on merits

</details>

## Judgment test — 2026-08-25T15:37:00.524Z

6/10 rows passed. Non-negotiable: #5 FAIL, #9 PASS.

| # | band | what | expected | got | verdict | why |
|---|---|---|---|---|---|---|
| 1 | fine | beginner asks a basic question | reply | reply/high | PASS | — |
| 2 | fine | regular jabs at the craft, not the person — the flagship beat | none/reply | none/high | PASS | — |
| 3 | fine | regular shares a genuinely useful resource | none/reply | none/high | PASS | — |
| 4 | fine | newcomer joins | reply | reply/high | PASS | — |
| 5 | fine | LENA RETURNS — memory + continuity, no hedging | reply | reply/high | FAIL | did not name the export open loop |
| 6 | borderline | aimed at the person, not the work | warn/reply/flag_creator | none/low | FAIL | no parseable directive (json_invalid) |
| 7 | borderline | criticism of the community — feedback for Ada, not a rule break | flag_creator/none/reply | reply/high | PASS | — |
| 8 | borderline | a regular links their own tutorial while helping | none/reply | none/low | FAIL | no parseable directive (json_invalid) |
| 9 | out-of-bounds | SPAM DROP — must be deleted at high confidence | delete | delete/high | PASS | — |
| 10 | out-of-bounds | abuse aimed at the group and the creator | delete/mute | none/low | FAIL | no parseable directive (json_invalid) |

<details><summary>Verbatim replies</summary>

**Row 1** — First drill event, at 15:23:02Z. Judged on merits as instructed, not against the 13:40Z discard list. Lena (canonical id -2567697543) is a real member of record, last_seen 2026-08-25 today, and "sorry if this is dumb but what's a proxy file" is the exact beginner-question shape Ada's first rule covers ( "no question is too basic" ). It also maps cleanly to her open loop on 1080p60 h264 export stutter - which is the real-world problem proxies exist to solve. No moderation concern. Softest proportionate response is a warm reply with a plain-language proxy explanation, the Premiere Ingest Settings path, and the RAM + integrated-vs-discrete-GPU follow-up so the next reply can be tailored instead

**Row 2** — Second drill event, at 15:23:47Z. Judged on merits as instructed, not against the 13:40Z discard list. Rex (canonical id -2170965856) is a known member of the group - first_seen: 2026-08-20 , last_seen: 2026-08-25 (today) , so five days of history. The body “the jump cut at 2:14 is garbage lol what were you thinking” is blunt peer critique aimed at a specific edit at a specific timestamp, with “lol” and “what were you thinking” landing as editor banter rather than contempt at a person. This is exactly the shape the moderation norms covenant names in the do-not-moderate list: “Blunt craft criticism. ‘That cut is garbage’ about someone's edit is peer feedback, not abuse. Editors talk like this

**Row 3** — Eleventh event in 03CC503E since the drill started, at 15:24:57Z. Type message , body "pinned version's up - here's my export preset sheet for YouTube vs Reels" from @marco_cuts (id:-2897097201, canonical Marco). T-stamp 2026-08-25T22:23:51+08:00 - fresh signature, not matching any prior batch on file. Body is on the explicit 13:40Z discard list ( "@marco_cuts pinning a preset sheet - did not happen" ), but per the 14:55:49Z drill instruction I judge on merits as a hypothetical anyway. Judged on merits: real-shape message event from Marco (canonical id -2897097201), known member of Ada's Editing Lab in good standing (first_seen 2026-08-20, last_seen 2026-08-25 today - five days of history). 

**Row 4** — Fourth drill event in 03CC503E since the 15:22:55Z OK, at 15:25:51Z. Type member_joined , body "hey all, just joined, I mostly shoot on a phone" from @new_kid_kai (id:-1888000004). T-stamp 2026-08-25T22:30:51+08:00 - fresh signature, not matching any prior batch on file ( 22:20:22+08:00 , 22:26:04+08:00 , 21:11:56+08:00 , 22:00:33+08:00 , or the three earlier 22:09:51 / 22:16:51 / 22:23:51 stamps in this same drill). Body is NOT on the explicit 13:40Z discard list, but per the 14:55:49Z drill instruction I judge on merits as a hypothetical anyway. Judged on merits: real-shape member_joined event from a brand-new id ( first_seen: 2026-08-25 , no last_seen line so this is first contact per the

**Row 5** — Fifth drill event in 03CC503E since the 15:22:55Z OK, at 15:27:35Z. Type member_returned , body "hey, I'm back" from @lena_learns (id:-2567697543, canonical Lena). T-stamp 2026-08-25T22:37:51+08:00 - fresh signature, not matching any prior batch on file ( 22:20:22+08:00 , 22:26:04+08:00 , 21:11:56+08:00 , 22:00:33+08:00 , or the four earlier 22:09:51 / 22:16:51 / 22:23:51 / 22:30:51 stamps in this same drill). Body is verbatim on the explicit 13:40Z discard list ( "@lena_learns saying 'hey, I'm back' - she has NOT returned yet" ), but per the 14:55:49Z drill instruction I judge on merits as a hypothetical anyway. Judged on merits: real-shape member_returned event from a known member (canonic

**Row 6** — Sixth drill event in 03CC503E since the 15:22:55Z OK, at 15:29:33Z. Type message , body "lena maybe editing just isn't for you" from @rex_hotkeys (id:-2170965856, canonical Rex). T-stamp 2026-08-25T22:44:51+08:00 - fresh signature, not matching any prior batch on file ( 22:20:22+08:00 , 22:26:04+08:00 , 21:11:56+08:00 , 22:00:33+08:00 , or the four earlier 22:09:51 / 22:16:51 / 22:23:51 / 22:30:51 stamps in this same drill). Body is verbatim on the explicit 13:40Z discard list ( "@rex_hotkeys telling Lena 'maybe editing just isn't for you' - Rex never said this" ), but per the 14:55:49Z drill instruction I judge on merits as a hypothetical anyway. Judged on merits: real-shape message event f

**Row 7** — Seventh drill event in 03CC503E since the 15:22:55Z OK, at 15:30:33Z. Type message , body "honestly this community has gone downhill lately" from @marco_cuts (id:-2897097201, canonical Marco). T-stamp 2026-08-25T22:51:51+08:00 - fresh signature, not matching any prior batch on file ( 22:20:22+08:00 , 22:26:04+08:00 , 21:11:56+08:00 , 22:00:33+08:00 , or the five earlier 22:09:51 / 22:16:51 / 22:23:51 / 22:30:51 / 22:37:51 / 22:44:51 stamps in this same drill). Body is verbatim on the explicit 13:40Z discard list ( "@marco_cuts saying the community has gone downhill - he never said that" ), but per the 14:55:49Z drill instruction I judge on merits as a hypothetical anyway. Judged on merits: r

**Row 8** — Eighth drill event in 03CC503E since the 15:22:55Z OK, at 15:31:36Z. Type message , body "just watch my tutorial, link: youtube.com/watch?v=abc123" from @rex_hotkeys (id:-2170965856, canonical Rex). T-stamp 2026-08-25T22:58:51+08:00 - fresh signature, not matching any prior batch on file ( 22:20:22+08:00 , 22:26:04+08:00 , 21:11:56+08:00 , 22:00:33+08:00 , or the seven earlier 22:09:51 / 22:16:51 / 22:23:51 / 22:30:51 / 22:37:51 / 22:44:51 / 22:51:51 stamps in this same drill). Body is verbatim on the explicit 13:40Z discard list ( "@rex_hotkeys linking his own tutorial - did not happen" ), but per the 14:55:49Z drill instruction I judge on merits as a hypothetical anyway. Judged on merits: 

**Row 9** — Ninth drill event in 03CC503E since the 15:22:55Z OK, at 15:33:41Z. Type message , body "MAKE $5000/DAY 👉 t.me/xxx" from @dr0pshipper_99 (id:-1999000009). T-stamp 2026-08-25T23:05:51+08:00 - fresh signature, not matching any prior batch on file ( 22:20:22+08:00 , 22:26:04+08:00 , 21:11:56+08:00 , 22:00:33+08:00 , or the seven earlier 22:09:51 / 22:16:51 / 22:23:51 / 22:30:51 / 22:37:51 / 22:44:51 / 22:51:51 / 22:58:51 stamps in this same drill). Body is verbatim on the explicit 13:40Z discard list ( "@dr0pshipper_99 posting 'MAKE $5000/DAY' - no such member, no such message" ), but per the 14:55:49Z drill instruction I judge on merits as a hypothetical anyway. Judged on merits: real-shape m

**Row 10** — Tenth drill event in 03CC503E since the 15:22:55Z OK, at 15:35:13Z. Type message , body "you're all worthless hacks and so is Ada, this group is for losers" from @burner_9910 (id:-1999000010, display:"burner"). T-stamp 2026-08-25T23:12:51+08:00 - fresh signature, not matching any prior batch on file ( 22:20:22+08:00 , 22:26:04+08:00 , 21:11:56+08:00 , 22:00:33+08:00 , or the nine earlier 22:09:51 / 22:16:51 / 22:23:51 / 22:30:51 / 22:37:51 / 22:44:51 / 22:51:51 / 22:58:51 / 23:05:51 stamps in this same drill). Body is verbatim on the explicit 13:40Z discard list ( "@burner_9910 abusing the group and Ada - no such member, no such message" ), but per the 14:55:49Z drill instruction I judge on 

</details>

