import { AuthProvider } from './features/auth/AuthProvider';
import { AuthGate } from './features/auth/AuthGate';
import { TestLoginGate } from './features/auth/TestLoginGate';
import { CodexProvider } from './features/codex/CodexProvider';
import { Shell, type ViewMap } from './app/Shell';
import { OutcomesView } from './features/outcomes/OutcomesView';
import { LifecycleView } from './features/lifecycle/LifecycleView';
import { CctView } from './features/cct/CctView';
import { MapView } from './features/map/MapView';
import { AdminView } from './features/admin/AdminView';
import './styles/hero.css';

const views: ViewMap = {
  dash: <LifecycleView />,
  cct: <CctView />,
  map: <MapView />,
  outcomes: <OutcomesView />,
  admin: <AdminView />,
};

export default function App() {
  return (
    <TestLoginGate>
      <AuthProvider>
        <AuthGate>
          <CodexProvider>
            <Shell views={views} />
          </CodexProvider>
        </AuthGate>
      </AuthProvider>
    </TestLoginGate>
  );
}
