'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Hydrant } from '@/lib/types';

export interface FirePoint {
  lat: number;
  lng: number;
}

function hydrantType(h: Hydrant): 'nadzemni' | 'podzemni' {
  const t = h.properties['fire_hydrant:type'];
  return t === 'underground' || h.properties['fire_hydrant:position'] === 'underground' ? 'podzemni' : 'nadzemni';
}

function hydrantIcon(color: string, size: number) {
  return L.divIcon({
    className: 'hpin',
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    html: `<svg width="${size}" height="${size * 1.25}" viewBox="0 0 24 30"><path d="M12 0C6 0 1.5 4.5 1.5 10.5 1.5 18 12 30 12 30S22.5 18 22.5 10.5C22.5 4.5 18 0 12 0z" fill="${color}"/><circle cx="12" cy="10.5" r="4" fill="#fff"/></svg>`
  });
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
  onBoundsChange: (bounds: { minLat: number; minLon: number; maxLat: number; maxLon: number }) => void;
}

export default function HydrantMap({
  hydrants,
  selectedHydrantId,
  firePoint,
  routeCoordinates,
  onHydrantClick,
  onMapClick,
  onBoundsChange
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const hydrantLayerRef = useRef<L.LayerGroup | null>(null);
  const fireMarkerRef = useRef<L.Marker | null>(null);
  const accuracyCircleRef = useRef<L.Circle | null>(null);
  const routeLineRef = useRef<L.Polyline | null>(null);

  // callbacks captured in refs so the map-init effect doesn't need to re-run
  const onHydrantClickRef = useRef(onHydrantClick);
  const onMapClickRef = useRef(onMapClick);
  const onBoundsChangeRef = useRef(onBoundsChange);
  useEffect(() => {
    onHydrantClickRef.current = onHydrantClick;
    onMapClickRef.current = onMapClick;
    onBoundsChangeRef.current = onBoundsChange;
  }, [onHydrantClick, onMapClick, onBoundsChange]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let cancelled = false;
    const map = L.map(containerRef.current, { zoomControl: false, attributionControl: false }).setView(
      [46.15, 14.99],
      8
    );
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    hydrantLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    map.on('click', (e) => onMapClickRef.current({ lat: e.latlng.lat, lng: e.latlng.lng }));
    const emitBounds = () => {
      const b = map.getBounds();
      onBoundsChangeRef.current({ minLat: b.getSouth(), minLon: b.getWest(), maxLat: b.getNorth(), maxLon: b.getEast() });
    };
    map.on('moveend', emitBounds);
    const timer = setTimeout(() => {
      // React StrictMode's dev-only mount→unmount→remount can fire this after
      // cleanup already tore the map down — guard against acting on a dead map.
      if (cancelled) return;
      map.invalidateSize();
      emitBounds();
    }, 150);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // hydrant markers
  useEffect(() => {
    const layer = hydrantLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    hydrants.forEach((h) => {
      const isSelected = h.id === selectedHydrantId;
      const color = isSelected ? '#4A1212' : hydrantType(h) === 'nadzemni' ? '#C62828' : '#E57373';
      const marker = L.marker([h.lat, h.lon], { icon: hydrantIcon(color, isSelected ? 26 : 18) });
      marker.on('click', () => onHydrantClickRef.current(h));
      marker.addTo(layer);
    });
  }, [hydrants, selectedHydrantId]);

  // fire / me marker
  useEffect(() => {
    const map = mapRef.current;
    const layer = hydrantLayerRef.current;
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
    const layer = hydrantLayerRef.current;
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
