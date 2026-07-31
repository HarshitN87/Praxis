# Praxis — Fault Review and Corrected Build Map
**Reviewing:** Software Development Document v2.0
**Date:** 2026-07-31

---

## Part 0 — Verdict in one page

The document is well-written and unusually honest about its own limits. Most specs of this kind fail because they invent precision; this one explicitly refuses to. That instinct is correct and I've preserved it.

But it has three classes of problem:

1. **One architectural fault that defeats your stated goal.** You said you want to measure *every* decision, small to large. The spec splits decisions into three isolated silos (Decision Journal / Action Log / Daily Intentions) with three separate schemas, two incompatible confidence scales, and no shared calibration engine. The consequence is fatal and concrete: the Decision Journal gates its Brier score behind ≥20 resolved decisions, but by its own estimate you make 5–20 big decisions *per year*. **You would not see a calibration score until 2028.** Meanwhile the Daily Intention module generates 20 resolved predictions in under a week and throws that signal away in a separate table. Fixing this is the single highest-value change in this document (§F1).

2. **Statistical errors that would produce actively misleading output.** The `corr(confidence, completed) → 1.0` target is wrong — perfect calibration does not imply correlation 1.0, and chasing it would push you *away* from calibration. `corr(process_score, outcome_favorability) → 0` is also wrong as a target. The weekly digest mines 7-datapoint subgroups for advice, which the document's own Taleb section explicitly forbids. (§F2, §F3, §F4)

3. **Internal contradictions** — roughly a dozen places where two sections of the document require incompatible things. The clearest: §6.2 caps intention reminders at one per week; §4.10 requires a check-in every night at 8pm. (§F20–F31)

Below: a numbered fault register (each with a fix), then the corrected architecture, schema, book-mapping, metrics, and roadmap.

---

# Part 1 — Fault Register

Severity: **[CRITICAL]** breaks the stated goal · **[MAJOR]** produces wrong output or blocks the module · **[MINOR]** cleanup

---

## 1.1 Architecture

### F1 [CRITICAL] — Three silos mean you never reach calibration

**Fault.** `forecasts` (probability 0–1) and `daily_intentions.confidence` (integer 1–10) are structurally different beliefs about the future, stored in different tables, on different scales, feeding different analytics. `actions` has no prediction at all. Nothing pools.

Consequences:
- Brier score unlocks at ≥20 resolved *decisions*. At 5–20 big decisions/year, that's a 1–4 year wait. **The headline feature of the app is unreachable for years.** This is the difference between an app that works and one you abandon in month three.
- The 1–10 confidence scale has no defined mapping to probability. Is 5/10 = 50%? Is 1/10 = 10% or 0%? Undefined, so intention confidence can never be scored with a proper scoring rule and can never be compared to a forecast.
- You explicitly asked to measure "every single decision, small to big." The current design measures three disconnected things with three incompatible yardsticks.

**Fix.** Collapse to **one prediction spine**. Every belief about the future — "will I study 6 hours today", "will this job offer work out" — is a row in one `predictions` table, on **one scale: probability 0–1, always entered in frequency format**. A "decision," an "action," and a "daily intention" become *tiers* of one `commitments` table that differ only in which fields are required.

Result: you hit n≥20 in about three weeks. Calibration becomes a live instrument instead of a promise. And you can slice the same calibration curve by tier to answer the genuinely interesting question — *am I better at predicting the world or at predicting myself?* Full schema in Part 2.

---

### F2 [CRITICAL] — `corr(confidence, completed) → 1.0` is the wrong target

**Fault.** §4.10 and §7 set the validation metric as correlation between confidence and completion, "trending toward 1.0."

This is statistically wrong, and following it makes you worse. Correlation measures **discrimination** (do you rank days correctly?), not **calibration** (are your numbers right?). A perfectly calibrated forecaster who says 70% every day and hits 70% of days has a correlation of **0** — and is perfectly calibrated. Conversely you can reach correlation 1.0 while being wildly overconfident, by saying 9/10 on every day you succeed and 6/10 on every day you fail: perfect ranking, terrible numbers.

Chasing correlation 1.0 would push you toward extreme, confident-sounding predictions — the exact overconfidence Kahneman is cited to correct.

**Fix.** Use the **Murphy decomposition** of the Brier score, which separates the two properties cleanly:

```
Brier = Reliability − Resolution + Uncertainty
        (calibration)  (discrimination) (irreducible)
```

Report **Reliability** and **Resolution** as two separate lines, never combined:
- **Reliability → 0** is the calibration goal. This is the number that answers "when I say 70%, does it happen 70% of the time?"
- **Resolution → high** is the discrimination goal. This answers "do I actually know which days are different?"

Both matter, they trade off, and collapsing them into one number is what produced the error. This also fixes the fact that §4.10's calibration table and §7's correlation metric were measuring two different things while claiming to measure one.

---

### F3 [MAJOR] — `confidence_gap = confidence − (completed ? 10 : 0)` is not a metric

**Fault.** This computes a per-instance "gap" between a probabilistic belief and a binary outcome. Saying 9/10 and failing yields a "9-point gap." But a 9/10 prediction that fails is *expected* — it should fail 10% of the time. The formula assigns blame to a single correct prediction.

This directly contradicts the document's own foundation: §2 commits to Duke's separation of decision quality from outcome quality, then §4.10 implements pure resulting on a per-day basis.

**Fix.** Delete the per-instance gap. Calibration is only defined **over a set**. The correct per-instance quantity is the Brier component `(p − outcome)²`, which is stored but **never shown alone** — it's an input to the aggregate, not a daily score. The UI shows the user their outcome and their prediction side by side with no verdict attached.

---

### F4 [MAJOR] — The weekly digest is a noise-mining machine

**Fault.** §2 commits: "sample sizes below ~20 outcomes are shown with a *too early to read* flag rather than a calibration score." §4.10 and §10.3 then show, from **7 days of data**:

- "Exercise: 3/7 days hit target (43%) ... Confidence: 6/10 → actual: 4/10 (overconfident by 2 points)"
- "Best days: Tue, Thu (100%) | Worst: Sat, Sun (40%)" — subgroups of **n=1 and n=2**
- "Morning intentions: 80% hit | Evening intentions: 30% hit" — a subgroup split on 7 points
- "💡 Suggestion: try exercising earlier in the day"

