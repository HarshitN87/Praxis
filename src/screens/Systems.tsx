import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStore } from '../app/store';
import * as repo from '../data/repo';
import {
  Card,
  Empty,
  Field,
  Modal,
  Notice,
  NumberField,
  PillGroup,
  ScreenHead,
  Section,
  Tag,
  TextArea,
  TextField,
} from '../components/ui';
import { NotEnoughData } from '../components/ui';
import { evaluateFlowAlert, effectCheckDate, MIN_ALERT_WINDOW_DAYS, type FlowAlert } from '../domain/systems';
import {
  LEVERAGE_BANDS,
  LEVERAGE_DESCRIPTION,
  LEVERAGE_LABEL,
  type Flow,
  type HabitLoop,
  type Intervention,
  type LeverageBand,
  type Stock,
} from '../domain/types';
import { formatInstantHuman, isPast } from '../domain/dates';

export default function Systems() {
  const { today, settings } = useStore();
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [habits, setHabits] = useState<HabitLoop[]>([]);
  const [alerts, setAlerts] = useState<FlowAlert[]>([]);
  const [todayValues, setTodayValues] = useState<Record<string, number | null>>({});
  const [addingStock, setAddingStock] = useState(false);
  const [addingFlowFor, setAddingFlowFor] = useState<string | null>(null);
  const [addingIntervention, setAddingIntervention] = useState(false);
  const [habitFor, setHabitFor] = useState<Flow | null>(null);

  const load = useCallback(async () => {
    const [s, f, i, h, logsToday] = await Promise.all([
      repo.listStocks(),
      repo.listFlows(),
      repo.listInterventions(),
      repo.listHabitLoops(),
      repo.listFlowLogsForDate(today),
    ]);
    setStocks(s);
    setFlows(f);
    setInterventions(i);
    setHabits(h);
    const vals: Record<string, number | null> = {};
    for (const fl of f) vals[fl.id] = logsToday.find((l) => l.flowId === fl.id)?.value ?? null;
    setTodayValues(vals);

    // Evaluate alerts across every flow.
    const found: FlowAlert[] = [];
    for (const fl of f) {
      const stock = s.find((x) => x.id === fl.stockId);
      const logs = await repo.listFlowLogs(fl.id);
      const record = await repo.getAlertRecord(fl.id);
      const alert = evaluateFlowAlert({
        flowId: fl.id,
        flowLabel: fl.label,
        stockName: stock?.name ?? 'that stock',
        direction: fl.direction,
        typicalDelayDays: fl.typicalDelayDays,
        logs,
        today,
        lastAlertedOn: record?.lastAlertedOn ?? null,
      });
      if (alert) {
        found.push(alert);
        await repo.recordAlert(fl.id, today);
      }
    }
    setAlerts(found);
  }, [today]);

  useEffect(() => {
    void load();
  }, [load]);

  const dueChecks = useMemo(
    () => interventions.filter((i) => !i.effectObserved && isPast(i.effectCheckDueAt)),
    [interventions],
  );

  if (!settings.modules.systemsMap) {
    return (
      <Empty
        title="Systems map is off"
        body="Turn it back on in Settings if you want to track stocks and flows."
      />
    );
  }

  return (
    <>
      <ScreenHead title="Systems" sub="Stocks, the flows that fill and drain them, and what you changed" />

      {alerts.map((a) => (
        <Notice key={a.flowId} kind="warn" title="Sustained shift">
          {a.message}
          <p className="hint" style={{ marginBottom: 0 }}>
            Three days running, outside your usual range. Praxis will not mention this flow again
            for a week.
          </p>
        </Notice>
      ))}

      {dueChecks.length > 0 ? (
        <Section title="Did these work?">
          <div className="stack">
            {dueChecks.map((i) => (
              <InterventionCheck key={i.id} intervention={i} onDone={load} />
            ))}
          </div>
        </Section>
      ) : null}

      {stocks.length === 0 ? (
        <Empty
          title="Nothing mapped yet"
          body="A stock is something that accumulates — sleep debt, savings, goodwill, skill. Flows are what fill or drain it. Start with one you actually care about."
          action={
            <button type="button" className="btn primary" onClick={() => setAddingStock(true)}>
              Add a stock
            </button>
          }
        />
      ) : (
        <>
          <Section title="Today's check-in">
            <Card>
              <p className="hint" style={{ marginTop: 0 }}>
                One pass, once a day. Leave anything blank that did not happen.
              </p>
              {flows.map((f) => {
                const stock = stocks.find((s) => s.id === f.stockId);
                return (
                  <div key={f.id} className="row-between" style={{ padding: '8px 0' }}>
                    <div className="grow">
                      <div style={{ fontSize: 15 }}>{f.label}</div>
                      <div className="card-meta">
                        {f.direction === 'inflow' ? 'into' : 'out of'} {stock?.name}
                      </div>
                    </div>
                    <div style={{ width: 96 }}>
                      <NumberField
                        value={todayValues[f.id] ?? null}
                        onChange={async (v) => {
                          setTodayValues((prev) => ({ ...prev, [f.id]: v }));
                          if (v !== null) await repo.logFlow(f.id, today, v);
                        }}
                      />
                    </div>
                  </div>
                );
              })}
              {flows.length === 0 ? (
                <p className="muted" style={{ fontSize: 14 }}>
                  No flows yet. Add one to a stock below.
                </p>
              ) : null}
            </Card>
          </Section>

          <Section title="Stocks">
            <div className="stack">
              {stocks.map((s) => (
                <StockCard
                  key={s.id}
                  stock={s}
                  flows={flows.filter((f) => f.stockId === s.id)}
                  habits={habits}
                  onAddFlow={() => setAddingFlowFor(s.id)}
                  onAddHabit={setHabitFor}
                  onChanged={load}
                />
              ))}
              <button type="button" className="btn block" onClick={() => setAddingStock(true)}>
                Add a stock
              </button>
            </div>
          </Section>
        </>
      )}

      <Section title="Interventions">
        <p className="hint" style={{ marginTop: 0 }}>
          Meadows ranks these from weakest to strongest. Most of what anyone does is a parameter
          change, and that is fine — the useful question is not which band you picked, but whether
          the stock actually moved.
        </p>
        <div className="stack">
          {interventions.map((i) => (
            <Card key={i.id}>
              <div className="row-between" style={{ alignItems: 'flex-start' }}>
                <div className="grow">
                  <div className="card-title">{i.description}</div>
                  <div className="card-meta">
                    {LEVERAGE_LABEL[i.leverageBand]} · intended to {i.intendedDirection}
                  </div>
                </div>
                {i.effectObserved ? <Tag>{i.effectObserved.replace(/_/g, ' ')}</Tag> : null}
              </div>
              {!i.effectObserved ? (
                <div className="card-meta" style={{ marginTop: 8 }}>
                  Check due {formatInstantHuman(i.effectCheckDueAt)}
                </div>
              ) : null}
            </Card>
          ))}
          <button type="button" className="btn block" onClick={() => setAddingIntervention(true)}>
            Log an intervention
          </button>
        </div>
      </Section>

      {flows.length > 0 ? (
        <Section title="Alerting">
          <NotEnoughData
            have={0}
            need={MIN_ALERT_WINDOW_DAYS}
            what="days of flow history"
            why={`Praxis needs at least ${MIN_ALERT_WINDOW_DAYS} days before it will call anything unusual, uses a median rather than a mean, and requires three consecutive days outside the range. Daily self-report is lumpy; a looser rule would fire constantly and you would learn to ignore it.`}
          />
        </Section>
      ) : null}

      {addingStock ? (
        <StockComposer
          onClose={() => setAddingStock(false)}
          onDone={async () => {
            setAddingStock(false);
            await load();
          }}
        />
      ) : null}

      {addingFlowFor ? (
        <FlowComposer
          stockId={addingFlowFor}
          onClose={() => setAddingFlowFor(null)}
          onDone={async () => {
            setAddingFlowFor(null);
            await load();
          }}
        />
      ) : null}

      {addingIntervention ? (
        <InterventionComposer
          stocks={stocks}
          flows={flows}
          today={today}
          onClose={() => setAddingIntervention(false)}
          onDone={async () => {
            setAddingIntervention(false);
            await load();
          }}
        />
      ) : null}

      {habitFor ? (
        <HabitComposer
          flow={habitFor}
          onClose={() => setHabitFor(null)}
          onDone={async () => {
            setHabitFor(null);
            await load();
          }}
        />
      ) : null}
    </>
  );
}

