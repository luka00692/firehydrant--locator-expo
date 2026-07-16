'use client';

import { useAppState, type Tab } from '@/lib/app-state';

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  {
    key: 'map',
    label: 'Zemljevid',
    icon: (
      <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
        <line x1="8" y1="2" x2="8" y2="18" />
        <line x1="16" y1="6" x2="16" y2="22" />
      </svg>
    )
  },
  {
    key: 'group',
    label: 'Skupina',
    icon: (
      <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    )
  },
  {
    key: 'vehicles',
    label: 'Vozila',
    icon: (
      <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
        <path d="M14 9h4l4 4v4a1 1 0 0 1-1 1h-1" />
        <circle cx="7" cy="18" r="2" />
        <circle cx="17" cy="18" r="2" />
      </svg>
    )
  },
  {
    key: 'profile',
    label: 'Profil',
    icon: (
      <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    )
  }
];

export default function BottomTabBar({ hasRequests }: { hasRequests: boolean }) {
  const { tab, setTab } = useAppState();

  return (
    <div
      className="h-[78px] flex pb-3.5 border-t border-[#ECEFF2]"
      style={{ background: 'rgba(255,255,255,.96)', backdropFilter: 'blur(12px)' }}
    >
      {TABS.map((t) => (
        <button
          key={t.key}
          onClick={() => setTab(t.key)}
          data-testid={`tab-${t.key}`}
          className="flex-1 flex flex-col items-center gap-1 pt-3 cursor-pointer relative"
          style={{ color: tab === t.key ? '#C62828' : '#B6BEC6' }}
        >
          {t.key === 'group' && hasRequests && (
            <span className="absolute top-2 right-[calc(50%-20px)] w-2.5 h-2.5 rounded-full bg-[#E4572E] border-2 border-white" />
          )}
          {t.icon}
          <span className="text-[11px] font-semibold">{t.label}</span>
        </button>
      ))}
    </div>
  );
}