Every one of these is noise. With 7 binary trials at a true rate of 60%, observing 3/7 is entirely unremarkable — the 95% interval on 3/7 runs roughly 12%–78%. Declaring "overconfident by 2 points" from that is exactly the failure mode Taleb is cited to prevent. And splitting 7 points by day-of-week guarantees you find a "pattern" every single week, in a different place each time.

The suggestion line also violates §6.4 ("never suggest what the intention *should* be").

**Fix.** Three rules, enforced in code, not in prose:

1. **No rate is displayed without its uncertainty interval.** Show `3/7 (43%, 95% CI 12–78%)` or show nothing. Seeing that interval once teaches you more about your own data than the whole digest.
2. **No calibration claim below n=20** *for that specific slice*. The weekly digest reports raw counts and the check-in response rate only. Calibration statements live in the 30/90-day view, where n is real.
3. **No subgroup discovery below n=30 per cell**, and pattern claims must survive a multiple-comparisons correction. With 7 categories × 7 weekdays × 2 times of day you have ~98 cells; at p<0.05 you will "find" ~5 spurious patterns per week forever.
4. **The app never suggests an intention.** It may show you a pattern once the pattern is real. It does not tell you to exercise earlier.

---

## 1.2 Daily Intention Tracker (§4.10)

### F5 [MAJOR] — The unique constraint forbids the documented behaviour

**Fault.**
```sql
UNIQUE (user_id, intention_date, category)
```
§4.10 says "user can set 1–5 intentions per day." This constraint permits at most **one per category per day** — you cannot set "study 3h of stats" and "study 2h of ML" on the same day. It also means correcting a mistaken entry requires deleting the original.

**Fix.** Drop the constraint entirely. Cap the count in application logic (soft warning at 3, hard cap at 5) — that's a UX choice, not a data integrity rule, and encoding it as a key is what broke it.

---

### F6 [MAJOR] — `completed BOOLEAN` is unfalsifiable next to `target_quantity`

**Fault.** The evening UI shows `[✅] Completed → 5.5 hours` against a 6-hour target. So `completed` is a **subjective self-verdict**. But the digest reports it as "5/7 days **hit target** (71%)". Those are different claims. Nothing stops you from tapping ✅ at 2 hours against a 6-hour target — and on a bad day you will, because the whole design nudges toward ✅.

If the resolution criterion is elastic, every downstream number — hit rate, calibration, Brier — is meaningless. This is the load-bearing measurement of the entire module.

**Fix.** Make resolution mechanical and decided **in advance**:
- For quantified intentions, `completed` is **computed**, not tapped: `actual_quantity >= target_quantity`. The user enters the number; the app does the comparison.
- Add `partial` as a first-class outcome and record `attainment = actual/target` for the (genuinely informative) partial-credit view. Keep the binary strictly binary for scoring.
- For binary intentions, require the user to write the resolution criterion at *setting* time: "How will I know tomorrow whether I did this?" This is Tetlock's question-decomposition discipline applied at the daily scale, and it's the single highest-leverage 5 seconds in the flow.
- **Never soften the display.** "5.5 of 6 hours — did not hit target" and nothing else. No "(close!)".

---

### F7 [MAJOR] — Missing check-ins silently inflate every number

**Fault.** `completed BOOLEAN` is nullable and there's no handling for "no evening check-in." A NULL is silently excluded from the hit rate. But check-ins are **not missing at random** — you skip the check-in on exactly the days that went badly. This biases the hit rate upward, systematically and invisibly, forever.

This is the most likely way the app quietly lies to you.

**Fix.**
- Add `resolution_status ENUM('resolved','unresolved','void')`. `void` is explicit and requires a reason (illness, travel, emergency) — it's excluded and counted.
- **Always display the response rate next to any hit rate**: "Study: 12/18 hit target — *but you only checked in on 18 of 27 days (67%)*."
- Add the honest bound: if all 9 missed days were failures, the true rate is 12/27 = 44%. Show the range. This one feature does more for your calibration than the entire digest.
- Any predictions still unresolved after 7 days auto-resolve to `unresolved` and are reported separately. They are never dropped.

---

### F8 [MAJOR] — The data model cannot support the analytics it promises

**Fault.** The digest claims "Morning intentions hit 80%, evening intentions hit 30%." There is no column for **when the intended activity is scheduled**. `created_at` is when you *logged* it (all intentions are logged in the morning, by design). The claimed analysis is uncomputable from the stated schema.

**Fix.** If you want time-of-day effects, add `planned_window` (`morning`/`afternoon`/`evening`/`unscheduled`) — which is also required for a correct Gollwitzer implementation anyway (see F9). If you don't want the extra field, delete the claim.

---

### F9 [MAJOR] — Gollwitzer is misimplemented, and the metric for it is invalid

**Fault, part one — the prompt is the wrong technique.** The spec asks: *"What could get in the way? If that happens, what will you do instead?"* That is **coping planning** / obstacle anticipation — closer to Oettingen's WOOP than to Gollwitzer. Gollwitzer's implementation intention is a commitment specifying **when, where, and how**: *"When situation X arises, I will perform response Y."* The mechanism is that a concrete situational cue becomes automatically linked to the action, so initiation doesn't require deliberation. Obstacle-handling is a useful *second* clause, not the technique itself.

**Fault, part two — the validation metric is confounded.** §7 proposes: "hit rate on days with implementation intention vs. days without." The prompt is **optional**, so you fill it in on the days you're already most committed. The comparison measures your motivation, not the technique. It will show a large fake effect and you'll believe it.

**Fix.**
- Rewrite the prompt with two required slots and one optional:
  - **When/where** (required if used): "When I sit down at my desk after breakfast..."
  - **Then I will** (required): "...I will open the problem set before opening email."
  - **If-then obstacle** (optional second clause): "If someone messages me, then I will reply after the block."
