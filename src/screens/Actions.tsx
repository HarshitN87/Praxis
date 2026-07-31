import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../app/store';
import * as repo from '../data/repo';
import {
  Card,
  Empty,
  Field,
  Modal,
  Notice,
  PillGroup,
  ScreenHead,
  Section,
  Tag,
  TextArea,
  TextField,
} from '../components/ui';
import { BarList } from '../components/Charts';
import {
  CONSTRAINT_CATEGORIES,
  CONSTRAINT_HELP,
  CONSTRAINT_LABEL,
  type Constraint,
  type ConstraintCategory,
} from '../domain/types';
import { formatDateHuman } from '../domain/dates';

/**
 * Action log and constraint classifier (§4.2, Hall).
 *
 * The spec's safety-first design here is good and is kept intact: Praxis
 * never auto-classifies a constraint as artificial, the two "not routable"
 * categories are presented first, and the bypass prompt is withheld whenever
 * the user is unsure or has chosen one of them. §6.4 forbids suggesting a
 * way around anything tagged legal, physical, safety or licensing, and that
 * is enforced structurally rather than by wording.
 */
export default function Actions() {
  const { all, today, refresh } = useStore();
  const [constraints, setConstraints] = useState<Constraint[]>([]);
  const [adding, setAdding] = useState(false);

  const load = async () => setConstraints(await repo.listConstraints());
  useEffect(() => {
    void load();
  }, []);

  const actions = useMemo(
    () =>
      all
        .filter((f) => f.commitment.tier === 'action')
        .sort((a, b) => b.commitment.createdAt.localeCompare(a.commitment.createdAt)),
    [all],
  );

  const byDiscomfort = useMemo(() => {
    const counts = [1, 2, 3, 4, 5].map((n) => ({
      label: `Discomfort ${n}`,
      value: actions.filter((a) => a.commitment.discomfortLevel === n).length,
    }));
    return counts;
  }, [actions]);

  const constraintById = new Map(constraints.map((c) => [c.id, c]));

  return (
    <>
      <ScreenHead
        title="Actions"
        sub={`${actions.length} logged · ${constraints.length} constraints named`}
      />

      <Section title="What is actually stopping you?">
        <div className="stack">
          {constraints.map((c) => (
            <ConstraintCard key={c.id} constraint={c} onChanged={load} />
          ))}
          <button type="button" className="btn block" onClick={() => setAdding(true)}>
            Name a constraint
          </button>
        </div>
      </Section>

      {actions.length > 0 ? (
        <>
          <Section title="Discomfort spread">
            <Card>
              <BarList items={byDiscomfort} />
              <p className="hint">
                If everything you log sits at 1 or 2, the log is measuring your comfort zone
                rather than expanding it.
              </p>
            </Card>
          </Section>

          <Section title="Logged">
            <div className="stack">
              {actions.slice(0, 60).map((f) => (
                <Card key={f.commitment.id}>
                  <div className="row-between">
                    <div className="grow">
                      <div className="card-title">{f.commitment.title}</div>
                      <div className="card-meta">
                        {formatDateHuman(f.commitment.localDate, today)}
                        {f.commitment.constraintId
                          ? ` · ${constraintById.get(f.commitment.constraintId)?.description ?? ''}`
                          : ''}
                      </div>
                    </div>
                    <Tag>discomfort {f.commitment.discomfortLevel}</Tag>
                  </div>
                  {f.commitment.isForcingFunction ? (
                    <p className="hint">Forcing function: {f.commitment.forcingFunctionDetail}</p>
                  ) : null}
                </Card>
              ))}
            </div>
          </Section>
        </>
      ) : (
        <Empty
          title="Nothing logged yet"
          body="Log actions from the Today screen — a line of text and one tap. The point is volume and honesty about discomfort, not detail."
        />
      )}

      {adding ? (
        <ConstraintComposer
          onClose={() => setAdding(false)}
          onDone={async () => {
            setAdding(false);
            await load();
            await refresh();
          }}
        />
      ) : null}
    </>
  );
}

function ConstraintCard({
  constraint,
  onChanged,
}: {
  constraint: Constraint;
  onChanged: () => Promise<void>;
}) {
  const [bypass, setBypass] = useState(constraint.bypassIdentified ?? '');
  const routable =
    (constraint.category === 'social_convention' ||
      constraint.category === 'permission_assumption') &&
    constraint.categoryConfidence === 'confident';

  return (
    <Card>
      <div className="row-between" style={{ alignItems: 'flex-start' }}>
        <div className="grow">
          <div className="card-title">{constraint.description}</div>
          <div className="card-meta">
            {CONSTRAINT_LABEL[constraint.category]}
            {constraint.categoryConfidence === 'unsure' ? ' · unsure' : ''}
          </div>
        </div>
      </div>

      {/* The bypass prompt appears only for the two routable categories, and
          only when the user said they were confident. */}
      {routable ? (
        <div style={{ marginTop: 12 }}>
          <Field label="What would it look like to act anyway?">
            <TextArea
              value={bypass}
              onChange={setBypass}
              rows={2}
              placeholder="Just email them directly instead of waiting to be introduced"
            />
          </Field>
          <div className="btn-row end" style={{ marginTop: 8 }}>
            <button
              type="button"
              className="btn sm"
              disabled={bypass === (constraint.bypassIdentified ?? '')}
              onClick={async () => {
                await repo.saveConstraint({ ...constraint, bypassIdentified: bypass.trim() || null });
                await onChanged();
              }}
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <Notice kind="plain">
          {constraint.categoryConfidence === 'unsure'
            ? 'You said you are not sure what kind of constraint this is. Praxis will not suggest anything until you are.'
            : 'Praxis does not suggest ways around this category.'}
        </Notice>
      )}
    </Card>
  );
}

function ConstraintComposer({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<ConstraintCategory | null>(null);
  const [confidence, setConfidence] = useState<'confident' | 'unsure' | null>(null);

  return (
    <Modal title="Name a constraint" onClose={onClose}>
      <div className="stack">
        <Field label="What is stopping you?">
          <TextField
            value={description}
            onChange={setDescription}
            placeholder="I can't email the professor directly"
            autoFocus
          />
        </Field>

        <Field
          label="What kind of constraint is it?"
          hint="Praxis will never classify this for you. Getting it wrong in the direction of 'it's just a convention' is the expensive mistake, so the two that are not routable come first."
        >
          <div className="stack-sm">
            {CONSTRAINT_CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                className="card"
                onClick={() => setCategory(cat)}
                style={{
                  borderColor: category === cat ? 'var(--accent)' : 'var(--border)',
                  background: category === cat ? 'var(--accent-soft)' : 'var(--bg-card)',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 15 }}>{CONSTRAINT_LABEL[cat]}</div>
                <div className="card-meta">{CONSTRAINT_HELP[cat]}</div>
              </button>
            ))}
          </div>
        </Field>

        {category ? (
          <Field label="How sure are you about that?">
            <PillGroup
              options={[
                { value: 'confident', label: 'Confident' },
                { value: 'unsure', label: 'Not sure' },
              ]}
              value={confidence}
              onChange={(v) => setConfidence(v as 'confident' | 'unsure')}
            />
          </Field>
        ) : null}

        <div className="btn-row end">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={!description.trim() || !category || !confidence}
            onClick={async () => {
              await repo.saveConstraint({
                description: description.trim(),
                category: category!,
                categoryConfidence: confidence!,
                bypassIdentified: null,
              });
              await onDone();
            }}
          >
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
}
