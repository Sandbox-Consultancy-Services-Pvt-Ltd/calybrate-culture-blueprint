import { Icon, type IconName } from './ui';

export type Tab = 'overview' | 'users' | 'structure' | 'activity' | 'backup' | 'settings' | 'announcements';

interface Item {
  key: Tab;
  label: string;
  icon: IconName;
}
export const NAV: Array<{ group: string; items: Item[] }> = [
  { group: 'Overview', items: [{ key: 'overview', label: 'Dashboard', icon: 'dashboard' }] },
  { group: 'People', items: [{ key: 'users', label: 'Users', icon: 'users' }] },
  { group: 'Content', items: [{ key: 'structure', label: 'Areas & pillars', icon: 'structure' }] },
  {
    group: 'System',
    items: [
      { key: 'activity', label: 'Activity', icon: 'activity' },
      { key: 'announcements', label: 'Announcements', icon: 'megaphone' },
      { key: 'backup', label: 'Backup', icon: 'backup' },
      { key: 'settings', label: 'Settings', icon: 'settings' },
    ],
  },
];
export const TABS: Tab[] = NAV.flatMap((g) => g.items.map((i) => i.key));

/** Sidebar on desktop; a scrolling strip under the top bar on small screens. */
export function AdminNav({ tab, onChoose, counts, dots }: { tab: Tab; onChoose: (t: Tab) => void; counts: Partial<Record<Tab, number>>; dots: Partial<Record<Tab, boolean>> }) {
  return (
    <nav className="ad-side" aria-label="Administration sections">
      {NAV.map((g) => (
        <div className="ad-grp" key={g.group}>
          <span className="ad-grp-t">{g.group}</span>
          {g.items.map((i) => (
            <button
              key={i.key}
              type="button"
              className={tab === i.key ? 'on' : undefined}
              aria-current={tab === i.key ? 'page' : undefined}
              data-tab={i.key}
              onClick={() => onChoose(i.key)}
            >
              <Icon name={i.icon} />
              <span className="lbl">{i.label}</span>
              {counts[i.key] != null && <span className="cnt">{counts[i.key]}</span>}
              {dots[i.key] && <span className="dot" role="img" aria-label="Needs attention" />}
            </button>
          ))}
        </div>
      ))}
    </nav>
  );
}
