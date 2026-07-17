'use client';

import { useState } from 'react';
import { useAppState } from '@/lib/app-state';
import { api, ApiRequestError } from '@/lib/api';

export default function GroupNewScreen() {
  const { setScreen, refreshGroup } = useAppState();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function createGroup() {
    const ime = name.trim();
    if (!ime) {
      setError('Vnesi ime skupine.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await api.createGroup(ime);
      await refreshGroup();
      setScreen('app');
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 400 && err.message.includes('already a member')) {
        setError('Že si del ene skupine — nove skupine ni mogoče ustvariti.');
      } else {
        setError(err instanceof ApiRequestError ? err.message : 'Ustvarjanje skupine ni uspelo.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col justify-center px-7 pt-14 pb-10">
      <div className="w-16 h-16 rounded-[18px] bg-[#FCE7E7] flex items-center justify-center mb-6">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#C62828" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      </div>
      <h1 className="text-[28px] font-bold tracking-tight mb-1.5 text-[#4A1212]">Ustvari skupino</h1>
      <p className="text-[15px] text-[#5C6770] mb-6">
        Ime bo iskalni ključ, po katerem se člani pridružijo tvojemu društvu.
      </p>
      <label className="text-[13px] font-semibold text-[#2F3940] mb-1.5 block">Ime skupine</label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="npr. PGD Kamnik"
        className="w-full px-4 py-3.5 border border-[#D9DEE3] rounded-lg text-base mb-2 text-[#4A1212]"
      />
      {error && <p className="text-[13px] text-[#8E1616] mb-4">{error}</p>}
      <button
        onClick={createGroup}
        disabled={loading}
        className="w-full bg-[#C62828] text-white rounded-full py-4 font-semibold text-base cursor-pointer disabled:opacity-60 mt-4"
      >
        {loading ? 'Ustvarjam …' : 'Ustvari skupino'}
      </button>
    </div>
  );
}
