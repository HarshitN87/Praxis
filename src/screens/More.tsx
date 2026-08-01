import { Link } from 'react-router-dom';
import { useStore } from '../app/store';
import { Card, ScreenHead, Section } from '../components/ui';
import {
  IconReframe,
  IconSettings,
  IconSketch,
  IconSystems,
  IconTimeline,
} from '../components/Icons';
import type { Settings } from '../domain/types';

type ModuleKey = keyof Settings['modules'];

/**
 * The optional modules, with an honest line about who each is actually for.
 *
 * All four used to ship switched on, which contradicted both §4.6-4.9 of the
 * spec and Phase 6/7 of the build map, and buried the core loop under things
 * most people never open. They now start off and live here rather than in
 * Settings, because this is where you look when you want to find out what
 * else the app can do.
 */
const OPTIONAL: {
  key: ModuleKey;
  to: string;
  icon: JSX.Element;
  title: string;
  forWhom: string;
}[] = [
  {
    key: 'systemsMap',
    to: '/systems',
    icon: <IconSystems />,
    title: 'Systems map',
    forWhom:
      'For problems that are a slow accumulation — sleep debt, savings, burnout — rather than a single decision. Wants a daily number and stays silent for the first three weeks.',
  },
  {
    key: 'reframing',
    to: '/reframe',
    icon: <IconReframe />,
    title: 'Before a hard task',
    forWhom:
      'Predict how hard something will be, then record how hard it was. Half the entries get a reframing prompt and half deliberately do not, so you can find out whether it works on you.',
  },
  {
    key: 'strategicSketch',
    to: '/sketch',
    icon: <IconSketch />,
    title: 'Strategic sketch',
    forWhom:
      'For a negotiation with one counterparty and two or three moves each. Genuinely useful a handful of times a year, and useless the rest of the time.',
  },
];

export default function More() {
  const { settings, setSettings, all } = useStore();

  const toggle = (key: ModuleKey, on: boolean) =>
    void setSettings({
      modules: {
        ...settings.modules,
        [key]: on,
        // Habit loops only mean anything attached to a flow, so they follow
        // the systems map rather than being a switch of their own.
        ...(key === 'systemsMap' ? { habitLoops: on } : {}),
      },
    });

  const enabled = OPTIONAL.filter((m) => settings.modules[m.key]);
  const disabled = OPTIONAL.filter((m) => !settings.modules[m.key]);

  return (
    <>
      <ScreenHead title="More" sub={`${all.length} entries on this device`} />

      <div className="stack">
        <Link to="/actions" style={{ textDecoration: 'none', color: 'inherit' }}>
          <Card>
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <span style={{ color: 'var(--accent)', marginTop: 2 }}>
                <IconTimeline />
              </span>
              <div className="grow">
                <div className="card-title">Actions &amp; constraints</div>
                <div className="card-meta">
                  What you did, and what you believe is stopping you.
                </div>
              </div>
            </div>
          </Card>
        </Link>

        {enabled.map((m) => (
          <Link key={m.to} to={m.to} style={{ textDecoration: 'none', color: 'inherit' }}>
            <Card>
              <div className="row" style={{ alignItems: 'flex-start' }}>
                <span style={{ color: 'var(--accent)', marginTop: 2 }}>{m.icon}</span>
                <div className="grow">
                  <div className="card-title">{m.title}</div>
                  <div className="card-meta">{m.forWhom}</div>
                </div>
              </div>
            </Card>
          </Link>
        ))}

        <Link to="/settings" style={{ textDecoration: 'none', color: 'inherit' }}>
          <Card>
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <span style={{ color: 'var(--accent)', marginTop: 2 }}>
                <IconSettings />
              </span>
              <div className="grow">
                <div className="card-title">Settings</div>
                <div className="card-meta">
                  Appearance, your day, categories, export and import.
                </div>
              </div>
            </div>
          </Card>
        </Link>
      </div>

      {disabled.length > 0 ? (
        <Section title="Also available">
          <p className="hint" style={{ marginTop: 0, marginBottom: 16 }}>
            Off by default. The core loop — intentions, actions, decisions and the calibration
            curve — does not need any of these, and none of them feed it.
          </p>
          <div className="stack">
            {disabled.map((m) => (
              <Card key={m.key} className="flat">
                <div className="row-between" style={{ alignItems: 'flex-start' }}>
                  <div className="grow">
                    <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 3 }}>
                      {m.title}
                    </div>
                    <div className="card-meta">{m.forWhom}</div>
                  </div>
                  <button
                    type="button"
                    className="btn sm"
                    onClick={() => toggle(m.key, true)}
                    style={{ flexShrink: 0 }}
                  >
                    Turn on
                  </button>
                </div>
              </Card>
            ))}
          </div>
        </Section>
      ) : null}

      {enabled.length > 0 ? (
        <Section title="Turn something off">
          <div className="stack-sm">
            {enabled.map((m) => (
              <div key={m.key} className="row-between">
                <span style={{ fontSize: 14 }}>{m.title}</span>
                <button type="button" className="btn ghost sm" onClick={() => toggle(m.key, false)}>
                  Turn off
                </button>
              </div>
            ))}
          </div>
          <p className="hint">
            Turning a module off hides it. Nothing you logged with it is deleted, and it comes
            back exactly as it was.
          </p>
        </Section>
      ) : null}
    </>
  );
}
