import { useMemo, useState } from 'react';
import { useStore } from '../app/store';
import * as repo from '../data/repo';
import { BaseRateReveal, ProbabilityInput } from '../components/ProbabilityInput';
import { Card, Field, NumberField, PillGroup, TextArea, TextField } from '../components/ui';
import { assignImplementationIntention } from '../domain/randomise';
import { MIN_N } from '../domain/calibration';
import { PLANNED_WINDOW_LABEL, type FullCommitment, type PlannedWindow } from '../domain/types';
import { nowInstant } from '../domain/dates';

type Stage = 'compose' | 'probability' | 'baseRate' | 'implementation';

/**
 * Morning intention setting.
 *
 * F13. Templates matter more than they look: re-typing "Study 6 hours" every
 * morning forever is what actually kills adoption, and the spec's claimed
 * 20 seconds was optimistic for six fields typed fresh. Description, target
 * and unit carry over from a previous intention in one tap.
 *
 * The probability is the one thing that is NEVER prefilled or defaulted from
 * history. It is the measurement.
 */
export default function IntentionComposer({
  onDone,
  onCancel,
}: {
  onDone: () => void;
  onCancel: () => void;
}) {
  const { categories, all, today, refresh } = useStore();

  const [stage, setStage] = useState<Stage>('compose');
  const [categoryId, setCategoryId] = useState<string | null>(categories[0]?.id ?? null);
  const [title, setTitle] = useState('');
  const [targetQuantity, setTargetQuantity] = useState<number | null>(null);
  const [targetUnit, setTargetUnit] = useState('');
  const [criterion, setCriterion] = useState('');
  const [plannedWindow, setPlannedWindow] = useState<PlannedWindow>('unscheduled');
  const [probability, setProbability] = useState(0.5);
  const [firstProbability, setFirstProbability] = useState<number | null>(null);
  const [iiWhen, setIiWhen] = useState('');
  const [iiThen, setIiThen] = useState('');
  const [iiIfThen, setIiIfThen] = useState('');
  const [saving, setSaving] = useState(false);

  // Coin flip is fixed at composer mount so the assignment cannot be
  // influenced by anything the user types (F9).
  const [assignment] = useState(assignImplementationIntention);

  /** Past intentions in this category, for templates and the base rate. */
  const history = useMemo(
    () =>
      all.filter(
        (f) =>
          f.commitment.tier === 'intention' &&
          f.commitment.categoryId === categoryId &&
          f.resolution?.status === 'resolved',
      ),
    [all, categoryId],
  );

  const recent30 = history.slice(-30);
  const baseRateHits = recent30.filter((f) => f.resolution!.hitTarget).length;

  const templates = useMemo(() => {
    const seen = new Set<string>();
    const out: FullCommitment[] = [];
    for (const f of [...all].reverse()) {
      if (f.commitment.tier !== 'intention') continue;
      if (f.commitment.categoryId !== categoryId) continue;
      const key = f.commitment.title.toLowerCase().trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(f);
      if (out.length >= 3) break;
    }
    return out;
  }, [all, categoryId]);

  const applyTemplate = (f: FullCommitment) => {
    setTitle(f.commitment.title);
    setTargetQuantity(f.commitment.targetQuantity);
    setTargetUnit(f.commitment.targetUnit ?? '');
    setCriterion(f.commitment.resolutionCriterion);
    setPlannedWindow(f.commitment.plannedWindow ?? 'unscheduled');
  };

  const canCompose = title.trim().length > 0 && criterion.trim().length > 0;

  const save = async (finalProbability: number, revised: boolean) => {
    setSaving(true);
    const base = repo.blankCommitment('intention', today);
    const commitment = await repo.saveCommitment({
      ...base,
      categoryId,
      title: title.trim(),
      resolutionCriterion: criterion.trim(),
      targetQuantity,
      targetUnit: targetUnit.trim() || null,
      plannedWindow,
      iiAssignment:
        iiWhen.trim() || iiThen.trim()
          ? assignment === 'prompted'
            ? 'prompted'
            : 'user_initiated'
          : assignment,
      iiWhen: iiWhen.trim() || null,
      iiThen: iiThen.trim() || null,
      iiIfThen: iiIfThen.trim() || null,
    });

    const outcomes = [{ optionId: null, label: title.trim() || 'Did it', probability: 0 }];

    await repo.savePrediction({
      commitmentId: commitment.id,
      kind: 'binary',
      pass: 'first',
      outcomes: [{ ...outcomes[0]!, probability: firstProbability ?? finalProbability }],
      makeWorking: !revised,
    });

    if (revised) {
      await repo.savePrediction({
        commitmentId: commitment.id,
        kind: 'binary',
        pass: 'second',
        outcomes: [{ ...outcomes[0]!, probability: finalProbability }],
        referenceClass: `Your last ${recent30.length} intentions in this category`,
        referenceClassRate: recent30.length ? baseRateHits / recent30.length : null,
        baseRateShownAt: nowInstant(),
        makeWorking: true,
      });
    }

    await refresh();
    setSaving(false);
    onDone();
  };

  /* ------------------------------------------------------------ */

  if (stage === 'compose') {
    return (
      <div className="stack">
        <Field label="Category">
          <PillGroup
            options={categories.map((c) => ({ value: c.id, label: c.name }))}
            value={categoryId}
            onChange={setCategoryId}
          />
        </Field>

        {templates.length > 0 ? (
          <div>
            <span className="label">Reuse</span>
            <div className="pills">
              {templates.map((t) => (
                <button
                  key={t.commitment.id}
                  type="button"
                  className="pill"
                  onClick={() => applyTemplate(t)}
                >
                  {t.commitment.title}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <Field label="What do you intend to do?">
          <TextField
            value={title}
            onChange={setTitle}
            placeholder="Study 6 hours"
            autoFocus
          />
        </Field>

        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div className="grow">
            <Field label="Target (optional)">
              <NumberField value={targetQuantity} onChange={setTargetQuantity} placeholder="6" min={0} />
            </Field>
          </div>
          <div className="grow">
            <Field label="Unit">
              <TextField value={targetUnit} onChange={setTargetUnit} placeholder="hours" />
            </Field>
          </div>
        </div>

        {targetQuantity !== null ? (
          <p className="hint" style={{ marginTop: -8 }}>
            Because you set a number, tonight Praxis asks what you actually did and works out
            whether you hit the target. It is not a tick you press.
          </p>
        ) : null}

        <Field
          label="How will you know tonight?"
          hint="Written now, before the outcome. This is the only thing that stops the standard quietly sliding to fit whatever happened."
        >
          <TextArea
            value={criterion}
            onChange={setCriterion}
            placeholder="Timer shows 6+ hours of focused study, breaks not counted."
            rows={2}
          />
        </Field>

        <Field label="When?">
          <PillGroup
            options={(['morning', 'afternoon', 'evening', 'unscheduled'] as PlannedWindow[]).map(
              (w) => ({ value: w, label: PLANNED_WINDOW_LABEL[w] }),
            )}
            value={plannedWindow}
            onChange={setPlannedWindow}
          />
        </Field>

        <div className="btn-row end">
          <button type="button" className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={!canCompose}
            onClick={() => setStage('probability')}
          >
            Next
          </button>
        </div>
      </div>
    );
  }

  if (stage === 'probability') {
    return (
      <div className="stack">
        <Card className="flat">
          <div className="card-title">{title}</div>
          {targetQuantity !== null ? (
            <div className="card-meta">
              Target: {targetQuantity} {targetUnit}
            </div>
          ) : null}
        </Card>

        <ProbabilityInput
          value={probability}
          onChange={setProbability}
          question="How likely is it that you actually do this?"
        />

        <div className="btn-row end">
          <button type="button" className="btn ghost" onClick={() => setStage('compose')}>
            Back
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              setFirstProbability(probability);
              if (recent30.length >= MIN_N.perBin) setStage('baseRate');
              else if (assignment === 'prompted') setStage('implementation');
              else save(probability, false);
            }}
            disabled={saving}
          >
            Commit
          </button>
        </div>
      </div>
    );
  }

  if (stage === 'baseRate') {
    return (
      <BaseRateReveal
        hits={baseRateHits}
        n={recent30.length}
        stated={firstProbability ?? probability}
        label={categories.find((c) => c.id === categoryId)?.name.toLowerCase() ?? ''}
        onKeep={() => {
          if (assignment === 'prompted') setStage('implementation');
          else save(firstProbability ?? probability, false);
        }}
        onRevise={(p) => {
          setProbability(p);
          if (assignment === 'prompted') setStage('implementation');
          else save(p, true);
        }}
      />
    );
  }

  /* Implementation intention — Gollwitzer, correctly (F9) --------- */

  return (
    <div className="stack">
      <div>
        <span className="label">One more thing</span>
        <p className="prose" style={{ marginTop: 0 }}>
          Name the moment this starts. Not "sometime today" — a specific cue you will actually
          encounter.
        </p>
        <p className="hint">
          Praxis decided by coin flip whether to ask you this today. That is deliberate: if it
          only asked when you felt keen, the comparison would measure your enthusiasm rather than
          the technique. You can skip it.
        </p>
      </div>

      <Field label="When / where">
        <TextField
          value={iiWhen}
          onChange={setIiWhen}
          placeholder="When I sit down at my desk after breakfast"
          autoFocus
        />
      </Field>

      <Field label="…then I will">
        <TextField
          value={iiThen}
          onChange={setIiThen}
          placeholder="open the problem set before opening email"
        />
      </Field>

      <Field label="If something gets in the way (optional)">
        <TextField
          value={iiIfThen}
          onChange={setIiIfThen}
          placeholder="If someone messages me, I'll reply after the block"
        />
      </Field>

      <div className="btn-row end">
        <button
          type="button"
          className="btn ghost"
          onClick={() => save(probability, firstProbability !== null && firstProbability !== probability)}
          disabled={saving}
        >
          Skip
        </button>
        <button
          type="button"
          className="btn primary"
          onClick={() => save(probability, firstProbability !== null && firstProbability !== probability)}
          disabled={saving}
        >
          Save
        </button>
      </div>
    </div>
  );
}
