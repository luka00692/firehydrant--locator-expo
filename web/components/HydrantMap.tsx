'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import type { Hydrant } from '@/lib/types';

export interface FirePoint {
  lat: number;
  lng: number;
}

function hydrantType(h: Hydrant): 'nadzemni' | 'podzemni' {
  const t = h.properties['fire_hydrant:type'];
  return t === 'underground' || h.properties['fire_hydrant:position'] === 'underground' ? 'podzemni' : 'nadzemni';
}

// divIcons parse an SVG string into DOM each time they're built, so cache one
// instance per (color,size) and reuse it across every marker that needs it.
const iconCache = new Map<string, L.DivIcon>();
function hydrantIcon(color: string, size: number) {
  const key = `${color}:${size}`;
  const cached = iconCache.get(key);
  if (cached) return cached;
  const icon = L.divIcon({
    className: 'hpin',
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    html: `<svg width="${size}" height="${size * 1.25}" viewBox="0 0 24 30"><path d="M12 0C6 0 1.5 4.5 1.5 10.5 1.5 18 12 30 12 30S22.5 18 22.5 10.5C22.5 4.5 18 0 12 0z" fill="${color}"/><circle cx="12" cy="10.5" r="4" fill="#fff"/></svg>`
  });
  iconCache.set(key, icon);
  return icon;
}

function iconFor(h: Hydrant, selected: boolean) {
  const color = selected ? '#4A1212' : hydrantType(h) === 'nadzemni' ? '#C62828' : '#E57373';
  return hydrantIcon(color, selected ? 26 : 18);
}

function fireIcon() {
  return L.divIcon({
    className: 'hpin',
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    html: `<svg width="30" height="37" viewBox="0 0 24 30"><path d="M12 0C6 0 1.5 4.5 1.5 10.5 1.5 18 12 30 12 30S22.5 18 22.5 10.5C22.5 4.5 18 0 12 0z" fill="#E4572E"/><path d="M12 5c-.5 2-2 3-3 4.5S7.5 12 7.5 13.5A4.5 4.5 0 0 0 16.5 13.5c0-1.3-.7-2.5-2-4-1-1.2-2-2.5-2.5-4.5z" fill="#fff"/></svg>`
  });
}

function meIcon() {
  return L.divIcon({
    className: 'me-dot',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    html: `<div class="ring"></div><div style="position:absolute;inset:0;border-radius:50%;background:#C62828;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,48,64,.4);"></div>`
  });
}

interface Props {
  hydrants: Hydrant[];
  selectedHydrantId: number | null;
  firePoint: (FirePoint & { kind?: 'me' | 'address' | 'map'; accuracy?: number }) | null;
  routeCoordinates: [number, number][] | null;
  onHydrantClick: (h: Hydrant) => void;
  onMapClick: (pt: FirePoint) => void;
}

