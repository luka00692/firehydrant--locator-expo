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

const TYPE_COLOR: Record<'nadzemni' | 'podzemni', string> = {
  nadzemni: '#C62828',
  podzemni: '#F57C00'
};
const SELECTED_COLOR = '#4A1212';

// Every hydrant is a canvas circle marker (not a DOM/SVG pin). All of them draw
// on one shared canvas in a single paint pass, so tens of thousands of
// individual marks stay smooth to pan and zoom.
function circleStyle(h: Hydrant, selected: boolean): L.CircleMarkerOptions {
  return {
    radius: selected ? 8 : 5,
    color: '#fff',
    weight: selected ? 2 : 1.2,
    fillColor: selected ? SELECTED_COLOR : TYPE_COLOR[hydrantType(h)],
    fillOpacity: 1
  };
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

type HydrantCircle = L.CircleMarker & { __hid?: number };

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
  // shared canvas renderer + a feature group holding every hydrant circle
  const rendererRef = useRef<L.Canvas | null>(null);
  const hydrantGroupRef = useRef<L.FeatureGroup | null>(null);
  // The fire pin / route / accuracy circle live in a separate overlay so
  // refreshing hydrants never disturbs them.
  const overlayLayerRef = useRef<L.LayerGroup | null>(null);
  const fireMarkerRef = useRef<L.Marker | null>(null);
  const accuracyCircleRef = useRef<L.Circle | null>(null);
  const routeLineRef = useRef<L.Polyline | null>(null);

  // hydrant markers kept keyed by id so we can diff (add/remove only the delta)
  // instead of rebuilding the whole set when the filter changes.
  const markersRef = useRef<Map<number, HydrantCircle>>(new Map());
  const hydrantByIdRef = useRef<Map<number, Hydrant>>(new Map());
  const selectedIdRef = useRef<number | null>(selectedHydrantId);
  // A hydrant click and a map click derive from the same DOM event; remember it
  // so the map handler can skip firing onMapClick when a hydrant was clicked.
  const handledClickRef = useRef<Event | null>(null);

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
    const renderer = L.canvas({ padding: 0.5 });
    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: false,
      preferCanvas: true,
      renderer
    }).setView([46.15, 14.99], 8);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    rendererRef.current = renderer;

    const hydrantGroup = L.featureGroup().addTo(map);
    // One delegated click handler for all circles (no per-marker listener).
    hydrantGroup.on('click', (e: L.LeafletMouseEvent) => {
      handledClickRef.current = e.originalEvent;
      const layer = ((e as L.LeafletEvent).propagatedFrom ?? e.sourceTarget) as HydrantCircle | undefined;
      const id = layer?.__hid;
      if (id == null) return;
      const h = hydrantByIdRef.current.get(id);
      if (h) onHydrantClickRef.current(h);
    });
    hydrantGroupRef.current = hydrantGroup;
    overlayLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    map.on('click', (e: L.LeafletMouseEvent) => {
      // Skip if this same DOM click was already consumed by a hydrant circle.
      if (e.originalEvent === handledClickRef.current) return;
      onMapClickRef.current({ lat: e.latlng.lat, lng: e.latlng.lng });
    });

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
      rendererRef.current = null;
      hydrantGroupRef.current = null;
      markers.clear();
      hydrantById.clear();
    };
  }, []);

  // hydrant circles — diff against what's already drawn, adding/removing the delta
  useEffect(() => {
    const group = hydrantGroupRef.current;
    const renderer = rendererRef.current;
    if (!group || !renderer) return;
    const markers = markersRef.current;
    const byId = hydrantByIdRef.current;

    const nextIds = new Set<number>();
    for (const h of hydrants) nextIds.add(h.id);

    for (const [id, marker] of markers) {
      if (!nextIds.has(id)) {
        group.removeLayer(marker);
        markers.delete(id);
        byId.delete(id);
      }
    }

    for (const h of hydrants) {
      byId.set(h.id, h);
      if (markers.has(h.id)) continue;
      const marker = L.circleMarker([h.lat, h.lon], {
        renderer,
        ...circleStyle(h, h.id === selectedIdRef.current)
      }) as HydrantCircle;
      marker.__hid = h.id;
      group.addLayer(marker);
      markers.set(h.id, marker);
    }
  }, [hydrants]);

  // selection highlight — restyle only the two affected circles
  useEffect(() => {
    const markers = markersRef.current;
    const byId = hydrantByIdRef.current;
    const prev = selectedIdRef.current;
    selectedIdRef.current = selectedHydrantId;

    if (prev != null && prev !== selectedHydrantId) {
      const m = markers.get(prev);
      const h = byId.get(prev);
      if (m && h) m.setStyle(circleStyle(h, false));
    }
    if (selectedHydrantId != null) {
      const m = markers.get(selectedHydrantId);
      const h = byId.get(selectedHydrantId);
      if (m && h) {
        m.setStyle(circleStyle(h, true));
        m.bringToFront();
      }
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
