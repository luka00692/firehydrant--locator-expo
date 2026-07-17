'use client';

import { useState } from 'react';
import { useAppState } from '@/lib/app-state';
import { ApiRequestError } from '@/lib/api';

export default function AuthScreen() {
  const { completeAuth } = useAppState();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [uporabniskoIme, setUporabniskoIme] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError('Vnesi e-pošto.');
      return;
    }
    // TEMPORARY: only Gmail addresses accepted, in lieu of real "Sign in with
    // Google" (which needs a registered OAuth app) — see backend/README.md TODO.
    if (!/^[^@\s]+@gmail\.com$/i.test(trimmedEmail)) {
      setError('Prijava je mogoča samo z Gmail naslovom (@gmail.com).');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await completeAuth(email.trim(), uporabniskoIme.trim() || email.split('@')[0]);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Prijava ni uspela.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col px-7 pt-16 pb-8 overflow-auto">
      <span className="text-sm font-bold tracking-wide text-[#4A1212] self-start mb-9">ABELIUM</span>
      <h1 className="text-[28px] font-bold tracking-tight mb-1.5 text-[#4A1212]">
        {mode === 'login' ? 'Prijava' : 'Registracija'}
      </h1>
      <p className="text-[15px] text-[#5C6770] mb-6">Aplikacija za gasilska društva za iskanje najbližjega hidranta.</p>

      <div className="flex gap-2.5 mb-5">
        <button
          onClick={() => setMode('login')}
          className="flex-1 py-2.5 rounded-full font-semibold text-sm cursor-pointer border"
          style={{
            borderColor: mode === 'login' ? '#4A1212' : '#D9DEE3',
            background: mode === 'login' ? '#4A1212' : '#fff',
            color: mode === 'login' ? '#fff' : '#5C6770'
          }}
        >
          Prijava
        </button>
        <button
          onClick={() => setMode('register')}
          className="flex-1 py-2.5 rounded-full font-semibold text-sm cursor-pointer border"
          style={{
            borderColor: mode === 'register' ? '#4A1212' : '#D9DEE3',
            background: mode === 'register' ? '#4A1212' : '#fff',
            color: mode === 'register' ? '#fff' : '#5C6770'
          }}
        >
          Registracija
        </button>
      </div>

      {mode === 'register' && (
        <>
          <label className="text-[13px] font-semibold text-[#2F3940] mb-1.5 block">Uporabniško ime</label>
          <input
            value={uporabniskoIme}
            onChange={(e) => setUporabniskoIme(e.target.value)}
            placeholder="Janez Novak"
            className="w-full px-4 py-3.5 border border-[#D9DEE3] rounded-lg text-[15px] mb-4 text-[#4A1212]"
          />
        </>
      )}

      <label className="text-[13px] font-semibold text-[#2F3940] mb-1.5 block">Gmail e-pošta</label>
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="ime@gmail.com"
        className="w-full px-4 py-3.5 border border-[#D9DEE3] rounded-lg text-[15px] mb-4 text-[#4A1212]"
      />
      <label className="text-[13px] font-semibold text-[#2F3940] mb-1.5 block">Geslo</label>
      <input
        type="password"
        value={pass}
        onChange={(e) => setPass(e.target.value)}
        placeholder="••••••••"
        className="w-full px-4 py-3.5 border border-[#D9DEE3] rounded-lg text-[15px] mb-2 text-[#4A1212]"
      />
      <p className="text-[12px] text-[#8A949E] mb-5">
        Prototip nima gesel — vpiši samo Gmail e-pošto, ostalo je za prihodnjo verzijo.
      </p>

      {error && <p className="text-[13px] text-[#8E1616] mb-4">{error}</p>}

      <button
        onClick={submit}
        disabled={loading}
        data-testid="auth-submit"
        className="w-full bg-[#C62828] text-white rounded-full py-4 font-semibold text-base cursor-pointer disabled:opacity-60"
      >
        {loading ? 'Nalagam …' : mode === 'login' ? 'Prijava' : 'Registracija'}
      </button>
    </div>
  );
}
