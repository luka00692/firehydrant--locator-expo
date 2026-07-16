'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAppState } from '@/lib/app-state';
import { api, ApiRequestError } from '@/lib/api';
import type { JoinRequest } from '@/lib/types';

const POLL_MS = 10000;

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

export default function GroupTab({ onRequestsChange }: { onRequestsChange: (count: number) => void }) {
  const { group, refreshGroup } = useAppState();
  const isAdmin = group?.vloga === 'admin';
  const [members, setMembers] = useState<JoinRequest[]>([]);
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!group) return;
    try {
      const [m, r] = await Promise.all([
        api.members(group.id),
        isAdmin ? api.pendingRequests(group.id) : Promise.resolve([])
      ]);
      setMembers(m);
      setRequests(r);
      onRequestsChange(r.length);
    } catch {
      // transient — keep showing the last known state
    }
  }, [group, isAdmin, onRequestsChange]);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    const interval = setInterval(load, POLL_MS);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [load]);

  async function approve(id: string) {
    setBusy(id);
    setError(null);
    try {
      await api.approveMembership(id);
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError && err.status === 409 ? 'Paket je poln — ni prostih mest.' : 'Odobritev ni uspela.');
    } finally {
      setBusy(null);
    }
  }

  async function reject(id: string) {
    setBusy(id);
    try {
      await api.rejectMembership(id);
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function removeMember(id: string) {
    setBusy(id);
    try {
      await api.removeMembership(id);
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function makeAdmin(id: string) {
    setBusy(id);
    try {
      await api.setMembershipRole(id, 'admin');
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function rename() {
    const next = window.prompt('Novo ime skupine:', group?.ime);
    if (!next || !next.trim() || !group) return;
    await api.updateGroup(group.id, { ime: next.trim() });
    await refreshGroup();
  }

  async function setHome() {
    if (!group) return;
    const address = window.prompt('Naslov gasilskega doma (npr. Glavni trg 1, Kamnik):');
    if (!address) return;
    try {
      const loc = await api.geocode(address);
      await api.updateGroup(group.id, { lokacijaDoma: { lat: loc.lat, lng: loc.lon } });
      await refreshGroup();
    } catch {
      setError('Naslova ni bilo mogoče najti.');
    }
  }

  if (!group) return null;

  const seatsFull = members.length >= group.stSedezev;

  return (
    <div className="flex-1 overflow-auto px-5 pt-13 pb-24 bg-[#F6F8FA]">
      <h1 className="text-2xl font-bold mb-1 text-[#4A1212]">{group.ime}</h1>
      <div className="flex items-center gap-2 mb-5">
        <span className="text-sm text-[#5C6770]">{isAdmin ? 'Lastnik' : 'Član'}</span>
        <span className="w-1 h-1 rounded-full bg-[#B6BEC6]" />
        <span className="text-sm text-[#5C6770]">
          {members.length}/{group.stSedezev}
        </span>
      </div>

      {isAdmin && (
        <div className="flex gap-2.5 mb-5.5">
          <button onClick={rename} className="flex-1 bg-white border border-[#D9DEE3] rounded-[10px] py-3 text-[13px] font-semibold text-[#4A1212] cursor-pointer">
            Preimenuj
          </button>
          <button onClick={setHome} className="flex-1 bg-white border border-[#D9DEE3] rounded-[10px] py-3 text-[13px] font-semibold text-[#4A1212] cursor-pointer">
            Lokacija doma
          </button>
        </div>
      )}

      {error && <p className="text-[13px] text-[#8E1616] mb-3">{error}</p>}

      {isAdmin && requests.length > 0 && (
        <>
          <div className="text-[13px] font-bold uppercase tracking-wide text-[#C62828] mb-2.5">
            Čakajoče prošnje ({requests.length})
          </div>
          {requests.map((r) => (
            <div key={r.id} className="bg-white rounded-xl p-3.5 mb-2.5 flex items-center gap-3 shadow-sm">
              <div className="w-10 h-10 rounded-full bg-[#FCE7E7] text-[#C62828] flex items-center justify-center font-bold text-sm">
                {initials(r.uporabniskoIme)}
              </div>
              <div className="flex-1">
                <div className="text-[15px] font-semibold text-[#4A1212]">{r.uporabniskoIme}</div>
                <div className="text-xs text-[#8A949E]">{r.email}</div>
              </div>
              <button
                onClick={() => reject(r.id)}
                disabled={busy === r.id}
                className="w-9 h-9 rounded-full border border-[#D9DEE3] bg-white cursor-pointer text-[#5C6770] text-base"
              >
                ×
              </button>
              <button
                onClick={() => approve(r.id)}
                disabled={busy === r.id || seatsFull}
                className="w-9 h-9 rounded-full border-none text-white flex items-center justify-center cursor-pointer"
                style={{ background: seatsFull ? '#B6BEC6' : '#C62828' }}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </button>
            </div>
          ))}
          {seatsFull && <div className="text-[13px] text-[#E4572E] my-0.5 mb-4.5">Paket je poln. Odstrani člana za dodatno mesto.</div>}
        </>
      )}

      <div className="text-[13px] font-bold uppercase tracking-wide text-[#8A949E] mt-3.5 mb-2.5">
        Člani ({members.length})
      </div>
      {members.map((m) => {
        const isSelf = m.vloga === 'admin' && m.uporabnikId === group.lastnikId;
        return (
          <div key={m.id} className="bg-white rounded-xl p-3.5 mb-2.5 flex items-center gap-3 shadow-sm">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm"
              style={{ background: isSelf ? '#4A1212' : '#FCE7E7', color: isSelf ? '#fff' : '#C62828' }}
            >
              {initials(m.uporabniskoIme)}
            </div>
            <div className="flex-1">
              <div className="text-[15px] font-semibold text-[#4A1212]">{m.uporabniskoIme}</div>
              <div className="text-xs font-semibold" style={{ color: m.vloga === 'admin' ? '#C62828' : '#8A949E' }}>
                {m.vloga === 'admin' ? 'Admin' : 'Član'}
              </div>
            </div>
            {isAdmin && !isSelf && (
              <>
                <button
                  onClick={() => makeAdmin(m.id)}
                  disabled={busy === m.id}
                  className="bg-transparent border border-[#D9DEE3] rounded-full py-1.5 px-3 text-xs font-semibold text-[#C62828] cursor-pointer"
                >
                  Admin
                </button>
                <button
                  onClick={() => removeMember(m.id)}
                  disabled={busy === m.id}
                  className="bg-transparent border-none text-[#B6BEC6] text-xl leading-none cursor-pointer px-1"
                >
                  ×
                </button>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
