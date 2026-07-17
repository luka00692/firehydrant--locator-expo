'use client';

import { useState } from 'react';
import { useAppState } from '@/lib/app-state';
import { api, ApiRequestError } from '@/lib/api';
import type { PaketTip } from '@/lib/types';

const PACKAGE_DEFS: { tip: PaketTip; name: string; seatsLabel: string; price: string; minQty: number; maxQty: number }[] = [
  { tip: 'osnovni', name: 'Mali', seatsLabel: '1–50 oseb', price: '4,99 €', minQty: 1, maxQty: 50 },
  { tip: 'napredni', name: 'Srednji', seatsLabel: '50–100 oseb', price: '14,99 €', minQty: 50, maxQty: 100 },
  { tip: 'premium', name: 'Veliki', seatsLabel: '100–200 oseb', price: '24,99 €', minQty: 100, maxQty: 200 }
];

export default function PackagesScreen() {
  const { setScreen, selectedPackage, setSelectedPackage } = useAppState();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function buyContinue() {
    setError(null);
    setLoading(true);
    try {
      const res = await api.checkout(selectedPackage.tip, selectedPackage.qty);
      window.location.href = res.url;
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 503) {
        setError('Plačila trenutno niso na voljo — backend nima nastavljenega Stripe ključa (STRIPE_SECRET_KEY).');
      } else {
        setError(err instanceof ApiRequestError ? err.message : 'Nakup ni uspel.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-auto px-5 pt-14 pb-6 bg-[#F6F8FA]">
      <h1 className="text-[26px] font-bold tracking-tight mb-1 text-[#4A1212]">Izberi paket</h1>
      <p className="text-sm text-[#5C6770] mb-5">En paket = ena skupina = ena licenca.</p>

      {PACKAGE_DEFS.map((p) => {
        const selected = selectedPackage.tip === p.tip;
        return (
          <div
            key={p.tip}
            onClick={() => setSelectedPackage({ tip: p.tip, qty: selectedPackage.tip === p.tip ? selectedPackage.qty : p.minQty })}
            className="bg-white rounded-2xl p-4.5 mb-3.5 cursor-pointer border-2 transition-colors"
            style={{ borderColor: selected ? '#C62828' : '#ECEFF2' }}
          >
            <div className="flex justify-between items-start">
              <div>
                <div className="text-lg font-bold text-[#4A1212]">{p.name}</div>
                <div className="text-[13px] text-[#5C6770] mt-0.5">{p.seatsLabel}</div>
              </div>
              <div className="text-xl font-bold text-[#C62828]">{p.price}</div>
            </div>
            {selected && p.maxQty > p.minQty && (
              <div className="flex items-center gap-3.5 mt-4 pt-3.5 border-t border-[#ECEFF2]">
                <span className="text-[13px] font-semibold text-[#2F3940]">Število oseb</span>
                <div className="flex items-center gap-3 ml-auto">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedPackage({ tip: p.tip, qty: Math.max(p.minQty, selectedPackage.qty - 1) });
                    }}
                    className="w-[34px] h-[34px] rounded-full border border-[#D9DEE3] bg-white text-xl leading-none cursor-pointer text-[#4A1212]"
                  >
                    −
                  </button>
                  <span className="text-[17px] font-bold min-w-5 text-center">{selectedPackage.qty}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedPackage({ tip: p.tip, qty: Math.min(p.maxQty, selectedPackage.qty + 1) });
                    }}
                    className="w-[34px] h-[34px] rounded-full border border-[#C62828] bg-[#C62828] text-white text-xl leading-none cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {error && <p className="text-[13px] text-[#8E1616] mb-3">{error}</p>}

      <button
        onClick={buyContinue}
        disabled={loading}
        className="w-full bg-[#C62828] text-white rounded-full py-4 font-semibold text-base mb-3.5 cursor-pointer disabled:opacity-60"
      >
        {loading ? 'Nalagam …' : 'Nadaljuj na plačilo'}
      </button>
      <button
        onClick={() => setScreen('join')}
        className="w-full bg-white text-[#4A1212] border border-[#D9DEE3] rounded-full py-3.5 font-semibold text-[15px] cursor-pointer"
      >
        Vstopi kot gost
      </button>
    </div>
  );
}
