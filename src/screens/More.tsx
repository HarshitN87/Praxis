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

export default function More() {
  const { settings, all } = useStore();

  const items = [
    {
      to: '/actions',
      icon: <IconTimeline />,
      title: 'Actions & constraints',
      body: 'What you did, and what you believe is stopping you.',
      on: true,
    },
    {
      to: '/systems',
      icon: <IconSystems />,
      title: 'Systems map',
      body: 'Stocks, flows, delays, and whether your interventions moved anything.',
      on: settings.modules.systemsMap,
    },
    {
      to: '/reframe',
      icon: <IconReframe />,
      title: 'Before a hard task',
      body: 'Predicted difficulty against actual, with a randomised control arm.',
      on: settings.modules.reframing,
    },
    {
      to: '/sketch',
      icon: <IconSketch />,
      title: 'Strategic sketch',
      body: 'For the rare situation that really is a game with one counterparty.',
      on: settings.modules.strategicSketch,
    },
    {
      to: '/settings',
      icon: <IconSettings />,
      title: 'Settings',
      body: 'Timezone, day boundary, modules, export and import.',
      on: true,
    },
  ];

  return (
    <>
      <ScreenHead title="More" sub={`${all.length} entries on this device`} />
      <Section>
        <div className="stack">
          {items
            .filter((i) => i.on)
            .map((i) => (
              <Link key={i.to} to={i.to} style={{ textDecoration: 'none', color: 'inherit' }}>
                <Card>
                  <div className="row" style={{ alignItems: 'flex-start' }}>
                    <span style={{ color: 'var(--accent)', marginTop: 2 }}>{i.icon}</span>
                    <div className="grow">
                      <div className="card-title">{i.title}</div>
                      <div className="card-meta">{i.body}</div>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
        </div>
      </Section>

      {items.some((i) => !i.on) ? (
        <p className="hint">
          Some modules are switched off. Turn them back on in Settings.
        </p>
      ) : null}
    </>
  );
}