/* ---------------------------------------------------------------- */

function StockCard({
  stock,
  flows,
  habits,
  onAddFlow,
  onAddHabit,
  onChanged,
}: {
  stock: Stock;
  flows: Flow[];
  habits: HabitLoop[];
  onAddFlow: () => void;
  onAddHabit: (f: Flow) => void;
  onChanged: () => Promise<void>;
}) {
  return (
    <Card>
      <div className="row-between">
        <div className="grow">
          <div className="card-title">{stock.name}</div>
          <div className="card-meta">
            {stock.currentValue ?? '—'} {stock.unit}
          </div>
        </div>
        <button
          type="button"
          className="btn ghost sm"
          onClick={async () => {
            if (!confirm(`Delete "${stock.name}" and all its flows and logs?`)) return;
            await repo.deleteStock(stock.id);
            await onChanged();
          }}
        >
          Delete
        </button>
      </div>

      <div style={{ marginTop: 10 }}>
        {flows.map((f) => {
          const loop = habits.find((h) => h.flowId === f.id);
          return (
            <div key={f.id} className="row-between" style={{ padding: '6px 0' }}>
              <div className="grow">
                <span style={{ fontSize: 14 }}>
                  {f.direction === 'inflow' ? '→ ' : '← '}
                  {f.label}
                </span>
                <div className="card-meta">
                  {f.typicalDelayDays > 0 ? `shows up ~${f.typicalDelayDays}d later` : 'no delay'}
                  {loop ? ` · cue: ${loop.cue}` : ''}
                </div>
              </div>
              {!loop ? (
                <button type="button" className="btn ghost sm" onClick={() => onAddHabit(f)}>
                  Habit loop
                </button>
              ) : null}
            </div>
          );
        })}
      </div>

      <button type="button" className="btn sm" style={{ marginTop: 8 }} onClick={onAddFlow}>
        Add a flow
      </button>
    </Card>
  );
}

