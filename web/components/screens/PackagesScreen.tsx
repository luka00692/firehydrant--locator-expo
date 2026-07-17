'use client';

import { useState } from 'react';
import { useAppState } from '@/lib/app-state';
import { api, ApiRequestError } from '@/lib/api';
import type { PaketTip } from '@/lib/types';

const PACKAGE_DEFS: { tip: PaketTip; name: string; seatsLabel: string; price: string; minQty: number; maxQty: number }[] = [
  { tip: 'osnovni', name: 'Mali', seatsLabel: '50 oseb', price: '4,99 €', minQty: 50, maxQty: 50 },
  { tip: 'napredni', name: 'Srednji', seatsLabel: '100 oseb', price: '14,99 €', minQty: 100, maxQty: 100 },
  { tip: 'premium', name: 'Veliki', seatsLabel: '200 oseb', price: '24,99 €', minQty: 200, maxQty: 200 }
];

const PAYMENT_METHODS = [
  { key: 'kartica', label: 'Kartica' },
  { key: 'paypal', label: 'PayPal' },
  { key: 'apple-pay', label: 'Apple Pay' }
] as const;

type PaymentMethod = (typeof PAYMENT_METHODS)[number]['key'];

export default function PackagesScreen() {
  const { setScreen, selectedPackage, setSelectedPackage, refreshGroup } = useAppState();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>('kartica');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvc, setCardCvc] = useState('');

  // TEMPORARY demo bypass: real payment (api.checkout, Stripe) isn't wired up
  // yet, so this fakes a successful purchase instead of actually charging
  // anything, regardless of which payment method is "selected" below — see
  // backend/api/groups/index.js and backend/README.md TODO.
  async function buyContinue() {
    setError(null);
    setLoading(true);
    try {
      await api.fakePurchase(selectedPackage.tip, selectedPackage.qty);
      const existingGroup = await refreshGroup();
      setScreen(existingGroup ? 'app' : 'groupNew');
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Nakup ni uspel.');
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

      <div className="text-[13px] font-bold uppercase tracking-wide text-[#8A949E] mt-1 mb-2.5">Način plačila</div>
      <div className="flex gap-2 mb-3.5">
        {PAYMENT_METHODS.map((m) => (
          <button
            key={m.key}
            onClick={() => setMethod(m.key)}
            className="flex-1 py-2.5 rounded-full text-[13px] font-semibold cursor-pointer border"
            style={{
              background: method === m.key ? '#C62828' : '#fff',
              color: method === m.key ? '#fff' : '#5C6770',
              borderColor: method === m.key ? '#C62828' : '#D9DEE3'
            }}
          >
            {m.label}
          </button>
        ))}
      </div>

      {method === 'kartica' && (
        <div className="bg-white rounded-2xl p-4.5 mb-3.5 border-2 border-[#ECEFF2]">
          <input
            value={cardNumber}
            onChange={(e) => setCardNumber(e.target.value)}
            placeholder="1234 5678 9012 3456"
            className="w-full px-4 py-3.5 border border-[#D9DEE3] rounded-lg text-base mb-2.5 text-[#4A1212]"
          />
          <div className="flex gap-2.5">
            <input
              value={cardExpiry}
              onChange={(e) => setCardExpiry(e.target.value)}
              placeholder="MM/LL"
              className="flex-1 px-4 py-3.5 border border-[#D9DEE3] rounded-lg text-base text-[#4A1212]"
            />
            <input
              value={cardCvc}
              onChange={(e) => setCardCvc(e.target.value)}
              placeholder="CVC"
              className="flex-1 px-4 py-3.5 border border-[#D9DEE3] rounded-lg text-base text-[#4A1212]"
            />
          </div>
        </div>
      )}

      <p className="text-[12px] text-[#8A949E] mb-3.5">
        Demo način — plačilo je simulirano, ne bo dejansko zaračunano.
      </p>

      {error && <p className="text-[13px] text-[#8E1616] mb-3">{error}</p>}

      <button
        onClick={buyContinue}
        disabled={loading}
        className="w-full bg-[#C62828] text-white rounded-full py-4 font-semibold text-base mb-3.5 cursor-pointer disabled:opacity-60"
      >
        {loading ? 'Nalagam …' : 'Plačaj zdaj'}
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
