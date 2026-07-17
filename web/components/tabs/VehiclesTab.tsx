'use client';

import { useState } from 'react';
import { useAppState } from '@/lib/app-state';
import { api } from '@/lib/api';

const PREMER_OPTIONS = [75, 110, 150];

export default function VehiclesTab() {
  const { group, vehicles, activeVehicleId, selectVehicle, refreshVehicles } = useAppState();
  const isAdmin = group?.vloga === 'admin';
  const [name, setName] = useState('');
  const [premer, setPremer] = useState(110);
  const [busy, setBusy] = useState(false);

  if (!group) return null;

  async function addVehicle() {
    const ime = name.trim();
    if (!ime || !group) return;
    setBusy(true);
    try {
      await api.addVehicle(group.id, ime, premer);
      setName('');
      await refreshVehicles(group.id);
    } finally {
      setBusy(false);
    }
  }

  async function removeVehicle(id: string) {
    if (!group) return;
    await api.removeVehicle(group.id, id);
    await refreshVehicles(group.id);
  }

  return (
    <div className="flex-1 overflow-auto px-5 pt-13 pb-24 bg-[#F6F8FA]">
      <h1 className="text-2xl font-bold mb-1 text-[#4A1212]">Vozila</h1>
      <p className="text-sm text-[#5C6770] mb-5">Skupna društvu. Izbrano vozilo določi premer cevi za iskanje.</p>

      {vehicles.map((v) => {
        const active = v.id === activeVehicleId;
        return (
          <div
            key={v.id}
            onClick={() => selectVehicle(v.id)}
            className="bg-white rounded-xl p-4 mb-3 flex items-center gap-3 cursor-pointer border-2"
            style={{ borderColor: active ? '#C62828' : '#ECEFF2' }}
          >
            <div
              className="w-11 h-11 rounded-[11px] flex items-center justify-center"
              style={{ background: active ? '#C62828' : '#FCE7E7' }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#fff' : '#C62828'} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
                <path d="M14 9h4l4 4v4a1 1 0 0 1-1 1h-1" />
                <circle cx="7" cy="18" r="2" />
                <circle cx="17" cy="18" r="2" />
              </svg>
            </div>
            <div className="flex-1">
              <div className="text-base font-bold text-[#4A1212]">{v.ime}</div>
              <div className="text-[13px] text-[#5C6770]">Premer cevi {Number(v.premerCevi)} mm</div>
            </div>
            {active && <span className="text-xs font-bold text-[#C62828] bg-[#FCE7E7] py-1.5 px-2.5 rounded-full">Izbrano</span>}
            {isAdmin && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeVehicle(v.id);
                }}
                className="bg-transparent border-none text-[#B6BEC6] text-xl cursor-pointer px-1"
              >
                ×
              </button>
            )}
          </div>
        );
      })}

      {isAdmin && (
        <div className="bg-white rounded-xl p-4 mt-2 shadow-sm">
          <div className="text-sm font-bold text-[#4A1212] mb-3">Dodaj vozilo</div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ime vozila (npr. GVC-1)"
            className="w-full px-3.5 py-3 border border-[#D9DEE3] rounded-lg text-sm mb-2.5 text-[#4A1212]"
          />
          <div className="flex gap-2 mb-3">
            {PREMER_OPTIONS.map((p) => (
              <button
                key={p}
                onClick={() => setPremer(p)}
                className="flex-1 py-2.5 rounded-lg text-[13px] font-semibold cursor-pointer border"
                style={{
                  borderColor: premer === p ? '#C62828' : '#D9DEE3',
                  background: premer === p ? '#FCE7E7' : '#fff',
                  color: premer === p ? '#C62828' : '#5C6770'
                }}
              >
                {p} mm
              </button>
            ))}
          </div>
          <button
            onClick={addVehicle}
            disabled={busy}
            className="w-full bg-[#C62828] text-white rounded-full py-3 font-semibold text-[15px] cursor-pointer disabled:opacity-60"
          >
            Dodaj
          </button>
        </div>
      )}
    </div>
  );
}
