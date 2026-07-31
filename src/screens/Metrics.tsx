import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../app/store';
import * as repo from '../data/repo';
import { Card, NotEnoughData, Notice, RateBar, ScreenHead, Section, Stat } from '../components/ui';
import { CalibrationChart, Sparkline } from '../components/Charts';
import { MIN_N, allPairs, calibrationCurve } from '../domain/calibration';
import {
  agencyReport,
  baseRateRevisionReport,
  calibrationReport,
  categoryPerformance,
  crowdWithinReport,
  discoverPatterns,
  honestyReport,
  implementationIntentionReport,
  interventionReport,
  reframingReport,
  resultingReport,
  surpriseReport,
} from '../domain/metrics';
import { fixed, formatRate, pct, signed } from '../domain/stats';
import { LEVERAGE_LABEL, TIER_LABEL, type Constraint, type Intervention, type ReframingLog } from '../domain/types';
import { addDays } from '../domain/dates';

export default function Metrics() {
  const { all, categories, today } = useStore();
  const [reframes, setReframes] = useState<ReframingLog[]>([]);
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [constraints, setConstraints] = useState<Constraint[]>([]);

  useEffect(() => {
    void (async () => {
      setReframes(await repo.listReframingLogs());
      setInterventions(await repo.listInterventions());
      setConstraints(await repo.listConstraints());
    })();
  }, []);

  const pairs = useMemo(() => allPairs(all), [all]);
  const report = useMemo(() => calibrationReport(all), [all]);
  const curve = useMemo(() => calibrationCurve(pairs), [pairs]);
  const surprise = useMemo(() => surpriseReport(all), [all]);
  const resulting = useMemo(() => resultingReport(all), [all]);
  const honesty = useMemo(() => honestyReport(all, 'intention'), [all]);
  const cats = useMemo(() => categoryPerformance(all, categories), [all, categories]);
  const ii = useMemo(() => implementationIntentionReport(all), [all]);
  const reframing = useMemo(() => reframingReport(reframes), [reframes]);
  const baseRate = useMemo(() => baseRateRevisionReport(all), [all]);
  const crowd = useMemo(() => crowdWithinReport(all), [all]);
  const bands = useMemo(() => interventionReport(interventions), [interventions]);
  const patterns = useMemo(() => discoverPatterns(all, categories), [all, categories]);
  const agency = useMemo(
    () => agencyReport(all, constraints, addDays(today, -90), today),
    [all, constraints, today],
  );

  const m = report.overall;

  return (
    <>
      <ScreenHead
        title="Calibration"
        sub={`${pairs.length} resolved prediction${pairs.length === 1 ? '' : 's'} across every tier`}
      />

      {/* ---- The headline pair (F2) ---------------------------------- */}
      <Section title="Are your numbers right?">
        {!m.sufficient ? (
          <NotEnoughData
            have={pairs.length}
            need={MIN_N.calibration}
            what="predictions"
            why="Calibration is a property of a set, not of any one prediction. Below about twenty, the number would move around wildly week to week and tell you nothing. Daily intentions get you there fastest."
          />
        ) : (
          <>
            <Card>
              <Stat
                label="Reliability — how far your stated probabilities sit from what happened"
                value={fixed(m.reliability, 4)}
                note="This is calibration. Zero is perfect. When you say 70%, does it happen 70% of the time?"
              />
              <Stat
                label="Resolution — how much your forecasts vary in a way that tracks reality"
                value={fixed(m.resolution, 4)}
                note="This is discrimination — whether you actually know which cases are different. Higher is better. It is reported separately on purpose: a forecaster who says the same number every day can be perfectly calibrated and completely uninformative."
              />
              <Stat
                label="Brier score"
                value={fixed(m.brier, 4)}
                note={`Reliability − resolution + uncertainty (${fixed(m.uncertainty, 4)}). Lower is better.`}
              />
              <Stat
                label="Against just predicting your base rate"
                value={signed(m.skillScore, 3)}
                note={
                  m.skillScore > 0
                    ? 'Positive: you are beating the strategy of saying the same thing every time.'
                    : 'Not yet beating the strategy of saying the same thing every time. That is the real bar.'
                }
              />
            </Card>

            <Card style={{ marginTop: 16 }}>
              <CalibrationChart bins={curve} />
            </Card>

            <Card className="flat" style={{ marginTop: 16 }}>
              <span className="label">Overall</span>
              <p className="prose" style={{ marginTop: 0, marginBottom: 0 }}>
                You said {pct(report.inTheLarge.meanProbability)} on average; things happened{' '}
                {pct(report.inTheLarge.observedRate.point)} of the time.{' '}
                {report.inTheLarge.direction === 'overconfident'
                  ? 'That gap is wide enough to be real: you are overconfident.'
                  : report.inTheLarge.direction === 'underconfident'
                    ? 'That gap is wide enough to be real: you are underconfident.'
                    : 'That difference is inside the noise — nothing to conclude yet.'}
              </p>
            </Card>
          </>
        )}
      </Section>

      {report.trendPoints.length >= 3 ? (
        <Section title="Is it improving?">
          <Card>
            <Sparkline points={report.trendPoints} />
            <Stat
              label="Trend"
              value={signed(report.trendSlope, 4)}
              note={
                report.trendSlope < 0
                  ? 'Brier falling across successive windows — improving.'
                  : 'Not falling yet. Over this few windows that is not evidence of anything.'
              }
            />
          </Card>
        </Section>
      ) : null}

      {/* ---- By tier ------------------------------------------------ */}
      <Section title="World vs. self">
        <p className="hint" style={{ marginTop: 0 }}>
          The same curve, split by what you were predicting. Most people are worse at predicting
          themselves than they expect.
        </p>
        <Card>
          {report.byTier.map(({ tier, murphy: mm, inTheLarge }) => (
            <Stat
              key={tier}
              label={TIER_LABEL[tier]}
              value={mm.sufficient ? fixed(mm.reliability, 4) : `${mm.n}/${MIN_N.calibration}`}
              note={
                mm.sufficient
                  ? `Reliability. Said ${pct(inTheLarge.meanProbability)}, happened ${pct(inTheLarge.observedRate.point)}.`
                  : 'Not enough resolved predictions in this tier yet.'
              }
            />
          ))}
        </Card>
      </Section>

      {/* ---- Honesty of the record (F7) ----------------------------- */}
      <Section title="How complete is the record?">
        <Card>
          <Stat
            label="Intentions you came back and answered"
            value={pct(honesty.responseRate)}
            note={`${honesty.answered} answered, ${honesty.unresolved} never answered, ${honesty.voided} voided.`}
          />
          {honesty.unresolved > 0 ? (
            <Notice kind="warn" title="Your hit rate is an optimistic estimate">
              People skip the check-in on the days that went badly. If every unanswered day was a
              miss your true rate is {pct(honesty.bounds.worstCase)}; if every one was a hit it is{' '}
              {pct(honesty.bounds.bestCase)}. The honest reading is somewhere in there.
            </Notice>
          ) : (
            <p className="hint">
              Every intention has an answer, so the rates below are not inflated by silence.
            </p>
          )}
        </Card>
      </Section>

      {/* ---- Surprise rate (F17) ------------------------------------ */}
      <Section title="How often does reality come from outside your list?">
        {!surprise.sufficient ? (
          <NotEnoughData
            have={surprise.n}
            need={MIN_N.surprise}
            what="decisions"
            why="This measures the size of your blind spot rather than your accuracy inside it — arguably the more useful number, and the one that needs the fewest data points to become interesting."
          />
        ) : (
          <Card>
            <RateBar rate={surprise.value.rate} label="Outcomes that were not on your list" />
            <p className="hint">
              Being well calibrated across the options you thought of is no protection against the
              ones you did not.
            </p>
          </Card>
        )}
      </Section>

      {/* ---- Resulting (F19) ---------------------------------------- */}
      <Section title="Is hindsight rewriting your judgement?">
        {!resulting.sufficient ? (
          <NotEnoughData
            have={resulting.n}
            need={MIN_N.hindsight}
            what="reviewed decisions"
            why="Praxis records how good you thought your process was BEFORE you knew the outcome, and again after. The gap between those two, sorted by how things turned out, is resulting made visible."
          />
        ) : (
          <Card>
            <Stat
              label="After a good outcome, your process rating shifts by"
              value={signed(resulting.value.goodOutcomeDelta)}
              note={`${resulting.value.nGood} decisions`}
            />
            <Stat
              label="After a bad outcome"
              value={signed(resulting.value.badOutcomeDelta)}
              note={`${resulting.value.nBad} decisions`}
            />
            <Stat
              label="Spread"
              value={signed(resulting.value.spread)}
              note={
                Math.abs(resulting.value.spread) < 0.5
                  ? 'Close to zero — you are judging the process on its own terms.'
                  : 'The outcome is pulling your view of the process with it. That is resulting, and it is the thing that stops you learning from a good decision that went badly.'
              }
            />
          </Card>
        )}
      </Section>

      {/* ---- Per category ------------------------------------------- */}
      {cats.length > 0 ? (
        <Section title="By category">
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>Category</th>
                  <th className="num">Hit</th>
                  <th className="num">Said</th>
                  <th>Read</th>
                </tr>
              </thead>
              <tbody>
                {cats.map((c) => (
                  <tr key={c.categoryId ?? 'none'}>
                    <td>{c.name}</td>
                    <td className="num">{formatRate(c.rate)}</td>
                    <td className="num">
                      {isFinite(c.meanProbability) ? pct(c.meanProbability) : '—'}
                    </td>
                    <td>
                      {c.sufficientForCalibration
                        ? c.calibration.direction === 'indistinguishable'
                          ? 'inside the noise'
                          : c.calibration.direction
                        : `${c.answered}/${MIN_N.subgroup}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="hint">
            A per-category verdict needs {MIN_N.subgroup} resolved intentions in that category.
            Below that Praxis shows the count and says nothing — with this many categories,
            reading them early guarantees finding a pattern every week that is not there.
          </p>
        </Section>
      ) : null}

      {/* ---- Patterns (F4) ------------------------------------------ */}
      <Section title="Patterns">
        {patterns.length === 0 ? (
          <Notice kind="plain">
            Nothing here clears the bar. A pattern is only reported when both sides have at least{' '}
            {MIN_N.subgroup} resolved intentions and their intervals do not overlap. This section
            being empty is the normal state — with weekdays, categories and times of day there are
            over a hundred cells to look at, and looking at all of them every week is how you find
            a new fake pattern every week.
          </Notice>
        ) : (
          <div className="stack">
            {patterns.map((p, i) => (
              <Card key={i}>
                <span className="label">{p.kind}</span>
                <p className="prose" style={{ marginTop: 0, marginBottom: 0, fontSize: 15 }}>
                  {p.statement}
                </p>
              </Card>
            ))}
            <p className="hint">
              Praxis states what the data shows and stops there. It does not tell you what to do
              about it.
            </p>
          </div>
        )}
      </Section>

      {/* ---- Randomised experiments (F9, F28) ----------------------- */}
      <Section title="Does the if-then plan work for you?">
        {!ii.sufficient ? (
          <NotEnoughData
            have={Math.min(ii.aN, ii.bN)}
            need={MIN_N.experimentArm}
            what="intentions in each arm"
            why={ii.note}
          />
        ) : (
          <Card>
            <RateBar rate={ii.aRate} label={ii.armAName} />
            <div style={{ height: 12 }} />
            <RateBar rate={ii.bRate} label={ii.armBName} />
            <p className="hint">
              {ii.distinguishable
                ? 'These intervals do not overlap, so the difference is real for you.'
                : 'These intervals overlap. No effect you can distinguish from noise yet.'}{' '}
              {ii.note}
            </p>
          </Card>
        )}
      </Section>

      <Section title="Does reframing work for you?">
        {!reframing.sufficient ? (
          <NotEnoughData
            have={Math.min(reframing.reframeGaps.length, reframing.controlGaps.length)}
            need={MIN_N.experimentArm}
            what="tasks in each arm"
            why="Half the entries get a reframe and half get nothing, decided by coin flip. Without the control arm there is no way to tell a working reframe from a bad week of predictions."
          />
        ) : (
          <Card>
            <Stat
              label="With a reframe — how much harder it was than expected"
              value={signed(reframing.reframeMean)}
              note={`${reframing.reframeGaps.length} tasks`}
            />
            <Stat
              label="Without"
              value={signed(reframing.controlMean)}
              note={`${reframing.controlGaps.length} tasks`}
            />
            <p className="hint">
              {reframing.distinguishable
                ? 'The two arms differ by more than noise.'
                : 'No difference you can distinguish from noise.'}{' '}
              Negative means the task turned out easier than predicted.
            </p>
          </Card>
        )}
      </Section>

      {/* ---- Do the features themselves work? (F10, F27) ------------ */}
      <Section title="Does seeing your own base rate help?">
        {!baseRate.sufficient ? (
          <NotEnoughData
            have={baseRate.n}
            need={MIN_N.subgroup}
            what="revised intentions"
            why="When you revise after seeing your track record, Praxis keeps both numbers and scores them separately. This tests the feature rather than assuming it works."
          />
        ) : (
          <Card>
            <Stat label="Your first estimate" value={fixed(baseRate.firstPassBrier, 4)} />
            <Stat label="After seeing your base rate" value={fixed(baseRate.revisedBrier, 4)} />
            <Stat
              label="Improvement"
              value={signed(baseRate.improvement, 4)}
              note={
                baseRate.improvement > 0
                  ? 'Revising made you more accurate.'
                  : 'Revising has not helped so far.'
              }
            />
          </Card>
        )}
      </Section>

      <Section title="Does averaging two independent reads help?">
        {!crowd.sufficient ? (
          <NotEnoughData
            have={crowd.n}
            need={MIN_N.calibration}
            what="decisions with two reads"
            why="Two independent guesses from the same person, averaged, usually beat either one. Praxis keeps all three so you can check whether that holds for you."
          />
        ) : (
          <Card>
            <Stat label="First read alone" value={fixed(crowd.firstPassBrier, 4)} />
            <Stat label="The average of two" value={fixed(crowd.revisedBrier, 4)} />
            <Stat label="Improvement" value={signed(crowd.improvement, 4)} />
          </Card>
        )}
      </Section>

      {/* ---- Interventions (F26) ------------------------------------ */}
      {bands.some((b) => b.checked > 0) ? (
        <Section title="Did your interventions move anything?">
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>Leverage band</th>
                  <th className="num">Worked</th>
                </tr>
              </thead>
              <tbody>
                {bands.map((b) => (
                  <tr key={b.band}>
                    <td>{LEVERAGE_LABEL[b.band]}</td>
                    <td className="num">
                      {b.sufficient
                        ? formatRate(b.rate)
                        : b.checked === 0
                          ? '—'
                          : `${b.asIntended}/${b.rate.n} (need ${MIN_N.leverageBand})`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="hint">
            Meadows claims the lower bands are weaker. This table tests that against your own life
            rather than assuming it. Most of what anyone does is a parameter change — the question
            is whether it worked, not which band it sat in.
          </p>
        </Section>
      ) : null}

      {/* ---- Agency ------------------------------------------------- */}
      {agency.weeks.length > 0 ? (
        <Section title="Agency">
          <Card>
            <Stat label="Median actions logged per week" value={agency.medianWeekly} />
            {agency.forcingFunctionRate.n > 0 ? (
              <RateBar rate={agency.forcingFunctionRate} label="Forcing functions followed through" />
            ) : null}
            <p className="hint">
              Counted over the last 90 days. Compare the first 30 days of use against later ones —
              that comparison was fixed at first launch, not chosen now.
            </p>
          </Card>
        </Section>
      ) : null}

      <Notice kind="plain" title="No single score">
        None of these are combined into an index. Each one is a separate, falsifiable claim about
        you, and each can move in a different direction from the others.
      </Notice>
    </>
  );
}
