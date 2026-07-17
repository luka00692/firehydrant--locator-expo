'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppState } from '@/lib/app-state';
import { api, ApiRequestError } from '@/lib/api';
import type { Hydrant, NearestHydrantResult } from '@/lib/types';
import type { FirePoint } from '@/components/HydrantMap';

const HydrantMap = dynamic(() => import('@/components/HydrantMap'), { ssr: false });

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
  // A very short road route (e.g. across the street) still realistically takes
  // a fire truck at least a minute to respond — never show less, matching
  // src/hydrantUtils.js's formatMinutes. Longer routes roll over into hours.
  const mins = Math.max(1, Math.round(s / 60));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

// Great-circle distance in metres — used to debounce live-tracking re-searches
// so we don't refetch the nearest hydrant on every tiny GPS jitter.
function metersBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Ignore accuracy re-searches closer together than this (metres).
const LIVE_RESEARCH_MIN_MOVE = 40;

function waterSourceLabel(source: string | undefined) {
  if (source === 'main' || source === 'piped') return 'Javno omrežje';
  if (source === 'groundwater') return 'Vrtina';
  if (!source) return 'ni podatka';
  return source;
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
  const [showLocPrompt, setShowLocPrompt] = useState(false);
  const [liveTracking, setLiveTracking] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const watchIdRef = useRef<number | null>(null);
  const lastSearchPtRef = useRef<{ lat: number; lng: number } | null>(null);

  // Load every hydrant once. They're drawn as individual canvas circle markers,
  // so the whole country's worth stays on the map at all zoom levels without lag
  // — no need to refetch as the viewport moves.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await api.allHydrants();
        if (!cancelled) setHydrants(rows);
      } catch {
        // leave the map empty; the nearest-hydrant search still works
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  async function searchNearest(point: FirePoint) {
    setSearching(true);
    setNearest(null);
    try {
      const result = await api.nearestHydrant({ lat: point.lat, lng: point.lng }, activeVehicle?.premerCevi);
      setNearest(result);
    } catch (err) {
      // No mapped hydrant nearby (OSM coverage varies) — say so instead of
      // leaving the fire pin silently unmatched.
      if (err instanceof ApiRequestError && err.status === 404) {
        setLocError(
          activeVehicle
            ? `V bližini ni hidranta s premerom ${Number(activeVehicle.premerCevi)} mm.`
            : 'V bližini ni bilo mogoče najti hidranta.'
        );
      }
    } finally {
      setSearching(false);
    }
  }

  // Clicking a specific hydrant on the map shows the route/distance/time from
  // wherever the fire pin already is *to that exact hydrant* — not a fresh
  // "nearest hydrant" search starting from the hydrant's own location, which
  // would just find itself or a different, closer one instead.
  async function selectHydrant(h: Hydrant) {
    if (!firePoint) {
      // No location set yet — show the hydrant's own info, no route to give.
      setNearest({ hydrant: h, route: null });
      return;
    }
    setSearching(true);
    setNearest(null);
    try {
      const result = await api.routeToHydrant({ lat: firePoint.lat, lng: firePoint.lng }, h.id, activeVehicle?.premerCevi);
      setNearest(result);
    } catch {
      setNearest({ hydrant: h, route: null });
    } finally {
      setSearching(false);
    }
  }

  function stopTracking() {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setLiveTracking(false);
  }

  function setFire(point: FirePoint & { kind?: 'me' | 'address' | 'map'; accuracy?: number }) {
    // A manual pin (address / map tap) ends live GPS tracking.
    stopTracking();
    lastSearchPtRef.current = null;
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

  // Start live tracking: watchPosition keeps the user's dot updating as they
  // move (not a one-shot fix), and re-runs the nearest-hydrant search after
  // meaningful movement. Kept separate from useMyLocation so the confirm pop-up
  // can trigger it after the user opts in.
  function startTracking() {
    setShowLocPrompt(false);
    setNotFound(false);
    setLocError(null);
    if (!navigator.geolocation) {
      setLocError('Ta brskalnik ne podpira določanja lokacije.');
      return;
    }
    if (watchIdRef.current != null) return; // already tracking
    setSearching(true);
    lastSearchPtRef.current = null;
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const accuracy = Math.min(pos.coords.accuracy || 60, 200);
        setLiveTracking(true);
        // Move the live dot on every fix…
        setFirePoint({ ...p, kind: 'me', accuracy });
        // …but only re-run the (network) nearest search after real movement.
        const last = lastSearchPtRef.current;
        if (!last || metersBetween(last, p) > LIVE_RESEARCH_MIN_MOVE) {
          lastSearchPtRef.current = p;
          searchNearest(p);
        }
      },
      (err) => {
        stopTracking();
        setSearching(false);
        if (err.code === err.PERMISSION_DENIED) {
          setLocError('Dostop do lokacije je zavrnjen. Omogoči ga v nastavitvah brskalnika in poskusi znova.');
        } else if (err.code === err.TIMEOUT) {
          setLocError('Določanje lokacije je trajalo predolgo. Poskusi znova.');
        } else {
          setLocError('Lokacije trenutno ni bilo mogoče določiti. Poskusi znova.');
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 }
    );
  }

  // Toggle live tracking. When starting: show a short explainer before the
  // browser's native permission prompt (like Google Maps), unless permission is
  // already granted (start straight away) or blocked (explain how to re-enable).
  async function useMyLocation() {
    setNotFound(false);
    setLocError(null);
    if (liveTracking || watchIdRef.current != null) {
      stopTracking();
      return;
    }
    if (!navigator.geolocation) {
      setLocError('Ta brskalnik ne podpira določanja lokacije.');
      return;
    }
    try {
      const status = await navigator.permissions?.query({ name: 'geolocation' as PermissionName });
      if (status?.state === 'granted') {
        startTracking();
        return;
      }
      if (status?.state === 'denied') {
        setLocError('Dostop do lokacije je zavrnjen. Omogoči ga v nastavitvah brskalnika in poskusi znova.');
        return;
      }
    } catch {
      // Permissions API unsupported (e.g. Safari) — fall through to the prompt.
    }
    setShowLocPrompt(true);
  }

  // Stop the geolocation watch when the map tab unmounts.
  useEffect(() => {
    return () => {
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, []);

  function openNav() {
    if (!nearest) return;
    // Route from the user's current fire point to the hydrant, like Google Maps
    // directions — falls back to destination-only if we don't have an origin.
    const origin = firePoint ? `&origin=${firePoint.lat},${firePoint.lng}` : '';
    window.open(
      `https://www.google.com/maps/dir/?api=1${origin}&destination=${nearest.hydrant.lat},${nearest.hydrant.lon}&travelmode=driving`,
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
          routeDashed={nearest?.route?.straightLine ?? false}
          onHydrantClick={selectHydrant}
          onMapClick={(pt) => setFire({ ...pt, kind: 'map' })}
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
              className="flex items-center gap-1.5 border-none rounded-full py-2 px-3.5 text-[13px] font-semibold cursor-pointer"
              style={{
                background: liveTracking ? '#C62828' : '#fff',
                color: liveTracking ? '#fff' : '#4A1212',
                boxShadow: '0 4px 14px rgba(0,48,64,.12)'
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={liveTracking ? '#fff' : '#C62828'} strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
              </svg>
              {liveTracking ? 'Sledim ti' : 'Moja lokacija'}
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
          {filtered.length} hidrantov
        </div>

        {sel && (
          <div
            className="absolute left-0 right-0 z-[850] bg-white rounded-t-[22px] px-5 pt-4.5 pb-5"
            style={{ bottom: 0, boxShadow: '0 -12px 40px rgba(0,48,64,.2)' }}
          >
            <div className="w-[38px] h-1 rounded-full bg-[#D9DEE3] mx-auto mb-4" />
            <div className="flex items-start gap-3 mb-4">
              <div className="w-11 h-11 rounded-xl bg-[#FCE7E7] flex items-center justify-center flex-shrink-0">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={selType === 'nadzemni' ? '#C62828' : '#F57C00'} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5S12.5 5 12 3c-.5 2-2 4-4 6.5S5 13 5 15a7 7 0 0 0 7 7z" />
                </svg>
              </div>
              <div className="flex-1">
                <div className="text-lg font-bold text-[#4A1212]">{selType === 'nadzemni' ? 'Nadzemni hidrant' : 'Podzemni hidrant'}</div>
                <div className="text-[13px] text-[#5C6770]">Najbližji hidrant</div>
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
                  {sel.properties['fire_hydrant:diameter']
                    ? `${sel.properties['fire_hydrant:diameter']} mm`
                    : sel.properties['couplings:diameters']
                      ? sel.properties['couplings:diameters'].split(/;\s*/).join(', ')
                      : 'ni podatka'}
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
                  {sel.properties['fire_hydrant:pressure'] ? `${sel.properties['fire_hydrant:pressure']} bar` : 'ni podatka'}
                </div>
              </div>
              <div className="bg-[#F6F8FA] rounded-[10px] p-2.5">
                <div className="text-[11px] text-[#8A949E] uppercase tracking-wide">Vir vode</div>
                <div className="text-base font-bold text-[#4A1212]">{waterSourceLabel(sel.properties['water_source'])}</div>
              </div>
              <div className="bg-[#F6F8FA] rounded-[10px] p-2.5">
                <div className="text-[11px] text-[#8A949E] uppercase tracking-wide">Priključki</div>
                <div className="text-base font-bold text-[#4A1212]">{sel.properties['couplings'] ?? 'ni podatka'}</div>
              </div>
            </div>

            {nearest?.route && (
              <div className="flex gap-3.5 bg-[#FCE7E7] rounded-[10px] px-3.5 py-3 mb-4">
                <div>
                  <div className="text-[11px] text-[#E57373] uppercase tracking-wide">
                    {nearest.route.straightLine ? 'Zračna razdalja (približno)' : 'Po cestah'}
                  </div>
                  <div className="text-base font-bold text-[#8E1616]">
                    {nearest.route.straightLine ? '≈ ' : ''}
                    {formatDistance(nearest.route.distance)}
                  </div>
                </div>
                {nearest.route.duration != null && (
                  <div>
                    <div className="text-[11px] text-[#E57373] uppercase tracking-wide">Čas vožnje</div>
                    <div className="text-base font-bold text-[#8E1616]">{formatDuration(nearest.route.duration)}</div>
                  </div>
                )}
              </div>
            )}

            {nearest?.route?.steps && nearest.route.steps.length > 0 && (
              <div className="mb-4">
                <button
                  onClick={() => setShowSteps((v) => !v)}
                  className="flex items-center justify-between w-full text-[13px] font-semibold text-[#4A1212] bg-[#F6F8FA] rounded-[10px] px-3.5 py-2.5 border-none cursor-pointer"
                >
                  <span>Navodila po korakih ({nearest.route.steps.length})</span>
                  <span className="text-[#8A949E]">{showSteps ? '▲' : '▼'}</span>
                </button>
                {showSteps && (
                  <ol className="mt-2 max-h-[140px] overflow-y-auto">
                    {nearest.route.steps.map((step, i) => (
                      <li key={i} className="flex gap-2.5 py-1.5 border-b border-[#ECEFF2] last:border-b-0">
                        <span className="text-[12px] font-bold text-[#C62828] w-4 flex-shrink-0">{i + 1}.</span>
                        <span className="flex-1 text-[13px] text-[#4A1212] leading-[1.4]">{step.text}</span>
                        <span className="text-[12px] text-[#8A949E] flex-shrink-0">{formatDistance(step.distance)}</span>
                      </li>
                    ))}
                  </ol>
                )}
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

        {showLocPrompt && (
          <div
            className="absolute inset-0 z-[900] flex items-end justify-center"
            style={{ background: 'rgba(0,48,64,.35)' }}
            onClick={() => setShowLocPrompt(false)}
          >
            <div
              className="w-full max-w-[420px] bg-white rounded-t-[22px] px-5 pt-5 pb-6"
              style={{ boxShadow: '0 -12px 40px rgba(0,48,64,.25)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-[38px] h-1 rounded-full bg-[#D9DEE3] mx-auto mb-4" />
              <div className="flex items-center gap-3 mb-3">
                <div className="w-11 h-11 rounded-xl bg-[#FCE7E7] flex items-center justify-center flex-shrink-0">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#C62828" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="10" r="3" />
                    <path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z" />
                  </svg>
                </div>
                <div className="text-lg font-bold text-[#4A1212]">Deli svojo lokacijo</div>
              </div>
              <p className="text-[13px] leading-[1.5] text-[#5C6770] mb-5">
                Za prikaz najbližjega hidranta in poti do njega potrebujemo dostop do tvoje lokacije. Brskalnik te bo
                vprašal za dovoljenje.
              </p>
              <div className="flex gap-2.5">
                <button
                  onClick={() => setShowLocPrompt(false)}
                  className="flex-1 bg-white text-[#4A1212] border border-[#D9DEE3] rounded-full py-3.5 font-semibold text-[15px] cursor-pointer"
                >
                  Prekliči
                </button>
                <button
                  onClick={startTracking}
                  className="flex-1 bg-[#C62828] text-white border-none rounded-full py-3.5 font-semibold text-[15px] cursor-pointer"
                >
                  Deli lokacijo
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
