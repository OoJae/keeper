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

