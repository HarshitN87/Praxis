# Praxis

A decision-support and agency system. One prediction spine, one calibration engine.

Built from the corrected specification in [PRAXIS_REVIEW_AND_BUILD_MAP.md](PRAXIS_REVIEW_AND_BUILD_MAP.md),
which reviews the v2.0 design document and fixes 34 numbered faults in it.

---

## Run it

```bash
npm install
```

```bash
npm run dev
```

Then open http://localhost:5173. On your phone, open the same URL on your local
network and use "Add to Home Screen" — it installs as a standalone app and works
offline.

```bash
npm test
```

```bash
npm run build
```

---

## Deploy it permanently

The build output in `dist/` is a plain static site. It needs HTTPS — service
workers and "Add to Home Screen" only work in a secure context, so serving it
from your laptop's LAN IP over `http://192.168.x.x` will **not** give you an
installable app.

Config files for the three main hosts are already in the repo
(`netlify.toml`, `vercel.json`, `public/_headers`). They set the one header that
matters: `sw.js` must never be cached, or an installed device can get pinned to
an old build.

**Fastest — drag and drop, no CLI, no git:**

1. `npm run build`
2. Go to https://app.netlify.com/drop and drag the `dist` folder onto the page.
3. Create a free account when prompted so the URL is permanent, then rename the
   site under Site settings → Change site name.

**Or from the command line:**

```bash
npx vercel --prod
```

**Or with auto-deploy on every change:** push this folder to GitHub and connect
it to Cloudflare Pages or Netlify. Build command `npm run build`, output
directory `dist`. Every push then redeploys.

Avoid GitHub Pages unless you set Vite's `base` — the app is served from the
domain root and its manifest, icons and service worker all use absolute paths.

### Install on your devices

Open the deployed URL and:

- **Android / Chrome** — menu → "Install app" or "Add to Home Screen"
- **iPhone / Safari** — Share → "Add to Home Screen"
- **Desktop Chrome/Edge** — the install icon in the address bar

It then opens in its own window with no browser chrome, and works offline.

### ⚠️ Your devices will hold separate data

This is the thing to understand before you rely on it. IndexedDB is per-device.
Installing on your laptop and your phone gives you **two independent notebooks**
that never see each other.

For this app that is not a small inconvenience. The whole architecture
(fault F1) exists so every prediction pools into **one** calibration curve. Split
across two devices:

- each device needs its own 20 resolved predictions before it shows you anything
- reliability and resolution are each computed on half your data
- per-category verdicts (30 needed) may never clear on either device
- the base-rate reveal shows you a track record that is missing half your history

Until real sync exists, **pick one device as the master** — the phone, because
that is where the morning and evening loop actually happens — and use
Settings → Export on it if you want a backup or want to look at the data on the
laptop. Import replaces everything, so treat it as restore, not merge.

---

## What it does

You write down what you think will happen — as a probability, before you know.
Later you record what actually happened. Over enough of those, the app can show
you whether your 70% means 70%.

Three tiers of the same thing:

| | Frequency | Friction | Predictions |
|---|---|---|---|
| **Intention** | daily, 1–5 | ~20s | exactly one (will I do it) |
| **Action** | as they occur | ~5s | optional |
| **Decision** | 5–20/year | 10–30 min | 2–5 mutually exclusive outcomes |

They differ in how much structure is worth building around them. They do **not**
differ in how they are stored or scored. Everything lands on one calibration
curve — which is what makes the app useful within weeks instead of years.

---

## Architecture

```
src/
  domain/          pure logic — no UI, no storage, fully unit-tested
    types.ts         the unified spine
    stats.ts         Wilson intervals, robust spread, correlation
    probability.ts   one scale, frequency-format entry
    calibration.ts   Brier, Murphy decomposition, curve, min-n gating
    metrics.ts       the 11-metric evaluation suite
    gates.ts         ruin check, widen-options, margin of safety, the lock
    process.ts       objective checklist, hindsight contamination
    resolution.ts    computed hit-targets, response-rate bounds
    systems.ts       delay-aware trend alerting, leverage bands
    game.ts          dominance elimination, equilibria, sensitivity
    randomise.ts     experiment assignment, reframe library, crisis resources
    dates.ts         timezone-correct day boundaries
  data/
    db.ts            IndexedDB schema (maps 1:1 onto the Postgres schema)
    repo.ts          the single write path; enforces every invariant
    backup.ts        export / import / wipe
  components/      shared UI
  screens/         one file per screen
  app/             shell, routing, store
```

**The domain layer has no dependency on React or IndexedDB.** All the logic that
matters is pure functions over plain data, which is why it can be tested
exhaustively and why swapping the storage backend later is contained.

### Data

Everything lives in IndexedDB on your device. No account, no server, no
analytics, nothing leaves the machine. Which also means **clearing your browser
data deletes it** — export a backup occasionally from Settings.