function StockComposer({ onClose, onDone }: { onClose: () => void; onDone: () => Promise<void> }) {
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [value, setValue] = useState<number | null>(null);
  return (
    <Modal title="New stock" onClose={onClose}>
      <div className="stack">
        <Field label="What accumulates?" hint="Sleep debt, savings, fitness, goodwill, unread backlog.">
          <TextField value={name} onChange={setName} placeholder="Sleep debt" autoFocus />
        </Field>
        <Field label="Measured in">
          <TextField value={unit} onChange={setUnit} placeholder="hours" />
        </Field>
        <Field label="Roughly where is it now? (optional)">
          <NumberField value={value} onChange={setValue} />
        </Field>
        <div className="btn-row end">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={!name.trim() || !unit.trim()}
            onClick={async () => {
              await repo.saveStock({ name: name.trim(), unit: unit.trim(), currentValue: value });
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

function FlowComposer({
  stockId,
  onClose,
  onDone,
}: {
  stockId: string;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [label, setLabel] = useState('');
  const [direction, setDirection] = useState<'inflow' | 'outflow'>('outflow');
  const [delay, setDelay] = useState<number | null>(0);
  return (
    <Modal title="New flow" onClose={onClose}>
      <div className="stack">
        <Field label="What is it?">
          <TextField value={label} onChange={setLabel} placeholder="Late nights" autoFocus />
        </Field>
        <Field label="Does it fill or drain the stock?">
          <PillGroup
            options={[
              { value: 'inflow', label: 'Fills it' },
              { value: 'outflow', label: 'Drains it' },
            ]}
            value={direction}
            onChange={(v) => setDirection(v as 'inflow' | 'outflow')}
          />
        </Field>
        <Field
          label="How long before you feel it? (days)"
          hint="Meadows' point about delays: you act on what you feel now, which is the result of what you did days ago. Naming the lag is most of the value."
        >
          <NumberField value={delay} onChange={setDelay} min={0} />
        </Field>
        <div className="btn-row end">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={!label.trim()}
            onClick={async () => {
              await repo.saveFlow({
                stockId,
                label: label.trim(),
                direction,
                typicalDelayDays: delay ?? 0,
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

function InterventionComposer({
  stocks,
  flows,
  today,
  onClose,
  onDone,
}: {
  stocks: Stock[];
  flows: Flow[];
  today: string;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [description, setDescription] = useState('');
  const [stockId, setStockId] = useState<string | null>(stocks[0]?.id ?? null);
  const [band, setBand] = useState<LeverageBand | null>(null);
  const [dir, setDir] = useState<'increase' | 'decrease'>('decrease');

  const maxDelay = Math.max(
    0,
    ...flows.filter((f) => f.stockId === stockId).map((f) => f.typicalDelayDays),
  );

  return (
    <Modal title="Log an intervention" onClose={onClose}>
      <div className="stack">
        <Field label="What did you change?">
          <TextArea
            value={description}
            onChange={setDescription}
            rows={2}
            placeholder="Moved the router out of the bedroom"
          />
        </Field>

        {stocks.length > 0 ? (
          <Field label="Which stock should move?">
            <PillGroup
              options={stocks.map((s) => ({ value: s.id, label: s.name }))}
              value={stockId}
              onChange={setStockId}
            />
          </Field>
        ) : null}

        <Field label="In which direction?">
          <PillGroup
            options={[
              { value: 'decrease', label: 'Down' },
              { value: 'increase', label: 'Up' },
            ]}
            value={dir}
            onChange={(v) => setDir(v as 'increase' | 'decrease')}
          />
        </Field>

        <Field label="What kind of change is it?">
          <div className="stack-sm">
            {LEVERAGE_BANDS.map((b) => (
              <button
                key={b}
                type="button"
                className="card"
                onClick={() => setBand(b)}
                style={{
                  borderColor: band === b ? 'var(--accent)' : 'var(--border)',
                  background: band === b ? 'var(--accent-soft)' : 'var(--bg-card)',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 15 }}>{LEVERAGE_LABEL[b]}</div>
                <div className="card-meta">{LEVERAGE_DESCRIPTION[b]}</div>
              </button>
            ))}
          </div>
        </Field>

        <Notice kind="plain">
          Praxis will ask you in about {Math.max(14, Math.ceil(2 * maxDelay))} days whether the
          stock actually moved. That is twice the longest delay you recorded — asking sooner would
          just be reading noise.
        </Notice>

        <div className="btn-row end">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={!description.trim() || !band}
            onClick={async () => {
              await repo.saveIntervention({
                stockId,
                description: description.trim(),
                leverageBand: band!,
                intendedDirection: dir,
                effectCheckDueAt: new Date(
                  `${effectCheckDate(today, maxDelay)}T12:00:00Z`,
                ).toISOString(),
                effectObserved: null,
                effectNote: null,
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

function InterventionCheck({
  intervention,
  onDone,
}: {
  intervention: Intervention;
  onDone: () => Promise<void>;
}) {
  const [note, setNote] = useState('');
  return (
    <Card>
      <div className="card-title">{intervention.description}</div>
      <div className="card-meta">
        You expected the stock to {intervention.intendedDirection}.{' '}
        {LEVERAGE_LABEL[intervention.leverageBand]}.
      </div>
      <div style={{ marginTop: 12 }}>
        <PillGroup
          options={[
            { value: 'as_intended', label: 'It moved as intended' },
            { value: 'no_change', label: 'No change' },
            { value: 'opposite', label: 'It went the other way' },
            { value: 'too_noisy_to_tell', label: "Can't tell" },
          ]}
          value={null}
          onChange={async (v) => {
            await repo.saveIntervention({
              ...intervention,
              effectObserved: v as Intervention['effectObserved'],
              effectNote: note.trim() || null,
            });
            await onDone();
          }}
        />
        <p className="hint">
          "Can't tell" is a real answer and is excluded from the effectiveness rate rather than
          counted as a failure.
        </p>
        <TextField value={note} onChange={setNote} placeholder="Note (optional)" />
      </div>
    </Card>
  );
}

function HabitComposer({
  flow,
  onClose,
  onDone,
}: {
  flow: Flow;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [cue, setCue] = useState('');
  const [routine, setRoutine] = useState('');
  const [desired, setDesired] = useState<'increase' | 'decrease' | 'redirect'>('decrease');
  const [redesign, setRedesign] = useState('');
  const [stacked, setStacked] = useState('');

  return (
    <Modal title={`Habit loop: ${flow.label}`} onClose={onClose}>
      <div className="stack">
        <Field
          label="What triggers it?"
          hint="A specific cue in the environment, not a feeling. Clear's claim is that redesigning the cue beats resolving to try harder."
        >
          <TextField value={cue} onChange={setCue} placeholder="Phone on the nightstand" autoFocus />
        </Field>
        <Field label="What follows?">
          <TextField value={routine} onChange={setRoutine} placeholder="Scrolling until 1am" />
        </Field>
        <Field label="You want to">
          <PillGroup
            options={[
              { value: 'decrease', label: 'Do less of it' },
              { value: 'increase', label: 'Do more of it' },
              { value: 'redirect', label: 'Redirect it' },
            ]}
            value={desired}
            onChange={(v) => setDesired(v as 'increase' | 'decrease' | 'redirect')}
          />
        </Field>
        <Field
          label="What will you change about the environment?"
          hint="Dated when you save it, so the flow's rate in the two weeks before can be compared with the two weeks after."
        >
          <TextArea value={redesign} onChange={setRedesign} rows={2} placeholder="Charger moves to the hallway" />
        </Field>
        <Field label="Stack it onto an existing habit (optional)">
          <TextField value={stacked} onChange={setStacked} placeholder="After I brush my teeth" />
        </Field>
        <div className="btn-row end">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={!cue.trim() || !routine.trim()}
            onClick={async () => {
              await repo.saveHabitLoop({
                flowId: flow.id,
                cue: cue.trim(),
                routine: routine.trim(),
                desiredChange: desired,
                environmentRedesign: redesign.trim() || null,
                environmentRedesignAt: redesign.trim() ? new Date().toISOString() : null,
                stackedOnHabit: stacked.trim() || null,
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
