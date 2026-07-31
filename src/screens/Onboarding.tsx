import { useState } from 'react';
import { useStore } from '../app/store';
import { Card, Field, PillGroup, TextField } from '../components/ui';
import { nowInstant, systemTimezone } from '../domain/dates';

/**
 * First run. Three screens, no account, no permissions, no tour.
 *
 * The honesty commitments in §1.1 and §6.4 are stated here rather than
 * buried in a settings page, because they are the product's actual claims
 * and the user should be able to hold it to them.
 */
export default function Onboarding() {
  const { settings, setSettings } = useStore();
  const [step, setStep] = useState(0);
  const [tz, setTz] = useState(settings.timezone || systemTimezone());
  const [boundary, setBoundary] = useState(settings.dayBoundaryHour);

  const finish = async () => {
    await setSettings({
      timezone: tz,
      dayBoundaryHour: boundary,
      onboardedAt: nowInstant(),
      evaluationBaselineStartedAt: nowInstant(),
    });
  };

  return (
    <main className="shell">
      {step === 0 ? (
        <div className="stack-lg">
          <div>
            <h1>Praxis</h1>
            <p className="prose" style={{ marginTop: 12 }}>
              This is an instrument for finding out how good your predictions are — about the
              world, and about yourself.
            </p>
          </div>

          <Card>
            <p className="prose" style={{ margin: 0 }}>
              You will write down what you think will happen, as a probability, before you know.
              Later you will record what actually happened. Over enough of those, Praxis can show
              you something you cannot see from the inside: whether your 70% means 70%.
            </p>
          </Card>

          <div>
            <span className="label">Three sizes of the same thing</span>
            <p className="prose" style={{ marginTop: 4 }}>
              An <strong>intention</strong> is what you mean to do today. An <strong>action</strong>{' '}
              is something you just did. A <strong>decision</strong> is the rare, hard-to-reverse
              kind. They differ in how much structure is worth building around them — not in how
              they are scored. Everything lands on one calibration curve.
            </p>
            <p className="hint">
              This is why the daily habit matters: your handful of big decisions each year would
              never be enough to calibrate anything on their own.
            </p>
          </div>

          <button type="button" className="btn primary block" onClick={() => setStep(1)}>
            Continue
          </button>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="stack-lg">
          <div>
            <h1>What this is not</h1>
          </div>

          <div className="stack">
            <Card>
              <strong>Not a habit tracker.</strong>
              <p className="prose" style={{ marginBottom: 0 }}>
                There are no streaks, badges, or celebrations. Praxis does not try to make you do
                more — it tries to make you accurate about what you will do. Praise would corrupt
                that, because it makes the tick feel better than the cross.
              </p>
            </Card>

            <Card>
              <strong>Not confident when it shouldn't be.</strong>
              <p className="prose" style={{ marginBottom: 0 }}>
                Every rate is shown with its uncertainty. Where there isn't enough data, you will
                see "not enough data yet" instead of a number. Expect to see that a lot in the
                first month. That is the app working.
              </p>
            </Card>

            <Card>
              <strong>Not a medical or mental-health tool.</strong>
              <p className="prose" style={{ marginBottom: 0 }}>
                It does not diagnose stress, anxiety or fatigue, and nothing in it substitutes for
                care from a person.
              </p>
            </Card>

            <Card>
              <strong>Not anywhere but here.</strong>
              <p className="prose" style={{ marginBottom: 0 }}>
                Everything is stored on this device. No account, no server, no analytics, nothing
                sent anywhere. Which also means: no backup unless you export one.
              </p>
            </Card>
          </div>

          <div className="btn-row">
            <button type="button" className="btn ghost" onClick={() => setStep(0)}>
              Back
            </button>
            <button type="button" className="btn primary grow" onClick={() => setStep(2)}>
              Continue
            </button>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="stack-lg">
          <div>
            <h1>When is your day?</h1>
            <p className="prose">
              Used to decide which day a late-night entry belongs to.
            </p>
          </div>

          <Field label="Timezone" hint="Detected from this device. Change it if that is wrong.">
            <TextField value={tz} onChange={setTz} placeholder="Asia/Kolkata" />
          </Field>

          <Field
            label="A new day starts at"
            hint="Default 4am, so a late night stays part of the day it belonged to rather than splitting in half at midnight."
          >
            <PillGroup
              options={[
                { value: '0', label: 'Midnight' },
                { value: '3', label: '3am' },
                { value: '4', label: '4am' },
                { value: '5', label: '5am' },
                { value: '6', label: '6am' },
              ]}
              value={String(boundary)}
              onChange={(v) => setBoundary(Number(v))}
            />
          </Field>

          <div className="btn-row">
            <button type="button" className="btn ghost" onClick={() => setStep(1)}>
              Back
            </button>
            <button type="button" className="btn primary grow" onClick={finish}>
              Start
            </button>
          </div>

          <p className="hint">
            Today's date is recorded as the start of your baseline period. The first 30 days are
            compared against later ones. Praxis writes that timestamp down now so you cannot pick
            a flattering window later — a commitment device, not a guarantee, since it is your
            device and your data.
          </p>
        </div>
      ) : null}
    </main>
  );
}
