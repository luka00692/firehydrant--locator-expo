'use client';

import { useEffect, useRef, useState } from 'react';
import { useAppState } from '@/lib/app-state';
import { api, ApiRequestError } from '@/lib/api';

const AUTO_SUBMIT_DELAY_MS = 600;

export default function JoinScreen() {
  const { setScreen, setPendingGroupName } = useAppState();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const submittedRef = useRef(false);

  async function sendRequest() {
    const ime = name.trim();
    if (!ime) {
      setError('Vnesi ime skupine.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await api.joinGroup(ime);
      submittedRef.current = true;
      setPendingGroupName(ime);
      setScreen('waiting');
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Prošnja ni uspela.');
    } finally {
      setLoading(false);
    }
  }

  // Auto-submit shortly after typing stops, so entering a group name is
  // enough to move forward without also having to press the button.
  useEffect(() => {
    if (submittedRef.current || !name.trim() || loading) return;
    const timer = setTimeout(sendRequest, AUTO_SUBMIT_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  return (
    <div className="flex-1 flex flex-col justify-center px-7 pt-14 pb-10">
      <div className="w-16 h-16 rounded-[18px] bg-[#FCE7E7] flex items-center justify-center mb-6">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#C62828" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <line x1="19" y1="8" x2="19" y2="14" />
          <line x1="22" y1="11" x2="16" y2="11" />
        </svg>
      </div>
      <h1 className="text-[28px] font-bold tracking-tight mb-1.5 text-[#4A1212]">Pridruži se skupini</h1>
      <p className="text-[15px] text-[#5C6770] mb-6">
        Vpiši ime društva. Lastnik skupine bo tvojo prošnjo odobril ali zavrnil.
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
        onClick={sendRequest}
        disabled={loading}
        className="w-full bg-[#C62828] text-white rounded-full py-4 font-semibold text-base cursor-pointer disabled:opacity-60 mt-4"
      >
        {loading ? 'Pošiljam …' : 'Pošlji prošnjo'}
      </button>
    </div>
  );
}
