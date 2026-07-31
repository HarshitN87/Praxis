import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../app/store';
import * as repo from '../data/repo';
import {
  Card,
  Field,
  Notice,
  NumberField,
  PillGroup,
  ScreenHead,
  Section,
  Stepper,
  TextArea,
  TextField,
  Toggle,
} from '../components/ui';
import { ProbabilityInput } from '../components/ProbabilityInput';
import {
  RUIN_CHECK_PROMPT,
  VANISHING_OPTIONS_PROMPT,
  blockingGates,
  evaluateGates,
  warningGates,
  type Gate,
} from '../domain/gates';
import { checkDistribution, formatProbability, normalise } from '../domain/probability';
import { mean } from '../domain/stats';
import { fromDatetimeLocalValue, nowInstant } from '../domain/dates';
import { REVERSIBILITY_LABEL, type Premortem, type Reversibility } from '../domain/types';

interface OptionDraft {
  label: string;
  isVanishingOptionAnswer: boolean;
  differentiation: string;
}

const STEPS = [
  'Frame',
  'Options',
  'Pre-mortem',
  'Safeguards',
  'Outside view',
  'Forecast',
  'Second read',
  'Commit',
];

export default function NewDecision() {
  const navigate = useNavigate();
  const { today, refresh } = useStore();

  const [step, setStep] = useState(0);

  /* frame */
  const [title, setTitle] = useState('');
  const [context, setContext] = useState('');
  const [reversibility, setReversibility] = useState<Reversibility | null>(null);
  const [isFinancial, setIsFinancial] = useState(false);

  /* options */
  const [vanishingAnswer, setVanishingAnswer] = useState('');
  const [vanishingAnswered, setVanishingAnswered] = useState(false);
  const [options, setOptions] = useState<OptionDraft[]>([
    { label: '', isVanishingOptionAnswer: false, differentiation: '' },
    { label: '', isVanishingOptionAnswer: false, differentiation: '' },
  ]);
  const [twoOptionReason, setTwoOptionReason] = useState('');

  /* pre-mortem */
  const [premortems, setPremortems] = useState<Omit<Premortem, 'id' | 'commitmentId'>[]>([
    { failureMechanism: '', estimatedLikelihood: 'medium', isReversibleIfHit: true },
    { failureMechanism: '', estimatedLikelihood: 'medium', isReversibleIfHit: true },
  ]);

  /* safeguards */
  const [ruinAcknowledged, setRuinAcknowledged] = useState(false);
  const [marginNote, setMarginNote] = useState('');
  const [definesEnough, setDefinesEnough] = useState<boolean | null>(null);
  const [retagged, setRetagged] = useState(false);

  /* outside view */
  const [referenceClass, setReferenceClass] = useState('');
  const [referenceRate, setReferenceRate] = useState<number | null>(null);

  /* forecast */
  const [probs, setProbs] = useState<number[]>([]);
  const [secondProbs, setSecondProbs] = useState<number[]>([]);
  const [tookSecondRead, setTookSecondRead] = useState(false);

  /* commit */
  const [criterion, setCriterion] = useState('');
  const [reviewDueAt, setReviewDueAt] = useState('');
  const [chosenIndex, setChosenIndex] = useState<number | null>(null);
  const [processScore, setProcessScore] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const liveOptions = options.filter((o) => o.label.trim().length > 0);
  const hardToReverse = reversibility === 'hard_to_reverse' || reversibility === 'irreversible';

  /* --- draft commitment used purely to evaluate gates ------------ */
  const draft = useMemo(() => {
    const base = repo.blankCommitment('decision', today);
    return {
      ...base,
      title,
      context: context || null,
      reversibility,
      isFinancial,
      marginOfSafetyNote: marginNote || null,
      definesEnough,
      twoOptionOverrideReason: twoOptionReason || null,
      resolutionCriterion: criterion,
      reviewDueAt: fromDatetimeLocalValue(reviewDueAt),
      processScoreAtCommit: processScore,
    };
  }, [
    today,
    title,
    context,
    reversibility,
    isFinancial,
    marginNote,
    definesEnough,
    twoOptionReason,
    criterion,
    reviewDueAt,
    processScore,
  ]);

  const gates: Gate[] = useMemo(
    () =>
      evaluateGates({
        commitment: draft,
        options: liveOptions.map((o, i) => ({
          id: String(i),
          commitmentId: 'draft',
          label: o.label,
          isVanishingOptionAnswer: o.isVanishingOptionAnswer,
          differentiation: o.differentiation || null,
          orderIndex: i,
        })),
        premortems: premortems
          .filter((p) => p.failureMechanism.trim().length > 0)
          .map((p, i) => ({ ...p, id: String(i), commitmentId: 'draft' })),
        ruinCheckAcknowledged: ruinAcknowledged,
        vanishingOptionAnswered: vanishingAnswered,
      }),
    [draft, liveOptions, premortems, ruinAcknowledged, vanishingAnswered],
  );

  const blocking = blockingGates(gates);
  const warnings = warningGates(gates);
  const dist = checkDistribution(probs.slice(0, liveOptions.length));

  const ruinTriggered = premortems.some(
    (p) => !p.isReversibleIfHit && p.estimatedLikelihood !== 'low' && p.failureMechanism.trim(),
  );
  const tensionTriggered =
    reversibility === 'reversible' && premortems.some((p) => !p.isReversibleIfHit);

  /* --- save ------------------------------------------------------ */

  const save = async () => {
    setSaving(true);
    const base = repo.blankCommitment('decision', today);
    const commitment = await repo.saveCommitment({
      ...base,
      title: title.trim(),
      context: context.trim() || null,
      reversibility,
      isFinancial,
      marginOfSafetyNote: marginNote.trim() || null,
      definesEnough,
      twoOptionOverrideReason: twoOptionReason.trim() || null,
      resolutionCriterion: criterion.trim(),
      reviewDueAt: fromDatetimeLocalValue(reviewDueAt),
      processScoreAtCommit: processScore,
      draftLockedAt: nowInstant(),
    });

    const saved = await repo.setOptions(
      commitment.id,
      liveOptions.map((o) => ({
        label: o.label.trim(),
        isVanishingOptionAnswer: o.isVanishingOptionAnswer,
        differentiation: o.differentiation.trim() || null,
      })),
    );

    await repo.setPremortems(
      commitment.id,
      premortems.filter((p) => p.failureMechanism.trim().length > 0),
    );

    const first = saved.map((o, i) => ({
      optionId: o.id,
      label: o.label,
      probability: probs[i] ?? 0,
    }));

    await repo.savePrediction({
      commitmentId: commitment.id,
      kind: 'multi',
      pass: 'first',
      outcomes: first,
      referenceClass: referenceClass.trim() || null,
      referenceClassRate: referenceRate,
      makeWorking: !tookSecondRead,
    });

    if (tookSecondRead) {
      const second = saved.map((o, i) => ({
        optionId: o.id,
        label: o.label,
        probability: secondProbs[i] ?? 0,
      }));
      await repo.savePrediction({
        commitmentId: commitment.id,
        kind: 'multi',
        pass: 'second',
        outcomes: second,
        makeWorking: false,
      });
      // F27 — the crowd within: the AVERAGE of two independent reads becomes
      // the scored forecast. Averaging is the mechanism; concealment alone
      // was only half of it.
      await repo.savePrediction({
        commitmentId: commitment.id,
        kind: 'multi',
        pass: 'averaged',
        outcomes: saved.map((o, i) => ({
          optionId: o.id,
          label: o.label,
          probability: mean([probs[i] ?? 0, secondProbs[i] ?? 0]),
        })),
        referenceClass: referenceClass.trim() || null,
        referenceClassRate: referenceRate,
        makeWorking: true,
      });
    }

    if (chosenIndex !== null && saved[chosenIndex]) {
      await repo.saveCommitment({
        ...commitment,
        chosenOptionId: saved[chosenIndex]!.id,
        chosenAt: nowInstant(),
      });
    }

    await refresh();
    setSaving(false);
    navigate(`/commitment/${commitment.id}`);
  };

  /* --- render ---------------------------------------------------- */

  return (
    <>
      <ScreenHead title="New decision" sub={STEPS[step]} />
      <Stepper total={STEPS.length} current={step} />

      {step === 0 ? (
        <div className="stack">
          <Field label="What are you deciding?">
            <TextField value={title} onChange={setTitle} placeholder="Whether to take the job offer" autoFocus />
          </Field>
          <Field label="Context" hint="What you know now. You will read this back at review, when you have forgotten most of it.">
            <TextArea value={context} onChange={setContext} rows={4} placeholder="Why this is live now, what's at stake, what you know and don't." />
          </Field>
          <Field
            label="How reversible is this?"
            hint="If it is genuinely reversible, this probably belongs in your intentions or your action log instead — the structure here only earns its friction on things you cannot easily undo."
          >
            <PillGroup
              options={(['reversible', 'hard_to_reverse', 'irreversible'] as Reversibility[]).map((r) => ({
                value: r,
                label: REVERSIBILITY_LABEL[r],
              }))}
              value={reversibility}
              onChange={setReversibility}
            />
          </Field>
          <Toggle
            label="This is a money decision"
            checked={isFinancial}
            onChange={setIsFinancial}
            hint="Adds a margin-of-safety step before you can save."
          />
          {reversibility === 'reversible' ? (
            <Notice kind="info">
              Reversible decisions rarely need this much structure. Consider logging it as an
              action instead — the friction here exists to slow down the ones you cannot undo.
            </Notice>
          ) : null}
        </div>
      ) : null}

      {step === 1 ? (
        <div className="stack">
          {/* F30 — the vanishing-options test runs FIRST, proactively, as a
              generative tool rather than as a punishment for failing a count. */}
          <Card>
            <span className="label">Before you list them</span>
            <p className="prose" style={{ marginTop: 0 }}>
              {VANISHING_OPTIONS_PROMPT}
            </p>
            <TextArea
              value={vanishingAnswer}
              onChange={setVanishingAnswer}
              rows={2}
              placeholder="Honestly, I'd probably…"
            />
            <div className="btn-row end" style={{ marginTop: 12 }}>
              {!vanishingAnswered ? (
                <>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => setVanishingAnswered(true)}
                  >
                    Nothing new comes to mind
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={!vanishingAnswer.trim()}
                    onClick={() => {
                      setOptions((o) => [
                        ...o,
                        {
                          label: vanishingAnswer.trim(),
                          isVanishingOptionAnswer: true,
                          differentiation: '',
                        },
                      ]);
                      setVanishingAnswered(true);
                    }}
                  >
                    Add as an option
                  </button>
                </>
              ) : (
                <span className="muted" style={{ fontSize: 13 }}>Answered.</span>
              )}
            </div>
          </Card>

          <Field label="Your options">
            <div className="stack-sm">
              {options.map((o, i) => (
                <div key={i} className="stack-sm">
                  <div className="row">
                    <TextField
                      value={o.label}
                      onChange={(v) =>
                        setOptions((prev) => prev.map((p, j) => (j === i ? { ...p, label: v } : p)))
                      }
                      placeholder={`Option ${i + 1}`}
                    />
                    {options.length > 2 ? (
                      <button
                        type="button"
                        className="btn ghost sm"
                        onClick={() => setOptions((prev) => prev.filter((_, j) => j !== i))}
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                  {o.isVanishingOptionAnswer ? (
                    <TextField
                      value={o.differentiation}
                      onChange={(v) =>
                        setOptions((prev) =>
                          prev.map((p, j) => (j === i ? { ...p, differentiation: v } : p)),
                        )
                      }
                      placeholder="How is this different from the others?"
                    />
                  ) : null}
                </div>
              ))}
            </div>
          </Field>

          <button
            type="button"
            className="btn sm"
            onClick={() =>
              setOptions((o) => [...o, { label: '', isVanishingOptionAnswer: false, differentiation: '' }])
            }
          >
            Add an option
          </button>

          {hardToReverse && liveOptions.length < 3 ? (
            <Notice kind="warn" title="Only two options">
              <p style={{ marginTop: 0 }}>
                Most people evaluate a narrow "whether or not" choice. If this genuinely is
                binary, say why — it gets recorded and shown back to you at review.
              </p>
              <TextField
                value={twoOptionReason}
                onChange={setTwoOptionReason}
                placeholder="Why this really is a two-way door"
              />
            </Notice>
          ) : null}
        </div>
      ) : null}

      {step === 2 ? (
        <div className="stack">
          <p className="prose">
            Assume it is a year from now and this went badly. What happened? Name the mechanism,
            not the mood.
          </p>
          {premortems.map((p, i) => (
            <Card key={i}>
              <TextArea
                value={p.failureMechanism}
                onChange={(v) =>
                  setPremortems((prev) =>
                    prev.map((x, j) => (j === i ? { ...x, failureMechanism: v } : x)),
                  )
                }
                rows={2}
                placeholder="The team I'd be joining reorganises and the role I accepted stops existing"
              />
              <div style={{ marginTop: 12 }}>
                <span className="label">How likely?</span>
                <PillGroup
                  options={[
                    { value: 'low', label: 'Low' },
                    { value: 'medium', label: 'Medium' },
                    { value: 'high', label: 'High' },
                  ]}
                  value={p.estimatedLikelihood}
                  onChange={(v) =>
                    setPremortems((prev) =>
                      prev.map((x, j) =>
                        j === i ? { ...x, estimatedLikelihood: v as Premortem['estimatedLikelihood'] } : x,
                      ),
                    )
                  }
                />
              </div>
              <div style={{ marginTop: 12 }}>
                <span className="label">If it happens, can you undo it?</span>
                <PillGroup
                  options={[
                    { value: 'yes', label: 'Yes' },
                    { value: 'no', label: 'No' },
                  ]}
                  value={p.isReversibleIfHit ? 'yes' : 'no'}
                  onChange={(v) =>
                    setPremortems((prev) =>
                      prev.map((x, j) => (j === i ? { ...x, isReversibleIfHit: v === 'yes' } : x)),
                    )
                  }
                />
              </div>
              {premortems.length > 2 ? (
                <button
                  type="button"
                  className="btn ghost sm"
                  style={{ marginTop: 12 }}
                  onClick={() => setPremortems((prev) => prev.filter((_, j) => j !== i))}
                >
                  Remove
                </button>
              ) : null}
            </Card>
          ))}
          <button
            type="button"
            className="btn sm"
            onClick={() =>
              setPremortems((p) => [
                ...p,
                { failureMechanism: '', estimatedLikelihood: 'medium', isReversibleIfHit: true },
              ])
            }
          >
            Add another
          </button>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="stack">
          {ruinTriggered ? (
            <Notice kind="block" title="A plausible failure path you cannot undo">
              <p style={{ marginTop: 0 }}>{RUIN_CHECK_PROMPT}</p>
              <button
                type="button"
                className={`btn sm${ruinAcknowledged ? ' primary' : ''}`}
                onClick={() => setRuinAcknowledged(!ruinAcknowledged)}
              >
                {ruinAcknowledged ? 'Considered' : 'I have considered a reversible version'}
              </button>
            </Notice>
          ) : (
            <Notice kind="plain">
              No pre-mortem path is both plausible and irreversible. Nothing to bound here.
            </Notice>
          )}

          {tensionTriggered && !retagged ? (
            <Notice kind="warn" title="Your two answers disagree">
              <p style={{ marginTop: 0 }}>
                You tagged this reversible, but one of your own failure paths cannot be undone.
                Both answers are yours — worth settling which one you believe.
              </p>
              <div className="btn-row">
                <button
                  type="button"
                  className="btn sm"
                  onClick={() => {
                    setReversibility('hard_to_reverse');
                    setRetagged(true);
                  }}
                >
                  Re-tag as hard to reverse
                </button>
                <button type="button" className="btn ghost sm" onClick={() => setRetagged(true)}>
                  Keep as reversible
                </button>
              </div>
            </Notice>
          ) : null}

          {isFinancial && hardToReverse ? (
            <Card>
              <span className="label">Margin of safety</span>
              <Field label="What is the buffer between this and real trouble?">
                <TextArea
                  value={marginNote}
                  onChange={setMarginNote}
                  rows={3}
                  placeholder="Six months of expenses stay untouched; this is money I could lose entirely without changing how I live."
                />
              </Field>
              <div style={{ marginTop: 12 }}>
                <span className="label">Have you defined what "enough" looks like?</span>
                <PillGroup
                  options={[
                    { value: 'yes', label: 'Yes' },
                    { value: 'no', label: 'Not yet' },
                  ]}
                  value={definesEnough === null ? null : definesEnough ? 'yes' : 'no'}
                  onChange={(v) => setDefinesEnough(v === 'yes')}
                />
                <p className="hint">
                  Housel's point: ruin usually comes from not knowing when to stop, not from
                  picking wrong.
                </p>
              </div>
            </Card>
          ) : null}
        </div>
      ) : null}

      {step === 4 ? (
        <div className="stack">
          <p className="prose">
            Before thinking about the specifics here — what happens in situations like this in
            general?
          </p>
          <Field
            label="Reference class"
            hint="The wider set this belongs to. Be honest about what makes it comparable."
          >
            <TextField
              value={referenceClass}
              onChange={setReferenceClass}
              placeholder="People I know who switched industries mid-career"
              autoFocus
            />
          </Field>
          <Field label="Roughly what fraction of those go well?">
            <div className="row">
              <NumberField
                value={referenceRate === null ? null : Math.round(referenceRate * 100)}
                onChange={(v) => setReferenceRate(v === null ? null : v / 100)}
                placeholder="40"
                min={0}
              />
              <span className="muted">%</span>
            </div>
          </Field>
          <p className="hint">
            Anchor here first, then adjust for what is specific about your case. Tetlock's
            finding is that the order matters — inside view first tends to swamp the base rate
            entirely.
          </p>
        </div>
      ) : null}

      {step === 5 ? (
        <div className="stack">
          <p className="prose">
            Exactly one of these will happen. Spread 100% across them.
          </p>
          {liveOptions.map((o, i) => (
            <Card key={i}>
              <ProbabilityInput
                value={probs[i] ?? 0}
                onChange={(p) =>
                  setProbs((prev) => {
                    const next = [...prev];
                    while (next.length < liveOptions.length) next.push(0);
                    next[i] = p;
                    return next;
                  })
                }
                question={o.label}
              />
            </Card>
          ))}
          {!dist.valid && dist.message ? (
            <Notice kind="warn">
              <p style={{ marginTop: 0 }}>{dist.message}</p>
              <button
                type="button"
                className="btn sm"
                onClick={() => setProbs(normalise(probs.slice(0, liveOptions.length)))}
              >
                Rescale to 100%
              </button>
            </Notice>
          ) : (
            <Notice kind="plain">Adds up to 100%.</Notice>
          )}
        </div>
      ) : null}

      {step === 6 ? (
        <div className="stack">
          <Card>
            <span className="label">A second, independent read</span>
            <p className="prose" style={{ marginTop: 0 }}>
              Estimate again without looking at what you just said. Two independent guesses from
              the same person, averaged, beat either one — the effect is small but it is close to
              free.
            </p>
            <p className="hint">
              If you can, come back to this tomorrow. Praxis stores all three: your first read,
              your second, and the average that gets scored.
            </p>
          </Card>

          {!tookSecondRead ? (
            <div className="btn-row">
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setSecondProbs(liveOptions.map(() => 0));
                  setTookSecondRead(true);
                }}
              >
                Take a second read
              </button>
              <button type="button" className="btn ghost" onClick={() => setStep(7)}>
                Skip
              </button>
            </div>
          ) : (
            <>
              {liveOptions.map((o, i) => (
                <Card key={i}>
                  <ProbabilityInput
                    value={secondProbs[i] ?? 0}
                    onChange={(p) =>
                      setSecondProbs((prev) => {
                        const next = [...prev];
                        while (next.length < liveOptions.length) next.push(0);
                        next[i] = p;
                        return next;
                      })
                    }
                    question={o.label}
                  />
                </Card>
              ))}
              <Notice kind="plain" title="What gets scored">
                {liveOptions.map((o, i) => (
                  <div key={i} className="row-between">
                    <span>{o.label}</span>
                    <span className="mono">
                      {formatProbability(mean([probs[i] ?? 0, secondProbs[i] ?? 0]))}
                    </span>
                  </div>
                ))}
              </Notice>
            </>
          )}
        </div>
      ) : null}

      {step === 7 ? (
        <div className="stack">
          <Field label="Which option are you taking?">
            <PillGroup
              options={liveOptions.map((o, i) => ({ value: String(i), label: o.label }))}
              value={chosenIndex === null ? null : String(chosenIndex)}
              onChange={(v) => setChosenIndex(Number(v))}
            />
          </Field>

          <Field
            label="How will you judge this later?"
            hint="Written now, before you know. At review Praxis shows you this sentence before it shows you anything else."
          >
            <TextArea
              value={criterion}
              onChange={setCriterion}
              rows={3}
              placeholder="A year in: am I doing work I'd have chosen, and did the pay change hold up?"
            />
          </Field>

          <Field label="When will you know?">
            <input
              type="datetime-local"
              value={reviewDueAt}
              onChange={(e) => setReviewDueAt(e.target.value)}
            />
          </Field>

          <Field
            label="How good is your process here — right now, before you know how it turns out?"
            hint="This is the number that matters. Rated after the fact, it gets quietly rewritten by the outcome; rated now, it cannot be."
          >
            <PillGroup
              options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))}
              value={processScore === null ? null : String(processScore)}
              onChange={(v) => setProcessScore(Number(v))}
            />
          </Field>

          {blocking.length > 0 ? (
            <Notice kind="block" title="Not ready to save">
              <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                {blocking.map((g) => (
                  <li key={g.id} style={{ marginBottom: 6 }}>
                    <strong>{g.title}.</strong> {g.body}
                  </li>
                ))}
              </ul>
            </Notice>
          ) : null}

          {warnings.length > 0 ? (
            <Notice kind="warn" title="Worth another look">
              <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                {warnings.map((g) => (
                  <li key={g.id} style={{ marginBottom: 6 }}>
                    <strong>{g.title}.</strong> {g.body}
                  </li>
                ))}
              </ul>
            </Notice>
          ) : null}

          <button
            type="button"
            className="btn primary block"
            disabled={blocking.length > 0 || !dist.valid || chosenIndex === null || saving}
            onClick={save}
          >
            {saving ? 'Saving…' : 'Save decision'}
          </button>
        </div>
      ) : null}

      <Section>
        <div className="btn-row">
          {step > 0 ? (
            <button type="button" className="btn ghost" onClick={() => setStep((s) => s - 1)}>
              Back
            </button>
          ) : null}
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              className="btn grow"
              disabled={
                (step === 0 && (!title.trim() || !reversibility)) ||
                (step === 1 && (liveOptions.length < 2 || (hardToReverse && !vanishingAnswered))) ||
                (step === 2 &&
                  premortems.filter((p) => p.failureMechanism.trim()).length < 2) ||
                (step === 5 && !dist.valid)
              }
              onClick={() => setStep((s) => s + 1)}
            >
              Continue
            </button>
          ) : null}
        </div>
      </Section>
    </>
  );
}
