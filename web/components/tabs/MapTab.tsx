'use client';

import dynamic from 'next/dynamic';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useAppState } from '@/lib/app-state';
import { api, ApiRequestError } from '@/lib/api';
import type { Hydrant, NearestHydrantResult } from '@/lib/types';
import type { FirePoint } from '@/components/HydrantMap';

const HydrantMap = dynamic(() => import('@/components/HydrantMap'), { ssr: false });

// Below this zoom the viewport can span most of the country, whose hydrant count
// is far too large to render as individual markers. Kept in sync with the value
// documented in HydrantMap. Defined here (not imported) so this server-rendered
// module never pulls in Leaflet, which references `window` at import time.
const MIN_HYDRANT_ZOOM = 12;

type HydrantTypeFilter = 'vsi' | 'nadzemni' | 'podzemni';
type PremerFilter = 'vsi' | 80 | 100 | 150;

function hydrantType(h: Hydrant): 'nadzemni' | 'podzemni' {
  const t = h.properties['fire_hydrant:type'];
  return t === 'underground' || h.properties['fire_hydrant:position'] === 'underground' ? 'podzemni' : 'nadzemni';
}

function formatDistance(m: number | undefined | null) {
  if (m == null) return '—';
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

function formatDuration(s: number | undefined | null) {
  if (s == null) return '—';
  return s < 60 ? '<1 min' : `${Math.round(s / 60)} min`;
}

export default function MapTab() {
  const { vehicles, activeVehicleId } = useAppState();
  const activeVehicle = vehicles.find((v) => v.id === activeVehicleId);

  const [hydrants, setHydrants] = useState<Hydrant[]>([]);
  const [addrInput, setAddrInput] = useState('');
  const [searching, setSearching] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [fType, setFType] = useState<HydrantTypeFilter>('vsi');
  const [fPremer, setFPremer] = useState<PremerFilter>('vsi');
  const [firePoint, setFirePoint] = useState<(FirePoint & { kind?: 'me' | 'address' | 'map'; accuracy?: number }) | null>(
    null
  );
  const [nearest, setNearest] = useState<NearestHydrantResult | null>(null);
  const [zoomedOut, setZoomedOut] = useState(false);
  const boundsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Memoized so the array reference is stable across unrelated re-renders (e.g.
  // typing in the address box). A fresh reference on every render would make
  // HydrantMap re-run its marker effect and rebuild every marker per keystroke.
  const filtered = useMemo(
    () =>
      hydrants.filter((h) => {
        if (fType !== 'vsi' && hydrantType(h) !== fType) return false;
        if (fPremer !== 'vsi' && Number(h.properties['fire_hydrant:diameter']) !== fPremer) return false;
        return true;
      }),
    [hydrants, fType, fPremer]
  );

  const onBoundsChange = useCallback(
    (bounds: { minLat: number; minLon: number; maxLat: number; maxLon: number; zoom: number }) => {
      if (boundsTimer.current) clearTimeout(boundsTimer.current);
      // Don't pull the whole country's hydrants when zoomed out — it returns
      // tens of thousands of points and freezes the map.
      if (bounds.zoom < MIN_HYDRANT_ZOOM) {
        setZoomedOut(true);
        setHydrants((prev) => (prev.length ? [] : prev));
        return;
      }
      setZoomedOut(false);
      boundsTimer.current = setTimeout(async () => {
        try {
          const rows = await api.hydrantsInBounds({
            minLat: bounds.minLat,
            minLon: bounds.minLon,
            maxLat: bounds.maxLat,
            maxLon: bounds.maxLon
          });
          setHydrants(rows);
        } catch {
          // keep showing whatever we already loaded
        }
      }, 300);
    },
    []
  );

  async function searchNearest(point: FirePoint) {
    setSearching(true);
    setNearest(null);
    try {
      const result = await api.nearestHydrant({ lat: point.lat, lng: point.lng }, activeVehicle?.premerCevi);
      setNearest(result);
    } catch {
      // no candidates in view / OSRM unreachable — leave the fire pin without a match
    } finally {
      setSearching(false);
    }
  }

  function setFire(point: FirePoint & { kind?: 'me' | 'address' | 'map'; accuracy?: number }) {
    setFirePoint(point);
    setNotFound(false);
    setLocError(null);
    searchNearest(point);
  }

  async function runGeocode() {
    const q = addrInput.trim();
    if (!q) return;
    setSearching(true);
    setNotFound(false);
    setLocError(null);
    setNearest(null);
    try {
      const result = await api.nearestHydrant({ address: q }, activeVehicle?.premerCevi);
      if (result.point) {
        setFirePoint({ lat: result.point.lat, lng: result.point.lon, kind: 'address' });
      }
      setNearest(result);
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 404) setNotFound(true);
    } finally {
      setSearching(false);
    }
  }

  function useMyLocation() {
    setNotFound(false);
    setLocError(null);
    if (!navigator.geolocation) {
      setLocError('Ta brskalnik ne podpira določanja lokacije.');
      return;
    }
    setSearching(true);
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setFire({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          kind: 'me',
          accuracy: Math.min(pos.coords.accuracy || 60, 200)
        }),
      () => {
        setSearching(false);
        setLocError('Lokacije ni bilo mogoče pridobiti. Preveri dovoljenja za lokacijo v brskalniku.');
      },
      { timeout: 6000, enableHighAccuracy: true }
    );
  }

  function openNav() {
    if (!nearest) return;
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${nearest.hydrant.lat},${nearest.hydrant.lon}&travelmode=driving`,
      '_blank'
    );
  }

  const filterActive = fType !== 'vsi' || fPremer !== 'vsi';
  const sel = nearest?.hydrant ?? null;
  const selType = sel ? hydrantType(sel) : null;

  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="relative flex-1">
        <HydrantMap
          hydrants={filtered}
          selectedHydrantId={sel?.id ?? null}
          firePoint={firePoint}
          routeCoordinates={nearest?.route?.coordinates ?? null}
          onHydrantClick={(h) => searchNearest({ lat: h.lat, lng: h.lon })}
          onMapClick={(pt) => setFire({ ...pt, kind: 'map' })}
          onBoundsChange={onBoundsChange}
        />

        <div className="absolute top-13 left-3 right-3 z-[600]">
          <div className="flex items-center gap-2.5 bg-white rounded-xl px-3.5 py-2.5" style={{ boxShadow: '0 8px 24px rgba(0,48,64,.14)' }}>
            <input
              value={addrInput}
              onChange={(e) => setAddrInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runGeocode()}
              placeholder="Vpiši kateri koli naslov v Sloveniji…"
              className="flex-1 border-none outline-none text-[15px] bg-transparent text-[#4A1212]"
            />
            {searching && (
              <div
                className="w-4 h-4 rounded-full"
                style={{ border: '2px solid #F0C4C4', borderTopColor: '#C62828', animation: 'ab-spin .8s linear infinite' }}
              />
            )}
            <button onClick={runGeocode} className="w-[34px] h-[34px] flex items-center justify-center border-none rounded-lg bg-[#C62828] cursor-pointer">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round">
                <circle cx="11" cy="11" r="7" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>
          </div>

          {notFound && (
            <div className="mt-1.5 bg-white rounded-lg px-3.5 py-2.5 text-[13px] text-[#8E1616]" style={{ boxShadow: '0 8px 24px rgba(0,48,64,.14)' }}>
              Naslova ni bilo mogoče najti. Poskusi z ulico in krajem (npr. »Glavni trg 1, Kranj«).
            </div>
          )}

          {locError && (
            <div className="mt-1.5 bg-white rounded-lg px-3.5 py-2.5 text-[13px] text-[#8E1616]" style={{ boxShadow: '0 8px 24px rgba(0,48,64,.14)' }}>
              {locError}
            </div>
          )}

          <div className="flex gap-2 mt-2.5">
            <button
              onClick={useMyLocation}
              className="flex items-center gap-1.5 bg-white border-none rounded-full py-2 px-3.5 text-[13px] font-semibold text-[#4A1212] cursor-pointer"
              style={{ boxShadow: '0 4px 14px rgba(0,48,64,.12)' }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#C62828" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
              </svg>
              Moja lokacija
            </button>
            <button
              onClick={() => setShowFilters((v) => !v)}
              className="flex items-center gap-1.5 border-none rounded-full py-2 px-3.5 text-[13px] font-semibold cursor-pointer"
              style={{
                background: filterActive || showFilters ? '#C62828' : '#fff',
                color: filterActive || showFilters ? '#fff' : '#4A1212',
                boxShadow: '0 4px 14px rgba(0,48,64,.12)'
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
              Kategorije
            </button>
            {activeVehicle && (
              <span className="flex items-center bg-white rounded-full py-2 px-3.5 text-[13px] font-semibold text-[#5C6770]" style={{ boxShadow: '0 4px 14px rgba(0,48,64,.12)' }}>
                {activeVehicle.ime} · {Number(activeVehicle.premerCevi)} mm
              </span>
            )}
          </div>

          {showFilters && (
            <div className="mt-2.5 bg-white rounded-xl p-3.5" style={{ boxShadow: '0 8px 24px rgba(0,48,64,.14)' }}>
              <div className="text-[11px] font-bold uppercase tracking-wide text-[#8A949E] mb-2">Vrsta hidranta</div>
              <div className="flex gap-2 mb-3.5">
                {(['vsi', 'nadzemni', 'podzemni'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setFType(t)}
                    className="flex-1 py-2 rounded-full text-[13px] font-semibold cursor-pointer border"
                    style={{
                      background: fType === t ? '#C62828' : '#fff',
                      color: fType === t ? '#fff' : '#5C6770',
                      borderColor: fType === t ? '#C62828' : '#D9DEE3'
                    }}
                  >
                    {t === 'vsi' ? 'Vsi' : t === 'nadzemni' ? 'Nadzemni' : 'Podzemni'}
                  </button>
                ))}
              </div>
              <div className="text-[11px] font-bold uppercase tracking-wide text-[#8A949E] mb-2">Premer priključka</div>
              <div className="flex gap-2">
                {(['vsi', 80, 100, 150] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setFPremer(p)}
                    className="flex-1 py-2 rounded-full text-[13px] font-semibold cursor-pointer border"
                    style={{
                      background: fPremer === p ? '#C62828' : '#fff',
                      color: fPremer === p ? '#fff' : '#5C6770',
                      borderColor: fPremer === p ? '#C62828' : '#D9DEE3'
                    }}
                  >
                    {p === 'vsi' ? 'Vsi' : p}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="absolute bottom-2 left-3 z-[500] bg-white/85 rounded-md px-2.5 py-1 text-[11px] text-[#5C6770]">
          {zoomedOut ? 'Povečaj zemljevid za prikaz hidrantov' : `${filtered.length} hidrantov v tem pogledu`}
        </div>

        {sel && (
          <div
            className="absolute left-0 right-0 z-[850] bg-white rounded-t-[22px] px-5 pt-4.5 pb-5"
            style={{ bottom: 0, boxShadow: '0 -12px 40px rgba(0,48,64,.2)' }}
          >
            <div className="w-[38px] h-1 rounded-full bg-[#D9DEE3] mx-auto mb-4" />
            <div className="flex items-start gap-3 mb-4">
              <div className="w-11 h-11 rounded-xl bg-[#FCE7E7] flex items-center justify-center flex-shrink-0">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={selType === 'nadzemni' ? '#C62828' : '#E57373'} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5S12.5 5 12 3c-.5 2-2 4-4 6.5S5 13 5 15a7 7 0 0 0 7 7z" />
                </svg>
              </div>
              <div className="flex-1">
                <div className="text-lg font-bold text-[#4A1212]">{selType === 'nadzemni' ? 'Nadzemni hidrant' : 'Podzemni hidrant'}</div>
                <div className="text-[13px] text-[#5C6770]">Hidrant · OSRM</div>
              </div>
              <button onClick={() => setNearest(null)} className="bg-transparent border-none text-[#8A949E] text-2xl leading-none cursor-pointer">
                ×
              </button>
            </div>

            <p className="text-[13px] leading-[1.5] text-[#5C6770] mb-4">
              {selType === 'nadzemni'
                ? 'Nadzemni hidrant — stebriček nad tlemi, dobro viden in hiter za priklop cevi.'
                : 'Podzemni hidrant — v jašku pod pokrovom v tlaku, za priklop potrebuješ podzemni nastavek.'}
            </p>

            <div className="grid grid-cols-3 gap-2.5 mb-4">
              <div className="bg-[#F6F8FA] rounded-[10px] p-2.5">
                <div className="text-[11px] text-[#8A949E] uppercase tracking-wide">Premer</div>
                <div className="text-base font-bold text-[#4A1212]">
                  {sel.properties['fire_hydrant:diameter'] ? `${sel.properties['fire_hydrant:diameter']} mm` : 'ni podatka'}
                </div>
              </div>
              <div className="bg-[#F6F8FA] rounded-[10px] p-2.5">
                <div className="text-[11px] text-[#8A949E] uppercase tracking-wide">Pretok</div>
                <div className="text-base font-bold text-[#4A1212]">
                  {sel.properties['flow_rate'] ? `${sel.properties['flow_rate']} l/min` : 'ni podatka'}
                </div>
              </div>
              <div className="bg-[#F6F8FA] rounded-[10px] p-2.5">
                <div className="text-[11px] text-[#8A949E] uppercase tracking-wide">Tlak</div>
                <div className="text-base font-bold text-[#4A1212]">
                  {sel.properties['pressure'] ? `${sel.properties['pressure']} bar` : 'ni podatka'}
                </div>
              </div>
            </div>

            {nearest?.route && (
              <div className="flex gap-3.5 bg-[#FCE7E7] rounded-[10px] px-3.5 py-3 mb-4">
                <div>
                  <div className="text-[11px] text-[#E57373] uppercase tracking-wide">Po cestah</div>
                  <div className="text-base font-bold text-[#8E1616]">{formatDistance(nearest.route.distance)}</div>
                </div>
                <div>
                  <div className="text-[11px] text-[#E57373] uppercase tracking-wide">Čas vožnje</div>
                  <div className="text-base font-bold text-[#8E1616]">{formatDuration(nearest.route.duration)}</div>
                </div>
              </div>
            )}

            <div className="flex gap-2.5">
              <button
                onClick={() => firePoint && searchNearest(firePoint)}
                className="flex-1 bg-[#C62828] text-white border-none rounded-full py-3.5 font-semibold text-[15px] cursor-pointer"
              >
                Pokaži pot
              </button>
              <button onClick={openNav} className="flex-1 bg-white text-[#4A1212] border border-[#D9DEE3] rounded-full py-3.5 font-semibold text-[15px] cursor-pointer">
                Odpri navigacijo
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
