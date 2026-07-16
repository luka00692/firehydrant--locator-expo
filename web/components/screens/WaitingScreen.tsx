'use client';

import { useEffect, useState } from 'react';
import { useAppState } from '@/lib/app-state';
import { api, ApiRequestError } from '@/lib/api';

const POLL_MS = 5000;

export default function WaitingScreen() {
  const { pendingGroupName, setScreen, refreshGroup } = useAppState();
  const [rejected, setRejected] = useState(false);

  useEffect(() => {
    if (!pendingGroupName) return;
    let cancelled = false;

    async function poll() {
      try {
        const membership = await api.myJoinStatus(pendingGroupName);
        if (cancelled) return;
        if (membership.status === 'approved') {
          await refreshGroup();
          setScreen('app');
        } else if (membership.status === 'rejected') {
          setRejected(true);
        }
      } catch (err) {
        if (!(err instanceof ApiRequestError && err.status === 404)) {
          // transient network error — try again on the next tick
        }
      }
    }

    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [pendingGroupName, refreshGroup, setScreen]);

  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-8 pt-14 pb-10 bg-[#4A1212] text-white">
      {rejected ? (
        <>
          <h1 className="text-[26px] font-bold mb-3 text-white">Prošnja zavrnjena</h1>
          <p className="text-[15px] mb-8" style={{ color: 'rgba(255,255,255,.68)' }}>
            Lastnik skupine <strong className="text-white">{pendingGroupName}</strong> je tvojo prošnjo zavrnil.
          </p>
          <button
            onClick={() => setScreen('join')}
            className="bg-[#C62828] text-white rounded-full py-3 px-6 font-semibold text-sm cursor-pointer"
          >
            Poskusi drugo skupino
          </button>
        </>
      ) : (
        <>
          <div
            className="w-[60px] h-[60px] rounded-full mb-7"
            style={{
              border: '4px solid rgba(255,255,255,.18)',
              borderTopColor: '#E57373',
              animation: 'ab-spin 1s linear infinite'
            }}
          />
          <h1 className="text-[26px] font-bold mb-3 text-white">Čakam na odobritev</h1>
          <p className="text-[15px] mb-2" style={{ color: 'rgba(255,255,255,.68)' }}>
            Prošnja za pridružitev skupini <strong className="text-white">{pendingGroupName}</strong> je poslana.
          </p>
          <p className="text-[13px] mb-8" style={{ color: 'rgba(255,255,255,.45)' }}>
            Zaslon se posodobi samodejno, ko lastnik odgovori.
          </p>
          <button
            onClick={() => setScreen('join')}
            className="bg-transparent text-white/50 text-sm cursor-pointer"
            style={{ color: 'rgba(255,255,255,.5)' }}
          >
            Prekliči
          </button>
        </>
      )}
    </div>
  );
}
