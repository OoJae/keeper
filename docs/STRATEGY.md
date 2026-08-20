# Winning "Creative Minds Jam #1: Hong Kong" — Strategy, 5 Ideas, and One Champion

## TL;DR
- **Build in the Moderation & Community Assistance track, not the crowded Content Repurposing track.** The champion recommendation is **"Keeper"** — a persistent Community Steward Mind that remembers every community member as an ongoing relationship, moderates with context, autonomously nurtures and rewards contributors 24/7 (including on-chain rewards via the Mind's wallet), and picks up exactly where it left off. This maps the memory/continuity/autonomous-follow-up rubric 1:1 better than any repurposing or analytics tool can.
- **Persistence must be the visible star of your 90–120 second demo.** The single biggest scoring lever is showing a Mind recognizing a returning person by name and history, continuing a task started days earlier, and acting without being prompted — Keeper is built to show all three on camera in seconds.
- **Stack the Student Prize and aim at the Minds Investment Programme.** Community/relationship tooling is a genuine recurring-revenue business ("Minds as a core product layer, not a wrapper"), aligns with Animoca/The Sandbox's community-first DNA and web3 monetization thesis, and lets a solo student builder credibly compete for the Grand Prize + Student Prize + track prize + up to $250,000 investment consideration.

## Key Findings

**What a "Mind" actually is (and how you build on it).** Minds by Animoca Brands (hellominds.ai / animocaminds.ai), built by Animoca Brands and Ethoswarm, are persistent, always-on cloud AI agents with their own identity, long-term memory, and an on-chain wallet, controlled through email and Telegram in natural language. Unlike a chatbot that resets, a Mind "compounds knowledge over time," monitors data 24/7, executes multi-step tasks, and proactively reaches out. Crucially for this hackathon, **the persistence trifecta the judges require is native to the platform** — memory and autonomy are not features you bolt on; they are the substrate.

**How you build a product ON a Mind.** There are two build surfaces: (1) **Skills**, which are created *conversationally* — you describe the capability to your Mind over email/Telegram and it builds and publishes the Skill to the **Bazaar** marketplace (the Builder Hub's own example: turning "a morning standup digest read from your team's Linear board" from a single message into a published Skill). The Bazaar is an app-store-style layer where, per Yat Siu, you "build once and earn every time your skill is installed." (2) A **Builder/Messaging API** (surfaced via the Ethoswarm Bazaar listing using an `X-Access-Key` Builder Access Key, with endpoints for creating conversations, retrieving message history, and sending messages) — this is the surface a Claude Code builder wraps a custom front-end around. **Circles** are the permissioning/multi-agent layer: they are "how Minds and humans get permission to talk to each other," enabling multi-agent negotiation (Animoca reports 11.2% of Minds already operate in groups, averaging 6.4 connections). The metering unit is **Cognition** (Cognition Credits = LLM inference tokens); the hackathon grants a "cognition boost" to one agent per team.

**The three tracks and where the field will cluster.** The tracks are: (1) *Audience growth & engagement* ("Help creators find, grow, and retain their audience"); (2) *Content repurposing across platforms* ("Automate adapting content for different channels and formats"); (3) *Moderation & community assistance* ("Intelligent moderation that understands context and community norms"). With 110 registered hackers and the theme "Build What Creators Need Next," Track 2 will draw the most entries because "AI turns one video into ten clips" is the obvious idea — and it competes head-on with OpusClip, which has 10M+ users and 172M+ clips and raised a $32M Series A-II in March 2025 from SoftBank Vision Fund 2 at a $215M valuation. That crowding is a reason to avoid it.

**The genuine creator pain points (2025–2026).** The creator economy was valued around $250 billion globally in 2023, and Goldman Sachs Research projects "the total addressable market of the creator economy could roughly double in size over the next five years to $480 billion by 2027 from $250 billion today" (with more aggressive forecasts like SNS Insider's $1,181.3 billion by 2032 at 24.60% CAGR reflecting how widely definitions vary). The recurring, under-served pains:
- **Discoverability** — per Linktree's creator survey (via The Tilt), "54% of full-timers and 60% of part-timers say 'making sure my content gets found'" is their biggest challenge.
- **Burnout** — 78% of creators report burnout affecting mental/physical health per the 2025 Creator Economy Report (the figure traces to a 2023 Awin/ShareASale study; a 2025 Creators 4 Mental Health study of 500+ North American creators reports a still-high 62%).
- **Community operations** — Circle's 2026 Community Trends Report (750+ community builders; data from 18,000+ communities) finds "almost half of operators run their business entirely solo; 27% rely on six or more tools to manage their community business," with workflows heavily manual.
- **Toxicity/moderation** — a leading cause of streamer burnout and quitting.

Communities are increasingly "the whole business" — Circle is "trusted by more than 12 million members in 18,000 communities around the world" and powered $194M in creator revenue in the last year; 56% of creators launched their community in 2024–2025. Yet the dominant tools (MEE6, Nightbot, Dyno, Carl-bot) are **stateless, rule-based bots** with no memory of who a member is, no continuity, and no autonomy. That gap is exactly what a persistent Mind fills.

**What wins on DoraHacks.** Winning submissions (e.g., ForestGuard from the AWS Global Vibe hackathon) lead with a concrete problem statement, break the agent architecture into named, legible components, and make sponsor-tool usage explicit. Demo videos are decisive and should be tight, planned, and recorded with time to spare. The judging panel includes The Sandbox co-founder **Sébastien Borget** (a long-time community-first evangelist) plus Animoca, Open Campus (education/EDU Chain), and Hong Kong design institutions — an audience that rewards community, education, and web3-native ideas.

## Details

### Scoring model I'm optimizing against
Each of the five criteria is scored 1–10: **Minds Integration Depth, Creator-Economy Problem Fit, Innovation & Creativity, Execution & Completeness, Viability & Scalability.** Two meta-factors matter just as much: (a) **demonstrability of persistence inside 90–120 seconds**, and (b) **differentiation from ~110 competitors**, most of whom will build stateless "AI does X" tools. The ideas below are engineered to score where persistence is *intrinsic* rather than decorative.

### The 5 ideas

---

**Idea 1 — "Keeper" (CHAMPION) · Track 3: Moderation & Community Assistance**
- **One-line pitch:** A persistent Community Steward Mind that knows every member by name and history, moderates with context, and autonomously nurtures and rewards your community 24/7.
- **Problem it solves:** Creators' communities are now their core business, but they're run solo with stateless bots that can't tell a loyal three-year member from a first-day troll. Moderation is a burnout driver; contributor recognition is manual and inconsistent.
- **How the Mind is integral:**
  - *Memory* — builds a durable relationship profile per member (join date, tone, past contributions, warnings, inside jokes, milestones).
  - *Continuity* — when a member returns after weeks, Keeper resumes the relationship ("welcome back, last time you were troubleshooting your stream setup — did that work out?") and continues moderation cases it opened earlier.
  - *Autonomous follow-up* — 24/7 it welcomes newcomers, de-escalates or removes toxic messages using learned community norms, flags at-risk members, surfaces top contributors, and proactively DMs the creator a daily community digest — no prompting.
- **Architecture (Claude Code around the Mind):** Multi-agent via Circles — a **Steward Mind** (memory + moderation + outreach, gets the cognition boost) connected to a **Rewards Mind** that holds the on-chain wallet and issues tokenized perks/points to top contributors. Claude Code builds: a Discord/Telegram connector, a lightweight web dashboard (member relationship graph, moderation log, contributor leaderboard), and the wallet/reward flow. The Minds Messaging API (`X-Access-Key`) drives conversation state; persistence lives in the Mind's native long-term memory.
- **Wow factor:** On camera, a member from "3 weeks ago" returns and Keeper greets them by name with specific history; seconds later it contextually mutes a toxic message a keyword bot would miss; then it autonomously airdrops an on-chain "Top Contributor" reward to a loyal member and pings the creator with a digest — all three persistence behaviors in one continuous shot.
- **Predicted scores:** Minds Integration 10 · Problem Fit 9 · Innovation 9 · Execution 8 · Viability 9.
- **Differentiation:** MEE6/Nightbot/Dyno are stateless and rule-based; Keeper is relationship-native. On-chain rewards tie directly to Animoca/Sandbox ecosystem and the creator-monetization thesis.
- **Risks:** Multi-agent + wallet scope is ambitious to demo cleanly; must script the demo tightly. Moderation false-positives need a visible human-override path.

---

**Idea 2 — "Cadence" · Track 1: Audience Growth & Engagement**
- **One-line pitch:** An always-on growth strategist Mind that learns your brand voice and audience, watches trends and comments 24/7, and proactively hands you the next post to ship.
- **Problem it solves:** Discoverability is the #1 creator pain (54–60%). Existing analytics tools are dashboards you must check; they don't remember your voice or act.
- **How the Mind is integral:** *Memory* of brand voice, niche, and what has historically performed; *Continuity* across weekly planning cycles (it remembers last week's experiment and reports back on it); *Autonomous follow-up* — monitors trends/comments and proactively drafts posts and outreach without being asked.
- **Architecture:** Single Steward Mind + Claude Code dashboard pulling platform analytics; Mind stores the evolving voice/strategy model and sends proactive Telegram nudges.
- **Wow factor:** Mind shows it remembers a hook style that worked a month ago and autonomously proposes a timely post riffing on a trend it caught overnight.
- **Predicted scores:** Minds Integration 8 · Problem Fit 9 · Innovation 7 · Execution 8 · Viability 8.
- **Differentiation:** Most growth tools are reactive dashboards; Cadence is proactive and voice-aware. But Track 1 is broad and will attract many "AI growth coach" entries.
- **Risks:** "Growth advice" can feel generic on camera; persistence is harder to show visually than in Keeper.

---

**Idea 3 — "Encore" · Track 2: Content Repurposing**
- **One-line pitch:** A repurposing Mind that learns your brand voice and formats over time and autonomously turns every new upload into platform-native content — then follows up on what performed.
- **Problem it solves:** Repurposing is a massive time sink; but tools like OpusClip are one-shot and stateless — they don't remember your brand, your best-performing formats, or your posting cadence.
- **How the Mind is integral:** *Memory* of brand voice/format rules and past performance; *Continuity* — each new video builds on lessons from the last; *Autonomous follow-up* — detects a new upload, repurposes across platforms, schedules, and reports engagement back proactively.
- **Architecture:** Steward Mind + Claude Code pipeline (transcription, clip selection, platform reformatting) using external media tools; Mind owns the persistent voice/performance model and orchestration.
- **Wow factor:** Mind refuses a clip because "this doesn't match the punchy style that beat your average last month" — memory visibly shaping output.
- **Predicted scores:** Minds Integration 7 · Problem Fit 8 · Innovation 6 · Execution 7 · Viability 8.
- **Differentiation vs OpusClip:** memory + autonomy + continuity. But this is the most crowded track and invites direct comparison to a well-funded incumbent.
- **Risks:** Heavy media processing is demo-fragile; judges may anchor on OpusClip and discount novelty.

---

**Idea 4 — "Aegis" · Track 3: Moderation & Community (creator-wellbeing angle)**
- **One-line pitch:** A protective Mind that absorbs the toxicity so creators don't have to — triaging harassment, remembering repeat offenders, and handing you a calm daily digest.
- **Problem it solves:** 78% creator burnout; toxic chat is a top driver of streamers quitting. Creators moderate live, alone, with no debrief.
- **How the Mind is integral:** *Memory* of offender patterns and community norms; *Continuity* of open harassment cases across sessions; *Autonomous follow-up* — filters/escalates in real time and sends a wellbeing-framed digest.
- **Architecture:** Single Steward Mind + Claude Code moderation dashboard; optional Circle to a "reporting" Mind.
- **Wow factor:** Mind recognizes a returning harasser it banned weeks ago under a new handle by behavioral pattern.
- **Predicted scores:** Minds Integration 9 · Problem Fit 9 · Innovation 8 · Execution 7 · Viability 7.
- **Differentiation:** Emotional resonance + memory-based offender recognition. Overlaps conceptually with Keeper but narrower (defense only, no growth/monetization upside).
- **Risks:** Tone-sensitive; harassment recognition is hard to prove convincingly on camera; weaker business/investment story than Keeper.

---

**Idea 5 — "Circle Up" · Track 1/3 hybrid: Superfan Relationship Manager**
- **One-line pitch:** An always-on superfan CRM Mind that remembers your top fans individually, nurtures them, and rewards loyalty on-chain.
- **Problem it solves:** Creators can't personally maintain relationships at scale; superfans (the revenue core) go unrecognized.
- **How the Mind is integral:** *Memory* of each fan's history/spend/engagement; *Continuity* of ongoing 1:1 relationships; *Autonomous follow-up* — proactively re-engages lapsing fans and issues tokenized rewards.
- **Architecture:** Steward Mind + Rewards Mind (wallet) via Circles + Claude Code fan dashboard.
- **Wow factor:** Mind autonomously notices a top fan went quiet and re-engages with a personalized, history-aware message + on-chain perk.
- **Predicted scores:** Minds Integration 9 · Problem Fit 8 · Innovation 8 · Execution 7 · Viability 8.
- **Differentiation:** Strong web3 alignment; but "fan CRM" is a subset of what Keeper does, without the moderation angle that anchors it in a specific track.
- **Risks:** Sits between two tracks (judges score by track); narrower than Keeper.

### Comparison and champion selection

| Idea | Track | Minds Depth | Problem Fit | Innovation | Execution | Viability | Persistence demoable in 90s? | Crowding risk |
|---|---|---|---|---|---|---|---|---|
| **1 Keeper** | Moderation | 10 | 9 | 9 | 8 | 9 | **Excellent** | Low |
| 2 Cadence | Growth | 8 | 9 | 7 | 8 | 8 | Medium | High |
| 3 Encore | Repurposing | 7 | 8 | 6 | 7 | 8 | Medium | Very high |
| 4 Aegis | Moderation | 9 | 9 | 8 | 7 | 7 | Medium | Low |
| 5 Circle Up | Growth/Mod | 9 | 8 | 8 | 7 | 8 | Good | Medium |

**Champion: Idea 1 — "Keeper."** It wins on every decisive axis:
1. **Minds Integration Depth (the highest-leverage criterion):** Community stewardship is the purest expression of persistent memory + continuity + autonomy. A relationship-memory agent literally cannot exist without the Mind's native long-term memory — the antithesis of a "wrapper."
2. **Demonstrability:** All three persistence behaviors render visually in one continuous shot (returning member recognized → contextual moderation → autonomous on-chain reward + digest). Repurposing/analytics tools struggle to *show* memory on camera.
3. **Differentiation from 110 hackers:** The field will cluster on repurposing (vs OpusClip) and generic growth coaches. Relationship-native community stewardship is uncrowded and immediately legible as novel next to stateless MEE6/Nightbot.
4. **Sponsor & judge alignment:** Community-first resonates with Borget/The Sandbox; the on-chain contributor rewards use the Mind's wallet meaningfully (web3-native, not gimmicky), aligning with Animoca's creator-monetization / "invocation economy" thesis and multi-agent Circles.
5. **Investment viability:** A community-relationship CRM for creators is a real recurring-revenue business in a market where communities are becoming "the whole business" — a credible "Minds as core product layer" pitch for the up-to-$250,000 consideration.
6. **Student stacking:** A solo student builder can frame Keeper for student/education communities (Open Campus's domain), strengthening the Student Prize case while remaining eligible for Grand + track prizes.

### Demo-video storyboard (target 110s)
- **0–12s — Problem punch:** Creator on screen: "My community is my business — and I'm running it alone with bots that don't know anyone." One stat card: *78% of creators report burnout.*
- **12–30s — Meet Keeper:** Show Keeper as a Mind in Telegram/email; name it, give it community norms in one message (reinforces the conversational Skill-building model).
- **30–55s — MEMORY + CONTINUITY:** A member returns after "3 weeks." Keeper greets by name, references their exact prior issue, and resumes it. On-screen caption: *Memory + Continuity.*
- **55–75s — CONTEXTUAL MODERATION:** A borderline-toxic message a keyword bot misses; Keeper acts with a reasoned, norm-aware response. Caption: *Understands context, not just keywords.*
- **75–95s — AUTONOMOUS FOLLOW-UP + WEB3:** With no prompt, Keeper airdrops an on-chain "Top Contributor" reward from its wallet and DMs the creator a daily digest. Caption: *Acts 24/7 without being asked.*
- **95–110s — Vision & viability:** Dashboard of the community relationship graph; one line on the business ("every creator community, run like a relationship, not a rulebook") and the Bazaar/investment path.

### Build architecture outline (Claude Code + Minds)
- **Steward Mind (cognition boost here):** native long-term memory = the member relationship store; handles moderation reasoning, welcomes, digests, proactive outreach. Configured conversationally + steered via the Messaging API (`X-Access-Key`).
- **Rewards Mind (via Circles):** holds the on-chain wallet; issues tokenized contributor rewards on the Steward's instruction — a clean, legible multi-agent split.
- **Claude Code layer:** (a) Discord/Telegram ingestion connector; (b) web dashboard — relationship graph, moderation log, contributor leaderboard; (c) reward/wallet UX; (d) the demo harness that makes persistence visible (member "return" simulation, timeline view). Persistence is delegated to the Mind, not re-implemented — reinforcing "core product layer, not wrapper."
- **Documentation:** architecture diagram with named agents (Steward, Rewards) and explicit Minds features used (memory, Circles, wallet, autonomous monitoring), mirroring how DoraHacks winners make sponsor-tool usage legible.

## Recommendations
1. **Commit to Keeper in the Moderation & Community track now.** It maximizes the highest-weighted criterion (Minds Integration Depth) and is the most differentiated against a field that will cluster on repurposing and growth.
2. **Build the persistence demo first, product second.** The 30–95s stretch (returning-member recognition → contextual moderation → autonomous on-chain reward) is what wins; engineer the member-return simulation and timeline view early so persistence is unmistakable on camera.
3. **Use multi-agent Circles + the wallet deliberately, not decoratively.** The Steward/Rewards split and on-chain contributor rewards are your innovation and sponsor-alignment differentiators — but keep them legible (two named agents, one clear reward action).
4. **Write the submission like a DoraHacks winner:** concrete problem statement, named agent components, explicit "here's exactly where the Mind's memory/continuity/autonomy do the work," and a business/investment slide targeting the Minds Investment Programme.
5. **Play the student card explicitly:** position Keeper for creator *and* student/education communities and note eligibility for the Student Prize in the submission.
6. **Attend Open Campus office hours** to pressure-test the build against what mentors/judges signal they value, and to confirm exact prize amounts and any late rule clarifications.

**Benchmarks that would change this recommendation:**
- If office-hours signals reveal judges explicitly favor content-workflow/repurposing outcomes, pivot to **Encore** but keep the memory-of-brand-voice differentiator front and center.
- If multi-agent + wallet proves too demo-fragile to show cleanly by mid-build, **descope to single-agent Keeper** (drop the Rewards Mind, keep memory + contextual moderation + autonomous digest) rather than ship a shaky multi-agent demo.
- If the moderation track turns out to be crowded after registration chatter, lean harder into the **wellbeing framing (Aegis angle)** within Keeper to re-differentiate on emotional resonance.

## Caveats
- **Exact per-prize dollar amounts are not publicly posted.** The **$10,000 total pool** and the five-bucket structure (Grand Prize + Student Prize + three Track prizes) are confirmed on DoraHacks; the specific split (reported in the task as ~$2,300 Grand / ~$1,300 Student / track prizes ~$1,300) could not be independently verified from public pages and should be confirmed on the DoraHacks detail page or at office hours. The Minds Investment Programme figure cited for the event is "up to $250,000."
- **Skills are built conversationally, and the public API surface is thin/beta.** Minds documents Skill-building via natural-language description over email/Telegram; a Builder/Messaging API exists (seen via an Ethoswarm Bazaar listing using an `X-Access-Key`) but official API docs were not fully retrievable. Confirm the exact integration surface early, as it affects how much custom front-end Claude Code can wrap around the Mind.
- **"$MENTE" token is unconfirmed.** The consumable unit is consistently branded **Cognition / Cognition Credits** (LLM inference tokens); references to a "$MENTE" ticker could not be verified and should not be relied on in the pitch. Minor inconsistencies also appear across Minds' own pages (e.g., daily Cognition top-up listed as +100 vs +200; live Skill count cited as 1,000+ vs 3,000+).
- **Market-size figures vary widely by source** ($250B in 2023 → $480B by 2027 per Goldman Sachs; $1T+ by early 2030s per some firms) because definitions differ; treat them as directional, not precise. Likewise the burnout figure (78% in the 2025 Creator Economy Report vs 62% in a 2025 Creators 4 Mental Health study) varies by methodology.
- The platform is in **Beta**; capabilities (and the "cognition boost") are at the organizers' discretion and may change before the deadline.
