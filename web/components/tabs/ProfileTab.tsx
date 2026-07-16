'use client';

import { useAppState } from '@/lib/app-state';

// The purchased paket's own type isn't exposed back to the client once
// consumed into a group — approximate it from the group's seat count instead.
function packageLabelFromSeats(seats: number | undefined) {
  if (seats == null) return '—';
  if (seats <= 1) return 'Mali';
  if (seats <= 50) return 'Srednji';
  return 'Veliki';
}

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

export default function ProfileTab() {
  const { user, group, signOut } = useAppState();
  if (!user) return null;

  return (
    <div className="flex-1 overflow-auto px-5 pt-13 pb-24 bg-[#F6F8FA]">
      <h1 className="text-2xl font-bold mb-5 text-[#4A1212]">Profil</h1>

      <div className="bg-white rounded-2xl p-5 flex items-center gap-3.5 mb-4 shadow-sm">
        <div className="w-14 h-14 rounded-full bg-[#4A1212] text-white flex items-center justify-center font-bold text-xl">
          {initials(user.uporabniskoIme)}
        </div>
        <div>
          <div className="text-[17px] font-bold text-[#4A1212]">{user.uporabniskoIme}</div>
          <div className="text-[13px] text-[#5C6770]">{user.email}</div>
        </div>
      </div>

      <div className="bg-white rounded-2xl overflow-hidden mb-5 shadow-sm">
        <div className="flex justify-between px-4.5 py-3.5 border-b border-[#ECEFF2]">
          <span className="text-[#5C6770] text-sm">Skupina</span>
          <span className="font-semibold text-sm text-[#4A1212]">{group?.ime ?? '—'}</span>
        </div>
        <div className="flex justify-between px-4.5 py-3.5 border-b border-[#ECEFF2]">
          <span className="text-[#5C6770] text-sm">Vloga</span>
          <span className="font-semibold text-sm text-[#4A1212]">{group?.vloga === 'admin' ? 'Admin' : 'Član'}</span>
        </div>
        <div className="flex justify-between px-4.5 py-3.5">
          <span className="text-[#5C6770] text-sm">Paket</span>
          <span className="font-semibold text-sm text-[#4A1212]">{packageLabelFromSeats(group?.stSedezev)}</span>
        </div>
      </div>

      <button
        onClick={signOut}
        className="w-full bg-white text-[#E4572E] border border-[#F0D0C7] rounded-full py-3.5 font-semibold text-[15px] cursor-pointer"
      >
        Odjava
      </button>
    </div>
  );
}