- To get a real causal read, **randomize it**: on each new intention, the app flips a coin and either prompts for the implementation intention or doesn't (you may always add one manually; those are tagged `user_initiated` and analysed separately). After ~60 intentions you have a genuine within-subject A/B on yourself. Store `ii_assignment ENUM('prompted','not_prompted','user_initiated')`.
- This is the only way the module's claim is falsifiable, and it costs nothing to build.

---

### F10 [MAJOR] — The outside view is missing exactly where it matters most

**Fault.** §4.7 correctly implements Tetlock's outside-view-first prompt for big decisions. Daily intentions — where you have *hundreds of directly relevant past cases of the identical question* — get no base rate at all. This is backwards. The daily tracker is the one place where the reference class is perfect, available, and already in your database.

The Kahneman citation in §2 is also imprecise: "people are overconfident about their own future behavior" is specifically the **planning fallacy** (Kahneman & Tversky; Buehler, Griffin & Ross), and the documented remedy is **reference-class forecasting** — which the spec cites but doesn't apply here.

**Fix.** Two-step confidence entry, ordering matters:
1. User commits their probability first (frequency format: *"Out of the next 10 days like today, on how many do I actually do this?"*).
2. **After committing** — never before, which would just anchor them — the app reveals: *"Your last 30 study intentions: you hit 19 (63%). You just said 80%."*
3. Optional revision, stored as a **separate second prediction**, with the first preserved. Now you can measure whether seeing your base rate improves you, which is itself a falsifiable claim about the feature.

---

### F11 [MINOR] — Anti-gamification is stated, then violated

**Fault.** §1.1 forbids gamification. The mockups contain `[✅] Exceeded!`, `(close!)`, `Your strongest category — keep it up!`, `☀️ Good morning`, `🌙`, `see you tonight!`. That is praise, encouragement, and a warm relationship — behavioral conditioning by another name, and it directly corrupts honest self-report by making ✅ feel better than ❌.

**Fix.** Neutral language, everywhere, no exceptions. "5.5 / 6 hours. Target not met." Emoji as category icons only, never as valence. No adjectives on results. The document's own §3.3 ("a quiet notebook, not a dashboard") is right — the mockups just don't follow it.

---

### F12 [MINOR] — Timezone bug in the day boundary

**Fault.** `intention_date DATE NOT NULL DEFAULT CURRENT_DATE` resolves to the *server's* date. Supabase runs UTC. An 8pm check-in in most of Asia lands on the next UTC day; your evening check-in silently attaches to tomorrow's intentions.

