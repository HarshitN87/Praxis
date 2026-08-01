import { useRef, useState } from 'react';
import { useStore } from '../app/store';
import * as repo from '../data/repo';
import { downloadBackup, importBackup, wipeEverything } from '../data/backup';
import {
  Card,
  Field,
  Notice,
  NumberField,
  PillGroup,
  ScreenHead,
  Section,
  TextField,
  Toggle,
} from '../components/ui';
import { formatInstantHuman } from '../domain/dates';
import type { Settings } from '../domain/types';

export default function SettingsScreen() {
  const { settings, setSettings, categories, reloadCategories, refresh, all } = useStore();
  const [newCategory, setNewCategory] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <ScreenHead title="Settings" />

      <Section title="Appearance">
        <Card>
          <Field
            label="Theme"
            hint="Auto follows your device. The evening check-in usually happens after dark, which is what dark mode is really for here."
          >
            <PillGroup
              options={[
                { value: 'auto', label: 'Auto' },
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
              ]}
              value={settings.theme}
              onChange={(v) => void setSettings({ theme: v as Settings['theme'] })}
            />
          </Field>
        </Card>
      </Section>

      <Section title="Your day">
        <Card className="stack">
          <Field label="Timezone">
            <TextField value={settings.timezone} onChange={(v) => void setSettings({ timezone: v })} />
          </Field>
          <Field
            label="A new day starts at"
            hint="Entries made before this hour count towards the previous day."
          >
            <PillGroup
              options={[0, 3, 4, 5, 6].map((h) => ({
                value: String(h),
                label: h === 0 ? 'Midnight' : `${h}am`,
              }))}
              value={String(settings.dayBoundaryHour)}
              onChange={(v) => void setSettings({ dayBoundaryHour: Number(v) })}
            />
          </Field>
          <Field label="Evening check-in hour">
            <NumberField
              value={settings.checkinHour}
              onChange={(v) => void setSettings({ checkinHour: v ?? 20 })}
              min={0}
            />
          </Field>
        </Card>
      </Section>

      <Section title="Reminders">
        <Card>
          <Toggle
            label="Daily check-in reminder"
            checked={settings.dailyReminderEnabled}
            onChange={(v) => void setSettings({ dailyReminderEnabled: v })}
            hint="The one notification Praxis sends. The intention loop needs a daily prompt to work at all."
          />
          <Toggle
            label="Weekly summary"
            checked={settings.weeklyDigestEnabled}
            onChange={(v) => void setSettings({ weeklyDigestEnabled: v })}
          />
          <Notice kind="plain">
            At most one notification a day, plus one weekly summary. No streak reminders, no
            re-engagement nudges, no badge counters. There is nothing here that benefits from you
            opening the app more often.
          </Notice>
        </Card>
      </Section>

      <Section title="How many intentions a day">
        <Card className="stack">
          <Field
            label="Gentle warning at"
            hint="Three is usually where follow-through starts dropping."
          >
            <NumberField
              value={settings.softIntentionWarnAt}
              onChange={(v) => void setSettings({ softIntentionWarnAt: v ?? 3 })}
              min={1}
            />
          </Field>
          <Field label="Hard cap at">
            <NumberField
              value={settings.maxIntentionsPerDay}
              onChange={(v) => void setSettings({ maxIntentionsPerDay: v ?? 5 })}
              min={1}
            />
          </Field>
        </Card>
      </Section>

      <Section title="Categories">
        <Card>
          <div className="stack-sm">
            {categories.map((c) => (
              <div key={c.id} className="row-between">
                <span>{c.name}</span>
                <button
                  type="button"
                  className="btn ghost sm"
                  onClick={async () => {
                    await repo.updateCategory(c.id, { archived: true });
                    await reloadCategories();
                  }}
                >
                  Archive
                </button>
              </div>
            ))}
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <TextField value={newCategory} onChange={setNewCategory} placeholder="New category" />
            <button
              type="button"
              className="btn sm"
              disabled={!newCategory.trim()}
              onClick={async () => {
                await repo.createCategory(newCategory.trim());
                setNewCategory('');
                await reloadCategories();
              }}
            >
              Add
            </button>
          </div>
          <p className="hint">
            Archiving keeps past entries and their history intact — it only removes the category
            from the picker.
          </p>
        </Card>
      </Section>

      <Section title="Optional modules">
        <Card>
          <Toggle
            label="Systems map"
            checked={settings.modules.systemsMap}
            onChange={(v) => void setSettings({ modules: { ...settings.modules, systemsMap: v } })}
          />
          <Toggle
            label="Habit loops"
            checked={settings.modules.habitLoops}
            onChange={(v) => void setSettings({ modules: { ...settings.modules, habitLoops: v } })}
          />
          <Toggle
            label="Expectation reframing"
            checked={settings.modules.reframing}
            onChange={(v) => void setSettings({ modules: { ...settings.modules, reframing: v } })}
          />
          <Toggle
            label="Strategic sketch"
            checked={settings.modules.strategicSketch}
            onChange={(v) =>
              void setSettings({ modules: { ...settings.modules, strategicSketch: v } })
            }
          />
          <p className="hint">
            The intention, action and decision tiers cannot be switched off — they are the one
            thing feeding the calibration engine.
          </p>
        </Card>
      </Section>

      <Section title="Your data">
        <Card className="stack">
          <p className="prose" style={{ marginTop: 0 }}>
            {all.length} entries, stored only in this browser on this device. Nothing is sent
            anywhere. Which also means clearing your browser data deletes it — export
            occasionally.
          </p>

          <div className="btn-row">
            <button type="button" className="btn" onClick={() => void downloadBackup()}>
              Export everything
            </button>
            <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
              Import
            </button>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            style={{ display: 'none' }}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (
                !confirm(
                  'Importing REPLACES everything currently in Praxis on this device. Export a backup first if you might want it. Continue?',
                )
              ) {
                e.target.value = '';
                return;
              }
              const result = await importBackup(await file.text());
              setMessage(result.message);
              e.target.value = '';
              if (result.ok) await refresh();
            }}
          />

          {message ? <Notice kind="plain">{message}</Notice> : null}

          {settings.evaluationBaselineStartedAt ? (
            <Notice kind="plain" title="Baseline period">
              Recorded {formatInstantHuman(settings.evaluationBaselineStartedAt)}. Your first 30
              days are compared against later ones. This timestamp was written at first launch so
              the window could not be chosen after the fact — a commitment device, not a
              guarantee, since it is your device and your data.
            </Notice>
          ) : null}

          <button
            type="button"
            className="btn danger"
            onClick={async () => {
              if (!confirm('Delete everything permanently? This cannot be undone.')) return;
              if (!confirm('Really? Export a backup first if there is any doubt.')) return;
              await wipeEverything();
              location.reload();
            }}
          >
            Delete everything
          </button>
        </Card>
      </Section>

      <Section title="What Praxis will not do">
        <Card className="flat">
          <p className="prose" style={{ marginTop: 0 }}>
            It will not show a rate without its uncertainty, will not report a pattern that has
            not cleared its minimum sample, will not combine your metrics into a single score,
            will not praise or scold a result, and will not tell you what your intentions should
            be.
          </p>
          <p className="prose" style={{ marginBottom: 0 }}>
            It does not diagnose anything, and it is not a substitute for care from a person.
          </p>
        </Card>
      </Section>
    </>
  );
}
