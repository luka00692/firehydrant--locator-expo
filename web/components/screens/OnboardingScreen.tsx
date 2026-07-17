'use client';

import { useState } from 'react';
import { useAppState } from '@/lib/app-state';

const SLIDES = [
  {
    eyebrow: 'Iskanje',
    title: 'V sekundah najdi najbližji hidrant',
    body: 'Ob intervenciji šteje vsaka sekunda. Aplikacija na enem zemljevidu združuje vse hidrante po vsej Sloveniji — nadzemne in podzemne — in ti ob vsakem prikaže premer priključka, pretok v litrih na minuto in tlak.',
    icon: (
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round">
        <circle cx="11" cy="11" r="7" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    )
  },
  {
    eyebrow: 'Trije načini',
    title: 'Naslov, klik na zemljevid ali moja lokacija',
    body: 'Povej, kje gori — na tri načine. Vpiši naslov požara, se dotakni točke na zemljevidu ali z enim gumbom uporabi svojo trenutno lokacijo.',
    icon: (
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
    )
  },
  {
    eyebrow: 'Ekipa',
    title: 'Navigacija po cestah in skupine za celotno društvo',
    body: 'Do izbranega hidranta ti aplikacija izriše pot po cestah in oceni čas vožnje. Vse deluje v okviru skupine tvojega gasilskega društva — s skupnimi vozili, premeri cevi in člani, ki jih lastnik odobri.',
    icon: (
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
        <path d="M14 9h4l4 4v4a1 1 0 0 1-1 1h-1" />
        <circle cx="7" cy="18" r="2" />
        <circle cx="17" cy="18" r="2" />
      </svg>
    )
  }
];

export default function OnboardingScreen() {
  const { finishOnboarding } = useAppState();
  const [slide, setSlide] = useState(0);
  const s = SLIDES[slide];

  function next() {
    if (slide < SLIDES.length - 1) setSlide(slide + 1);
    else finishOnboarding();
  }

  return (
    <div className="flex-1 flex flex-col bg-[#4A1212] text-white px-7 pt-12 pb-8">
      <div className="flex justify-between items-center">
        <span className="text-sm font-bold tracking-wide">ABELIUM</span>
        <button onClick={() => finishOnboarding()} className="text-white/60 text-sm cursor-pointer">
          Preskoči
        </button>
      </div>

      <div className="flex-1 flex flex-col justify-center py-5 min-h-0">
        <div className="w-[76px] h-[76px] rounded-[20px] bg-[#C62828] flex items-center justify-center mb-7">
          {s.icon}
        </div>
        <div className="text-[13px] font-semibold tracking-[0.16em] uppercase text-[#E57373] mb-3.5">
          {s.eyebrow}
        </div>
        <h1 className="text-[32px] leading-[1.15] font-bold tracking-tight mb-4">{s.title}</h1>
        <p className="text-[17px] leading-[1.5] text-white/72 font-light" style={{ color: 'rgba(255,255,255,.72)' }}>
          {s.body}
        </p>
      </div>

      <div className="flex gap-2 mb-6">
        {SLIDES.map((_, i) => (
          <span
            key={i}
            className="h-1.5 rounded-full transition-all duration-250"
            style={{ width: i === slide ? 24 : 6, background: i === slide ? '#C62828' : 'rgba(255,255,255,.25)' }}
          />
        ))}
      </div>

      <button
        onClick={next}
        className="w-full bg-[#C62828] text-white rounded-full py-4 font-semibold text-base cursor-pointer"
      >
        {slide < SLIDES.length - 1 ? 'Naprej' : 'Začni'}
      </button>
    </div>
  );
}
