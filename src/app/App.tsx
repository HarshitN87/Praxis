import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { useStore } from './store';
import Today from '../screens/Today';
import Timeline from '../screens/Timeline';
import NewDecision from '../screens/NewDecision';
import CommitmentDetail from '../screens/CommitmentDetail';
import Actions from '../screens/Actions';
import Systems from '../screens/Systems';
import Reframing from '../screens/Reframing';
import Sketch from '../screens/Sketch';
import Metrics from '../screens/Metrics';
import More from '../screens/More';
import SettingsScreen from '../screens/Settings';
import Onboarding from '../screens/Onboarding';
import { IconDecision, IconMetrics, IconMore, IconTimeline, IconToday } from '../components/Icons';

export default function App() {
  const { ready, settings } = useStore();

  if (!ready) {
    return (
      <div className="shell">
        <p className="muted" style={{ marginTop: 48 }}>
          Opening your notebook…
        </p>
      </div>
    );
  }

  if (!settings.onboardedAt) {
    return <Onboarding />;
  }

  return (
    <>
      <main className="shell">
        <Routes>
          <Route path="/" element={<Today />} />
          <Route path="/timeline" element={<Timeline />} />
          <Route path="/decide" element={<NewDecision />} />
          <Route path="/commitment/:id" element={<CommitmentDetail />} />
          <Route path="/actions" element={<Actions />} />
          <Route path="/systems" element={<Systems />} />
          <Route path="/reframe" element={<Reframing />} />
          <Route path="/sketch" element={<Sketch />} />
          <Route path="/metrics" element={<Metrics />} />
          <Route path="/more" element={<More />} />
          <Route path="/settings" element={<SettingsScreen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <nav className="nav">
        <NavLink to="/" end>
          <IconToday />
          Today
        </NavLink>
        <NavLink to="/timeline">
          <IconTimeline />
          Timeline
        </NavLink>
        <NavLink to="/decide">
          <IconDecision />
          Decide
        </NavLink>
        <NavLink to="/metrics">
          <IconMetrics />
          Calibration
        </NavLink>
        <NavLink to="/more">
          <IconMore />
          More
        </NavLink>
      </nav>
    </>
  );
}