The store shapes map 1:1 onto the corrected Postgres schema in Part 3 of the
build map, and every write goes through `repo`, so moving to a hosted database
later is a contained change rather than a rewrite.

---

## The corrections this implements

The v2.0 document was well-written and unusually honest about its limits. These
are the places its implementation drifted from its own stated philosophy.

**Architecture**

- **F1** — one prediction spine. v2.0 split decisions into three silos with two
  incompatible confidence scales, gating the Brier score behind ≥20 resolved
  *decisions* at 5–20 decisions/year. The headline feature was unreachable until
  roughly 2028. Pooled, you clear n=20 in about three weeks.

**Statistics**

- **F2** — Murphy decomposition (reliability vs. resolution, reported
  separately) replaces `corr(confidence, completed) → 1.0`. A perfectly
  calibrated forecaster who says 70% daily and hits 70% has correlation **zero**;
  chasing 1.0 drives you toward overconfidence.
- **F19** — `hindsight_delta` replaces `corr(process, outcome) → 0`, which
  targeted uselessness. Duke's claim is that the *judgment* is contaminated, not
  that the correlation is zero.
- **F3** — the per-instance "confidence gap" is deleted. A 90% prediction that
  fails is expected to fail 10% of the time.
- **F4** — no rate without its interval; no claim below its minimum n; no
  subgroup below 30/cell. The weekly digest that mined 7 data points for advice
  is gone.

**Measurement integrity**

- **F6** — `hitTarget` is computed from actual vs. target, never tapped.
- **F7** — unanswered check-ins are an explicit state, and every hit rate is
  shown with its response rate and honest bounds.
- **F17** — "none of these" is a first-class outcome, scored at probability 0
  and counted as a **surprise rate**.
- **F20** — abandonment is a resolution, closing the survivorship hole.
- **F21** — the probability distribution lives in one row, so the sum-to-one
  invariant is enforceable.

**Book fidelity**

- **F9** — Gollwitzer's when/where→then, with the prompt **randomised** so the
  effect is measurable rather than confounded by self-selection.
- **F10** — reference-class forecasting extended to daily intentions, revealed
  *after* you commit so it informs rather than anchors.
- **F27** — the crowd within: two independent reads, **averaged**. v2.0 hid the
  prior estimate but never aggregated, which is the actual mechanism in *Noise*.
- **F28** — reframing randomised against a control arm, without which the module
  could never be validated.
- **F26** — five Meadows bands with goals and paradigms restored, and the metric
  changed to "did the stock actually move?".
- **F24** — the game tool always computes, then shows which guess would overturn
  the answer; handles the no-pure-equilibrium case honestly.
- **F30** — vanishing-options runs proactively; the 3-option rule is a soft gate
  with a logged override, because a hard gate gets satisfied with filler.

**Product**

- **F11** — no praise, no celebration, no "(close!)". Results are stated.
- **F25** — robust statistics with a 21-day floor and a sustained-departure
  requirement, replacing an SD computed from two data points.
- **F29** — distress detection deleted; crisis resources always visible.
- **F31** — notification policy corrected (v2.0 capped intention reminders at one
  per week while requiring a nightly check-in).
- **F12** — timezone-correct day boundaries, default 4am.

Full detail, including the ones not listed here, is in the build map.

---

## Tests

176 tests across the domain and data layers.

```bash
npm test
```

The ones worth knowing about:

- The **Murphy identity** (`brier = reliability − resolution + uncertainty`)
  is asserted to 12 decimal places on both hand-built and randomised data. If it
  does not hold exactly, the two headline numbers are not measuring what they
  claim to.
- **Wilson intervals** are checked to be wide at small n — the property the whole
  display policy rests on.
- **Every gate** has its trigger and non-trigger case.
- The **game solver** is checked against prisoner's dilemma (unique equilibrium),
  matching pennies (none), and a coordination game (multiple).
- `describeOutcome` is asserted to contain no praise words.

Three real bugs were found by these tests during the build and fixed:

1. `mad()` returns exactly 0 whenever more than half the values are identical —
   which is the normal shape of daily self-report data. The systems-map alert
   divided by that spread and so could **never fire**. Fixed with `robustSpread`.
2. `pearson()` returned floating-point noise instead of `NaN` for a constant
   series, because `mean([0.7 × 10])` is `0.7000000000000001` and the residual
   variance is ~1e-31, not 0.
3. `differsSignificantly()` reported "no effect" for two cleanly separated
   zero-variance arms.

---

## Deliberately not built

- **Cloud sync.** v2.0 claimed `expo-sqlite` had "automatic sync" with Supabase.
  It does not; that is a conflict-resolution layer you would have to write.
  Export/import covers the real need for one person on two devices.
- **Distress detection.** See F29.
- **A composite score.** Each metric is a separate falsifiable claim and they can
  move in different directions.
- **Push notifications.** The settings exist and are honoured by the UI; wiring
  them to the Notification API is a small addition when you want it.