export default function HydrantMap({
  hydrants,
  selectedHydrantId,
  firePoint,
  routeCoordinates,
  onHydrantClick,
  onMapClick
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  // Every hydrant is drawn at all times; nearby ones collapse into cluster
  // bubbles when zoomed out and expand as you zoom in, so tens of thousands of
  // points stay smooth. The cluster group only holds hydrants.
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);
  // The fire pin / route / accuracy circle live in a separate overlay so
  // refreshing hydrants never disturbs them.
  const overlayLayerRef = useRef<L.LayerGroup | null>(null);
  const fireMarkerRef = useRef<L.Marker | null>(null);
  const accuracyCircleRef = useRef<L.Circle | null>(null);
  const routeLineRef = useRef<L.Polyline | null>(null);

  // hydrant markers kept keyed by id so we can diff (add/remove only the delta)
  // instead of rebuilding the whole set when the filter changes.
  const markersRef = useRef<Map<number, L.Marker>>(new Map());
  const hydrantByIdRef = useRef<Map<number, Hydrant>>(new Map());
  const selectedIdRef = useRef<number | null>(selectedHydrantId);

  // callbacks captured in refs so the map-init effect doesn't need to re-run
  const onHydrantClickRef = useRef(onHydrantClick);
  const onMapClickRef = useRef(onMapClick);
  useEffect(() => {
    onHydrantClickRef.current = onHydrantClick;
    onMapClickRef.current = onMapClick;
  }, [onHydrantClick, onMapClick]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let cancelled = false;
    const markers = markersRef.current;
    const hydrantById = hydrantByIdRef.current;
    const map = L.map(containerRef.current, { zoomControl: false, attributionControl: false }).setView(
      [46.15, 14.99],
      8
    );
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    clusterRef.current = L.markerClusterGroup({
      chunkedLoading: true,
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: false,
      maxClusterRadius: 60,
      disableClusteringAtZoom: 18
    }).addTo(map);
    overlayLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    map.on('click', (e) => onMapClickRef.current({ lat: e.latlng.lat, lng: e.latlng.lng }));
    const timer = setTimeout(() => {
      // React StrictMode's dev-only mount→unmount→remount can fire this after
      // cleanup already tore the map down — guard against acting on a dead map.
      if (cancelled) return;
      map.invalidateSize();
    }, 150);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      map.remove();
      mapRef.current = null;
      clusterRef.current = null;
      markers.clear();
      hydrantById.clear();
    };
  }, []);

  // hydrant markers — diff against what's already drawn, adding/removing in bulk
  useEffect(() => {
    const cluster = clusterRef.current;
    if (!cluster) return;
    const markers = markersRef.current;
    const byId = hydrantByIdRef.current;

    const nextIds = new Set<number>();
    for (const h of hydrants) nextIds.add(h.id);

    const toRemove: L.Marker[] = [];
    for (const [id, marker] of markers) {
      if (!nextIds.has(id)) {
        toRemove.push(marker);
        markers.delete(id);
        byId.delete(id);
      }
    }

    const toAdd: L.Marker[] = [];
    for (const h of hydrants) {
      byId.set(h.id, h);
      if (markers.has(h.id)) continue;
      const marker = L.marker([h.lat, h.lon], { icon: iconFor(h, h.id === selectedIdRef.current) });
      marker.on('click', () => onHydrantClickRef.current(hydrantByIdRef.current.get(h.id) ?? h));
      markers.set(h.id, marker);
      toAdd.push(marker);
    }

    if (toRemove.length) cluster.removeLayers(toRemove);
    if (toAdd.length) cluster.addLayers(toAdd);
  }, [hydrants]);

  // selection highlight — recolor only the two affected markers
  useEffect(() => {
    const markers = markersRef.current;
    const byId = hydrantByIdRef.current;
    const prev = selectedIdRef.current;
    selectedIdRef.current = selectedHydrantId;

    if (prev != null && prev !== selectedHydrantId) {
      const m = markers.get(prev);
      const h = byId.get(prev);
      if (m && h) m.setIcon(iconFor(h, false));
    }
    if (selectedHydrantId != null) {
      const m = markers.get(selectedHydrantId);
      const h = byId.get(selectedHydrantId);
      if (m && h) m.setIcon(iconFor(h, true));
    }
  }, [selectedHydrantId]);

  // fire / me marker
  useEffect(() => {
    const map = mapRef.current;
    const layer = overlayLayerRef.current;
    if (!map || !layer) return;

    if (fireMarkerRef.current) {
      layer.removeLayer(fireMarkerRef.current);
      fireMarkerRef.current = null;
    }
    if (accuracyCircleRef.current) {
      layer.removeLayer(accuracyCircleRef.current);
      accuracyCircleRef.current = null;
    }
    if (!firePoint) return;

    const icon = firePoint.kind === 'me' ? meIcon() : fireIcon();
    const marker = L.marker([firePoint.lat, firePoint.lng], { icon, zIndexOffset: 1000 }).addTo(layer);
    fireMarkerRef.current = marker;

    if (firePoint.kind === 'me' && firePoint.accuracy) {
      const circle = L.circle([firePoint.lat, firePoint.lng], {
        radius: firePoint.accuracy,
        color: '#C62828',
        weight: 1,
        fillColor: '#C62828',
        fillOpacity: 0.08
      }).addTo(layer);
      accuracyCircleRef.current = circle;
    }

    map.flyTo([firePoint.lat, firePoint.lng], 14, { duration: 0.8 });
  }, [firePoint]);

  // route polyline
  useEffect(() => {
    const map = mapRef.current;
    const layer = overlayLayerRef.current;
    if (!map || !layer) return;

    if (routeLineRef.current) {
      layer.removeLayer(routeLineRef.current);
      routeLineRef.current = null;
    }
    if (!routeCoordinates || routeCoordinates.length < 2) return;

    const line = L.polyline(routeCoordinates, { color: '#C62828', weight: 5, opacity: 0.85 }).addTo(layer);
    routeLineRef.current = line;
    map.fitBounds(line.getBounds(), { padding: [60, 60] });
  }, [routeCoordinates]);

  return <div ref={containerRef} className="absolute inset-0 bg-[#dce6ea]" />;
}