**Fix.** Add `users.timezone TEXT NOT NULL` (IANA). Compute `intention_date` client-side from local time and pass it explicitly. Define the "day boundary" as a user setting (default 04:00 local, not midnight — late nights shouldn't split a day).

---

### F13 [MINOR] — Re-entering the same intentions daily will kill adoption

**Fault.** "Study 6 hours" typed fresh every morning, forever. The 20-second claim is also optimistic: category + description + target + unit + confidence + implementation intention is six fields, realistically 60–90 seconds for the first and ~30 for subsequent ones.

**Fix.** **Intention templates.** Recurring intentions carry over with description/target/unit prefilled; only the **probability is always re-entered from scratch, every day** (that's the measurement — it must never be prefilled or defaulted). This gets a 3-intention morning to a genuine ~20 seconds and makes the friction claim true.

---

### F14 [MINOR] — Hardcoded category CHECK constraint

**Fault.** `CHECK (category IN ('study','exercise',...))` requires a database migration to add a category.

**Fix.** A `categories` lookup table with a FK, seeded with the defaults, user-editable.

---

### F15 [MINOR] — `logged_at` is undefined and duplicates `created_at`

**Fix.** Delete `logged_at`.

---

## 1.3 Decision Journal (§4.1)

### F16 [MAJOR] — There is no `chosen_option` column

**Fault.** `decisions.options TEXT[]` lists what you considered. Nothing records **what you actually chose**. You cannot review a decision without it, and the entire two-stage review is built on resurfacing a decision whose outcome depends on a choice the schema never stored.

**Fix.** Add `chosen_option TEXT` (nullable while `status='open'`, required to transition to `reviewed`) plus `chosen_at TIMESTAMPTZ`. Also add `option_id` as a proper FK — see the normalized schema in Part 2, since `TEXT[]` can't be referenced by forecasts either.

---

### F17 [MAJOR] — Brier is undefined when the real outcome wasn't on your list

**Fault.** `actual_outcome_label TEXT` is free-form; `forecasts` are keyed by `outcome_label`. If what actually happened isn't one of your 2–5 labels — which is common, and is precisely the interesting case — `brier_component` is undefined. The spec doesn't address it.

**Fix.** Two changes, and the second is a feature rather than a patch:
- Resolution requires selecting an existing forecast label **or** explicitly choosing "None of these — something I didn't consider."
- When that happens, score it as an outcome with forecast probability 0 (the maximally punishing and correct treatment), **and** log it to a **Surprise Rate** metric: *the fraction of decisions whose actual outcome was not in your option set.* This is a genuinely Talebian instrument — it measures the size of your blind spot rather than your accuracy within it, and no other metric in the document captures it. It is arguably more useful than the Brier score.

---

### F18 [MAJOR] — The two-stage review does not achieve what it claims

**Fault.** Stage 1 hides `actual_outcome_label` and asks for a process score. But **you already know the outcome** — you lived it. Hiding a text field in the UI does not create independence from hindsight. Duke's mechanism requires the process judgment to be made *before the outcome is known*, and this design cannot deliver that.

**Fix.** Two changes:
1. **Capture the process score at commit time**, when the outcome genuinely is unknown. `process_score_at_commit` (1–5, self-rated) is recorded when the decision is saved.
2. **Add an objective process score** computed by the app from the record itself — did you log ≥2 pre-mortems, ≥3 real options, a reference class, a resolution criterion, a margin-of-safety note where applicable? A checklist score is far more hindsight-resistant than any self-rating, and it's free.
3. At review, still collect `process_score_at_review`. The **difference between the two** is the real instrument — see F19.

---

### F19 [MAJOR] — `corr(process_score, outcome_favorability) → 0` is the wrong target

**Fault.** §4.1 and §7 set success as this correlation trending to zero. But if your process is genuinely good, better process *should* correlate positively with better outcomes — weakly and noisily, but positively. That's the entire reason to have a process. A correlation of exactly 0 would mean **your process has no value whatsoever**. The metric, taken seriously, targets uselessness.

Duke's actual claim is that people *infer* decision quality *from* outcomes — that the judgment is contaminated, not that the true correlation is zero.

**Fix.** Measure the contamination directly, which F18 now makes possible:

```
hindsight_delta = process_score_at_review − process_score_at_commit
```

Group by `outcome_favorability`. If good outcomes get systematic upward revisions and bad outcomes get downward ones, **that is resulting, quantified in your own data.** The target is `mean(hindsight_delta | good outcome) ≈ mean(hindsight_delta | bad outcome)` — no target of zero correlation, no implied claim that process doesn't matter. This is falsifiable, directly measures the thing Duke is worried about, and is strictly better than what the document proposes.

---

### F20 [MAJOR] — Abandoned decisions create selection bias

**Fault.** `status='abandoned'` with an `abandonment_reason`, but no flow, and abandoned decisions never resolve — so they never enter the Brier score. You abandon the ones going badly. Your calibration score is therefore computed on a survivor-biased sample. This is the exact mechanism Taleb is cited for, operating inside the tool built to detect it.

**Fix.** Abandonment **is** a resolution. `status='abandoned'` requires resolving the forecast (usually "none of the above," per F17) and counts in the denominator. Report an **abandonment rate** alongside everything else.

---

### F21 [MAJOR] — Probability sum enforced in app code will drift

**Fault.** "App enforces sum(probability) ≈ 1.0 at write time" — with an offline SQLite cache, a sync layer, and multiple clients, app-level invariants across rows *will* break. A decision with probabilities summing to 1.4 silently corrupts the Brier score with no error anywhere.

**Fix.** Store the forecast set as a single `JSONB` array on one row so the constraint is intra-row and enforceable by a `CHECK`, **or** keep the table and add a `DEFERRABLE` constraint trigger validating the sum at commit. Either way the database enforces it. Additionally, run a nightly integrity job that flags violating rows rather than silently scoring them.

---

### F22 [MINOR] — The 5–19 "directional signal" tier contradicts §2

**Fault.** §2 commits to a "too early to read" flag below ~20. §4.1 then shows "you're currently over/under-confident" at n=5. At n=5 that statement is nearly pure noise.

**Fix.** Under the unified spine (F1) you clear n=20 in about three weeks, so this tier mostly disappears. Where it's still needed: show **calibration-in-the-large with a confidence interval** and state a direction only when the interval excludes zero. Otherwise: "not enough data yet — 12 of 20."

---

### F23 [MINOR] — No `user_id` on child tables

**Fault.** `forecasts`, `premortems`, `reviews` have no `user_id`. Supabase RLS policies are per-table; you'd need a subquery join on every policy — slower, and easy to get wrong in a way that fails open.

**Fix.** Denormalize `user_id` onto every table and write a simple `user_id = auth.uid()` policy on each. Add `UNIQUE(decision_id)` on `reviews` while you're there — nothing currently prevents multiple review rows per decision.

---

## 1.4 Other modules

### F24 [MAJOR] — The game-theory spec contradicts itself

**Fault.** §2 (the contract table): "refuses to compute an equilibrium if more than half the cells are guesses." §4.4: "**Always** compute the equilibrium/dominant strategy on the stated numbers." These are opposite instructions for the same input.

**Fix.** §4.4's behaviour is the better one — a sensitivity analysis showing *which* guess would flip the recommendation teaches more than a refusal. Correct §2 to match, and update the contract table so the document has one position.

Also unspecified: with ≤3 moves/side and pure strategies only, many games (matching pennies) have **no** pure equilibrium. The spec never says what to display. Fix: display "no pure-strategy equilibrium — this is a situation where being unpredictable is itself the strategy," which is genuinely Dixit & Nalebuff's point about mixing, without pretending to compute mixed equilibria.

---

### F25 [MAJOR] — The delay-alert statistics are unusable as specified

**Fault.** "Require at least 2×D days of history; alert if `today > rolling_avg + 1.5·SD`." With `typical_delay_days = 1` (the common case), that computes a standard deviation from **two data points**. Beyond that: daily self-report data is strongly autocorrelated, bounded, non-normal, and lumpy. A 1.5 SD threshold on a 1–5 slider will fire constantly, and each false alarm trains you to ignore the next one.

**Fix.**
- Minimum window `max(21, 2×D)` days, hard floor.
- Use robust statistics: **median + 2·MAD**, not mean + 1.5·SD.
- Better still, drop point-alerting for **trend** comparison: trailing 7-day median vs. trailing 28-day median, alert only on a sustained shift (≥3 consecutive days beyond threshold).
- Keep the existing >30% missing-data suppression — that part is well-judged.
- Cap alerts at one per stock per week regardless.

---

### F26 [MAJOR] — The Meadows bands drop the two strongest leverage points

**Fault.** The four bands are `parameters`, `feedback_structure`, `information_flow`, `rules_and_goals`. Meadows' hierarchy places **goals** and **paradigms** *above* rules, as the strongest interventions of all. Merging "rules" with "goals" collapses two distinct levels, and **paradigms** and **self-organization** are dropped entirely. The document claims to use "Meadows' own grouping" — it doesn't.

**Second fault:** the validation metric ("interventions shift toward higher leverage bands over time") is a bad goal. Most interventions genuinely *should* be parameters — you don't get to choose the level a problem lives at, and optimizing this metric means misclassifying your own interventions upward.

**Fix.**
- Five bands, in Meadows' order: `parameters` → `feedback_and_delays` → `information_flows` → `rules` → `goals_and_paradigms`.
- Replace the metric with the one that's actually falsifiable: **for each intervention, did the linked stock move in the intended direction within 2× the flow's delay?** Then report effectiveness *by band*. That tests Meadows' claim against your own life instead of assuming it.

---

### F27 [MAJOR] — The Independent-Judgment Lock implements the wrong half of *Noise*

**Fault.** The spec hides your prior estimate to force a fresh read. But *Noise*'s mechanism isn't concealment — it's **aggregation of independent judgments**. For a single user the applicable technique is "the crowd within" (Vul & Pashler; Herzog & Hertwig): make a second genuinely independent estimate, then **average them**. Averaging two independent estimates from the same person reliably beats either one.

The spec hides the first estimate and then... shows both for comparison. It does the hard part and skips the payoff.

**Fix.** After the second independent estimate, store **all three**: `estimate_1`, `estimate_2`, and `working_forecast = mean(estimate_1, estimate_2)`. The average becomes the scored forecast. Then measure whether the average actually beat estimate_1 in your own Brier history — a clean, self-contained test of the technique.

The 48-hour conditional gate is well-designed and should stay.

---

### F28 [MAJOR] — The reframing module's schema forbids the only design that could validate it

**Fault.** `reframe_shown TEXT NOT NULL` means **every** entry gets a reframe. There is no control condition, so `mean(actual − predicted)` can never distinguish "the reframe worked" from "I'm just bad at predicting difficulty." The module's validation metric cannot validate the module.

**Fix.** Make it nullable and **randomize**: roughly 50% of entries get a reframe, 50% don't (a `reframe_condition` column records the assignment). Compare the predicted-vs-actual gap across conditions. This is a real within-subject experiment you can run on yourself, it's the honest version of Robson's claim, and it costs one column.

---

### F29 [MAJOR] — Distress detection is unspecified and probably harmful

**Fault.** "Detection of distress signals suppresses the reframing prompt." Never defined. The stack has no LLM in the core loop, so this is a keyword matcher — which will be both over-inclusive (flagging "this is killing me" about a spreadsheet) and under-inclusive (missing real distress that doesn't use keywords). Worse, it **silently changes the UI** with no explanation, which is confusing at best.

**Fix.** Delete the detection. Keep a fixed, always-visible, non-dismissible crisis-resources footer on every screen of the module — which the spec already requires and which is the part that actually helps. Add a **manual** control: "Skip reframing prompts for now," user-controlled, reversible. Unreliable detection is worse than none, because it creates a false impression that something is watching.

---

### F30 [MINOR] — The Widen-Options Gate produces filler options

**Fault.** A hard "≥3 options or you can't save" produces three options where the third is padding ("do nothing"), and the requirement is stated at the moment of blocking — which frames the vanishing-options prompt as a punishment rather than the generative tool Heath & Heath intend. It also contradicts §4.1's `options` minimum of 2.

**Fix.** Invert the order. Run the vanishing-options prompt (*"if every option here vanished, what would you do?"*) **proactively**, before any count check, on every hard-to-reverse decision. Then allow saving with 2 options **if** the user records a one-line reason why the set is genuinely binary — recorded, reviewable at Stage 1, and counted. A soft gate with a logged override beats a hard gate that gets satisfied with garbage.

---

### F31 [MINOR] — Notification policy contradicts the daily module

**Fault.** §6.2: "no more than **one** intention-check-in reminder **per week**." §4.10: check-in every evening at 8pm. A daily module cannot run on a weekly reminder cap.

**Fix.** State the policy correctly: **at most one notification per day, total, across the entire app** (the evening check-in), plus one weekly digest. Default the daily reminder to **on** for the intention module — it's the only module that structurally requires it — with a single-tap disable. The anti-burnout principle is preserved by the *total* cap, not by crippling the one daily feature.

---

### F32 [MINOR] — "Automatic sync" between expo-sqlite and Supabase does not exist

**Fault.** §3.2 lists `expo-sqlite` for "local persistence for offline use with **automatic sync**." There is no automatic sync between expo-sqlite and Supabase. You would be writing a conflict-resolution layer, which is one of the harder things in client engineering and is nowhere in the roadmap's time estimates.

**Fix.** For a single user on 2 devices, don't build a sync engine:
- **Simplest:** an outbox queue — mutations append to a local queue, flush on connectivity, server timestamps win. All your writes are append-mostly (a prediction, a resolution), which makes conflicts genuinely rare.
- **Or** adopt PowerSync / WatermelonDB rather than hand-rolling.
- **Or** for Phase 1, go **online-only** with optimistic UI and revisit offline once the loop has proven itself. Given that the morning flow takes 20 seconds and you'll usually have connectivity, this is the right call for v1.

---

### F33 [MINOR] — No way to find anything

**Fault.** There is no search, no tags, no unified timeline. For "every decision, small to big" — which will be thousands of rows within a year — there is no specified way to retrieve a past entry.

**Fix.** A unified, reverse-chronological timeline across all tiers with full-text search (Postgres `tsvector`) and free-form tags. This falls out naturally from the unified spine in Part 2.

---

### F34 [MINOR] — §7.1's pre-registration is a commitment device, not a guarantee

**Fault.** "The app pre-registers this comparison internally with a timestamp, so the user can't retroactively cherry-pick." You own the database, the app, and the source. You can change anything.

**Fix.** Keep the feature — pre-commitment genuinely helps even when it's self-enforced — but label it honestly in-product: "a commitment device, not a guarantee." The document is elsewhere scrupulous about this kind of overclaim; this is the one place it slips.

---

# Part 2 — Corrected Architecture

## 2.1 The core idea: one prediction spine

Everything you want to measure has the same shape:

> **a belief about the future → a commitment → an outcome → a comparison**

A big irreversible decision and "will I study 6 hours today" differ only in **stakes, reversibility, and how much structure is worth building around them.** They should not differ in *how the prediction is stored or scored.*

```
                    ┌──────────────────────────────┐
                    │        COMMITMENTS           │
                    │  tier: intention / action /  │
                    │        decision              │
                    │  the one timeline            │
                    └──────────────┬───────────────┘
                                   │ 1..n
                    ┌──────────────▼───────────────┐
                    │        PREDICTIONS           │
                    │  probability 0–1, always     │
                    │  entered in frequency format │
                    └──────────────┬───────────────┘
                                   │
                    ┌──────────────▼───────────────┐
                    │        RESOLUTIONS           │
                    │  resolved / unresolved / void│
                    └──────────────┬───────────────┘
                                   │
      ┌────────────────────────────▼────────────────────────────┐
      │              ONE CALIBRATION ENGINE                     │
      │  Brier · Reliability · Resolution · calibration curve   │
      │  sliceable by tier, category, horizon, stakes           │
      └─────────────────────────────────────────────────────────┘
```

**Why this is the fix.** Volume flows to where you need it. Daily intentions produce ~1,000 predictions/year; big decisions produce ~10. Under the old design those 1,000 are wasted on a separate 1–10 scale. Under the spine they build a real calibration curve within weeks, and your ten big decisions get scored *against a curve you've already earned.* When you make an important decision and say "70%," you'll know from 400 prior cases what your 70% has historically been worth.

That is precisely what you asked for: every decision, small to large, on one instrument.

## 2.2 The three tiers

| | **Intention** | **Action** | **Decision** |
|---|---|---|---|
| Frequency | daily, several | as they occur | 5–20/year |
| Friction budget | ~20 s | ~5 s | 10–30 min |
| Predictions | exactly 1 (binary: will I do it) | 0 or 1 (optional) | 2–5 (mutually exclusive) |
| Required | category, description, resolution criterion, probability | description, discomfort | context, ≥2 options, ≥2 pre-mortems, chosen option, reversibility, review date |
| Gates | none | none | ruin check, widen-options, margin-of-safety |
| Feeds calibration | ✅ | ✅ when a prediction is attached | ✅ |

The **action** tier gets an optional prediction, which the original spec lacked entirely — a one-tap "will this go well? 7/10" on a low-stakes action costs nothing and pours volume into the calibration engine from a third source. This is how "every single decision" becomes literally true.

## 2.3 One scale, one input method

Every probability in the app is entered the same way, at every tier:

> **"Out of 10 times in a situation like this, how many go this way?"**

Frequency format (Gigerenzer) is easier to reason about than percentages and it's already the right instinct in §4.1 — the correction is applying it *everywhere*, including daily intentions, instead of introducing a second 1–10 "confidence" scale with no probabilistic meaning. Stored internally as `NUMERIC(4,3)`; a finer slider is available on long-press for people who want 0.85.

---

# Part 3 — Corrected Schema

```sql
-- ============================================================
-- FOUNDATION
-- ============================================================

CREATE TABLE users (
  id UUID PRIMARY KEY,
  timezone TEXT NOT NULL DEFAULT 'UTC',        -- F12
  day_boundary_hour INT NOT NULL DEFAULT 4      -- day starts 04:00 local
    CHECK (day_boundary_hour BETWEEN 0 AND 12),
  checkin_hour INT NOT NULL DEFAULT 20,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE categories (                        -- F14: no hardcoded CHECK
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  icon TEXT,
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (user_id, name)
);

-- ============================================================
-- THE SPINE
-- ============================================================

CREATE TABLE commitments (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  tier TEXT NOT NULL CHECK (tier IN ('intention','action','decision')),
  category_id UUID REFERENCES categories(id),
  title TEXT NOT NULL,
  context TEXT,

  -- when this belongs to, in the USER'S local calendar (F12)
  local_date DATE NOT NULL,
  planned_window TEXT CHECK (planned_window IN               -- F8
    ('morning','afternoon','evening','unscheduled')),

  -- resolution contract, written BEFORE the outcome (F6)
  resolution_criterion TEXT NOT NULL,
  target_quantity NUMERIC,
  target_unit TEXT,

  -- decision-tier only
  reversibility TEXT CHECK (reversibility IN
    ('reversible','hard_to_reverse','irreversible')),
  chosen_option_id UUID,                                     -- F16, FK added below
  chosen_at TIMESTAMPTZ,
  review_due_at TIMESTAMPTZ,
  is_financial BOOLEAN NOT NULL DEFAULT FALSE,
  margin_of_safety_note TEXT,
  defines_enough BOOLEAN,

  -- action-tier only
  discomfort_level INT CHECK (discomfort_level BETWEEN 1 AND 5),
  constraint_id UUID REFERENCES constraints(id),

  -- process capture at commit time, before outcome is known (F18)
  process_score_at_commit INT CHECK (process_score_at_commit BETWEEN 1 AND 5),
  process_checklist_score NUMERIC(3,2),   -- computed by app, 0..1

  -- experiment assignments (F9, F28)
  ii_assignment TEXT CHECK (ii_assignment IN
    ('prompted','not_prompted','user_initiated')),
  implementation_intention_when TEXT,      -- "when I sit down after breakfast"
  implementation_intention_then TEXT,      -- "I will open the problem set"
  implementation_intention_if_then TEXT,   -- optional obstacle clause

  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','resolved','abandoned','void')),
  tags TEXT[] NOT NULL DEFAULT '{}',                          -- F33
  search_vector TSVECTOR,                                     -- F33
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- NO unique constraint on (user_id, local_date, category_id) -- F5
CREATE INDEX ON commitments (user_id, local_date DESC);
CREATE INDEX ON commitments USING GIN (search_vector);
CREATE INDEX ON commitments USING GIN (tags);

-- Options as rows, not TEXT[], so forecasts can reference them (F16)
CREATE TABLE options (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  commitment_id UUID NOT NULL REFERENCES commitments(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  is_vanishing_option_answer BOOLEAN NOT NULL DEFAULT FALSE,  -- F30
  differentiation TEXT
);
ALTER TABLE commitments ADD CONSTRAINT fk_chosen_option
  FOREIGN KEY (chosen_option_id) REFERENCES options(id);

-- ============================================================
-- PREDICTIONS — one scale for the whole app (F1)
-- ============================================================

CREATE TABLE prediction_sets (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  commitment_id UUID NOT NULL REFERENCES commitments(id) ON DELETE CASCADE,

  -- F27: "crowd within" — pass 1, pass 2, and the averaged working forecast
  pass TEXT NOT NULL DEFAULT 'first'
    CHECK (pass IN ('first','second','averaged')),
  is_working_forecast BOOLEAN NOT NULL DEFAULT TRUE,

  -- F10: outside view, captured but revealed only AFTER pass 1 commits
  reference_class TEXT,
  reference_class_rate NUMERIC(4,3),
  base_rate_shown_at TIMESTAMPTZ,

  -- probabilities live in ONE row so the sum is enforceable (F21)
  outcomes JSONB NOT NULL,
  -- [{option_id, label, probability}, ...]

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT probs_sum_to_one CHECK (
    abs((SELECT sum((o->>'probability')::numeric)
         FROM jsonb_array_elements(outcomes) o) - 1.0) < 0.011
  )
);
-- NOTE: if your PG version rejects a subquery in CHECK, use an
-- equivalent BEFORE INSERT/UPDATE trigger. The point is that the
-- DATABASE enforces it, never the client. (F21)

CREATE UNIQUE INDEX one_working_forecast
  ON prediction_sets (commitment_id) WHERE is_working_forecast;

-- ============================================================
-- RESOLUTION
-- ============================================================

CREATE TABLE resolutions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  commitment_id UUID NOT NULL REFERENCES commitments(id) ON DELETE CASCADE,

  status TEXT NOT NULL CHECK (status IN                        -- F7
    ('resolved','unresolved','void')),
  void_reason TEXT,
  CONSTRAINT void_needs_reason CHECK (status <> 'void' OR void_reason IS NOT NULL),

  resolved_option_id UUID REFERENCES options(id),
  unforeseen_outcome BOOLEAN NOT NULL DEFAULT FALSE,           -- F17
  unforeseen_description TEXT,

  actual_quantity NUMERIC,
  hit_target BOOLEAN,          -- COMPUTED by app, never tapped (F6)
  attainment NUMERIC(5,3),     -- actual / target
  outcome_favorability INT CHECK (outcome_favorability BETWEEN -2 AND 2),

  process_score_at_review INT CHECK (process_score_at_review BETWEEN 1 AND 5),
  process_reasoning TEXT,
  reversibility_matched_experience BOOLEAN,

  note TEXT,
  brier_component NUMERIC(6,4),   -- stored, never displayed alone (F3)
  resolved_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (commitment_id)                                        -- F23
);

-- ============================================================
-- SUPPORTING MODULES (unchanged tables omitted for brevity;
-- corrections noted)
-- ============================================================

CREATE TABLE premortems (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  commitment_id UUID NOT NULL REFERENCES commitments(id) ON DELETE CASCADE,
  failure_mechanism TEXT NOT NULL,
  estimated_likelihood TEXT CHECK (estimated_likelihood IN ('low','medium','high')),
  is_reversible_if_hit BOOLEAN NOT NULL
);

CREATE TABLE interventions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  stock_id UUID REFERENCES stocks(id),
  description TEXT NOT NULL,
  leverage_band TEXT NOT NULL CHECK (leverage_band IN          -- F26: five bands
    ('parameters','feedback_and_delays','information_flows',
     'rules','goals_and_paradigms')),
  intended_direction TEXT CHECK (intended_direction IN ('increase','decrease')),
  effect_check_due_at TIMESTAMPTZ,     -- 2× flow delay
  effect_observed TEXT CHECK (effect_observed IN
    ('as_intended','no_change','opposite','too_noisy_to_tell')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE reframing_logs (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  task_description TEXT NOT NULL,
  predicted_difficulty INT CHECK (predicted_difficulty BETWEEN 1 AND 10),
  reframe_condition TEXT NOT NULL CHECK (reframe_condition IN  -- F28
    ('reframe','control')),
  reframe_shown TEXT,                   -- NULL in control arm
  actual_difficulty INT CHECK (actual_difficulty BETWEEN 1 AND 10),
  logged_before_task_at TIMESTAMPTZ NOT NULL,
  logged_after_task_at TIMESTAMPTZ
);
```

Every table carries `user_id` so RLS is a one-line `user_id = auth.uid()` policy (F23).

---

# Part 4 — Corrected Book → Feature Mapping

Where the original mapping was wrong or under-implemented:

| Source | What the original built | **Correction** |
|---|---|---|
| **Duke** | Two-stage review with outcome hidden at Stage 1 | Hiding a field doesn't remove hindsight (F18). Capture process score **at commit**, add an **objective checklist score**, and measure **hindsight_delta** — resulting made visible in your own data (F19). |
| **Taleb** | Ruin check + n≥20 gate | Correct and well-judged. Add **Surprise Rate** — how often reality wasn't on your list (F17) — and close the **abandonment** survivorship hole (F20). |
| **Silver** | Brier + calibration curve | Add the **Murphy decomposition**: report reliability and resolution separately, never combined (F2). One curve across all tiers (F1). |
| **Kahneman (planning fallacy)** | 1–10 confidence, gap formula | The 1–10 scale can't be scored (F1); the gap formula is resulting (F3). Replace with probabilities and **reference-class forecasting on your own history, revealed after you commit** (F10). |
| **Gollwitzer** | "What could get in the way?" | That's coping planning, not an implementation intention. Use **when/where → then I will**, with the obstacle clause optional — and **randomize the prompt** so the effect is measurable rather than confounded by self-selection (F9). |
| **Meadows** | Four bands, "shift upward" metric | Five bands in Meadows' actual order, restoring goals/paradigms (F26). Replace the metric with **did the stock actually move**, reported per band. |
| **Kahneman/Sibony/Sunstein** | Hide prior estimate | *Noise*'s mechanism is aggregation. Take a second independent estimate and **average them** — "the crowd within" — and score the average (F27). |
| **Tetlock** | Outside view for big decisions | Extend to daily intentions, where the reference class is perfect and already in your database (F10). Add the resolution criterion at set time (F6). |
| **Heath & Heath** | Hard ≥3 option gate | Produces filler. Run vanishing-options **proactively**, allow a logged 2-option override (F30). |
| **Robson** | Reframe on every entry | No control arm means the module can't be validated. **Randomize reframe vs. control** (F28). |
| **Dixit & Nalebuff** | Contradictory refuse/always-compute | Always compute + sensitivity (F24). Handle the no-pure-equilibrium case. |
| **Clear** | Habit loop log | Fine. Tighten by linking `environment_redesign` to a dated before/after window on the flow. |
| **Housel** | Margin-of-safety tag | Good and correctly wired into the ruin check. No change. |
| **Klein** | Pre-mortem, dual attribution | Correct. No change. |

---

# Part 5 — Corrected Metrics

Replacing §7 wholesale. Every metric is falsifiable, none are combined into an index, and each states its minimum n.

| Question | Metric | Min n | Notes |
|---|---|---|---|
| Are my probabilities honest? | **Reliability** (Murphy) → 0, with CI | 20 total; 5 per bin | Pooled across all tiers; sliceable |
| Do I actually distinguish cases? | **Resolution** (Murphy) → high | 20 | Reported *beside* reliability, never merged (F2) |
| How big is my blind spot? | **Surprise Rate** — outcome wasn't in my option set | 10 decisions | New. Arguably the most useful number here (F17) |
| Am I resulting? | **hindsight_delta** by outcome favorability | 15 reviews | Replaces the corr→0 target (F19) |
| Am I honest at check-in? | **Response rate** + best/worst-case hit-rate bounds | always shown | Guards against the biggest self-deception risk (F7) |
| Do implementation intentions work *for me*? | Hit rate: `prompted` vs `not_prompted` arms | 30/arm | Randomized, so it's causal (F9) |
| Does reframing work *for me*? | Difficulty gap: `reframe` vs `control` | 20/arm | Randomized (F28) |
| Does seeing my base rate help? | Brier of pass-1 vs. post-base-rate revision | 30 revisions | Tests the feature itself (F10) |
| Does averaging two estimates help? | Brier of `averaged` vs `first` | 20 | Tests the crowd-within (F27) |
| Do my interventions work? | % `effect_observed = as_intended`, by leverage band | 5/band | Replaces "shift upward" (F26) |
| Is agency increasing? | Weekly action count by constraint category | 8 weeks | Kept from original |

**Display rules, enforced in the query layer, not in prose:**
1. No rate without its 95% interval.
2. No claim below its minimum n — show `12 / 20` progress instead.
3. No subgroup below n=30/cell, and no automatic pattern-hunting across the ~100-cell grid (F4).
4. Never a composite score.

---

# Part 6 — Corrected Roadmap

**The original phasing is backwards for you.** It puts the Decision Journal first (8–10 weeks) — the module that produces ~2 entries/month and no feedback for years — and the Daily Intention Tracker at Phase 2b. You'd spend three months building something that stays empty and gives you nothing back. That's how solo projects die.

Build the **high-volume loop first.** It's the one that proves the concept to you within a month, and it's what forces you to get the calibration engine right before anything depends on it.

### Phase 0 — Spine + calibration engine (2–3 weeks)
`users`, `categories`, `commitments`, `options`, `prediction_sets`, `resolutions`. The frequency-format probability input. Brier + Murphy decomposition + calibration curve with binning, minimum-n gating, and CIs. Unified timeline + search.
**Build the engine before any module, so no module can invent its own scale.**

### Phase 1 — Intention tier (2–3 weeks)
Morning flow (~20s with templates), evening resolution with computed hit-target, void/unresolved handling, response-rate reporting. Randomized implementation-intention assignment. Base rate revealed after commit.
**By end of Phase 1 you have a working calibration curve within 3 weeks of use.** This is the payoff the original design deferred to 2028.

### Phase 2 — Action tier (1–2 weeks)
Quick log, discomfort tap, optional one-tap prediction. Constraint classifier with the safety-first ordering (the original spec's handling here is good — keep it as written).

### Phase 3 — Decision tier (4–6 weeks)
Full structure: pre-mortems, ruin check, reversibility tension warning, widen-options with logged override, margin-of-safety gate, chosen-option capture, process score at commit + checklist score, two-stage review, hindsight_delta, surprise rate, abandonment-as-resolution.
Now it lands on a calibration curve you've already earned.

### Phase 4 — Crowd-within + outside view (1–2 weeks)
Second independent estimate, averaging, the 48h conditional lock, reference-class capture. Small, high-value, and depends on Phase 0's scale being right.

### Phase 5 — Systems Map (3–4 weeks)
Stocks, flows, five leverage bands, robust median/MAD trend alerting with the 21-day floor, intervention effect-checks. Habit loops attached to flows.

### Phase 6 — Reframing (1–2 weeks)
Randomized reframe/control. Fixed crisis-resource footer, no detection.

### Phase 7 — Strategic sketch (2–3 weeks, genuinely optional)
Lowest value per week of the whole set. It fires a handful of times a year and only for negotiations. Build it last, or not at all until you've missed it.

### Phase 8 — Evaluation dashboard (2 weeks)
All metrics from Part 5 with intervals and n-gates. The 90-day self-controlled comparison, honestly labeled as a commitment device (F34).

**Total: ~18–27 weeks**, vs. the original's ~40+, and you get a working feedback loop in week 5 rather than year 2.

---

# Part 7 — What to Cut

Say no to these now, so they don't consume you later:

1. **The Strategic Sketch Tool** — or defer indefinitely. Highest complexity, lowest firing rate, and the honest version (sensitivity analysis over guessed payoffs) mostly tells you "you don't know enough," which you could have known without the module.
2. **Offline sync in v1** (F32). Online-only with optimistic UI. Revisit when you've actually been blocked by it.
3. **Distress detection** (F29). Keep the always-visible resources; delete the classifier.
4. **The weekly pattern-discovery digest** (F4). Replace with a monthly view that only speaks when n supports it. A weekly digest on 7 data points can only generate noise.
5. **The 5–19 "directional signal" tier** (F22). Under the spine you pass 20 in three weeks; the tier is unnecessary complexity that also happens to violate your own stated principle.

---

# Part 8 — The Two Things That Matter Most

If you take nothing else from this review:

**1. One prediction spine, one probability scale, one calibration engine (F1).** This is what makes "measure every decision, small to big" literally true rather than aspirational, and it's what makes the app give you something back inside a month instead of inside two years. Everything else in this document is refinement; this is structural.

**2. Separate calibration from discrimination, and never show a rate without its uncertainty (F2, F4).** The original design would have confidently told you things about yourself that were pure noise — and because it was built on serious books and looked rigorous, you would have believed them. An instrument that says "not enough data yet" is worth more than one that always has an answer.

The document's instinct — refuse false precision, keep every metric falsifiable, never combine into an index — was right. The faults above are all cases where the implementation drifted from that instinct. Fixing them makes the app match its own stated philosophy.
