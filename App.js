import * as Location from 'expo-location';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

import CitySearchBar from './src/CitySearchBar';
import HydrantInfoCard from './src/HydrantInfoCard';
import Legend from './src/Legend';
import cityData from './src/data/cities.json';
import { fetchHydrantsInBounds, fetchNearestHydrant } from './src/api';
import { detailCompleteness, typeCategory } from './src/hydrantUtils';
import { fetchRoute } from './src/routing';
import { colors, detailColor, typeMarkerColor } from './src/theme';

const SLOVENIA_REGION = {
  latitude: 46.05,
  longitude: 14.9,
  latitudeDelta: 2.4,
  longitudeDelta: 2.6
};

const CATEGORIZE_MODES = ['off', 'detail', 'type'];
const CATEGORIZE_LABELS = { off: 'Categorize', detail: 'By detail', type: 'By type' };
const REGION_FETCH_DEBOUNCE_MS = 400;

function zoomToDelta(zoom) {
  return 360 / Math.pow(2, zoom);
}

function regionToBounds(region) {
  return {
    minLat: region.latitude - region.latitudeDelta / 2,
    maxLat: region.latitude + region.latitudeDelta / 2,
    minLon: region.longitude - region.longitudeDelta / 2,
    maxLon: region.longitude + region.longitudeDelta / 2
  };
}

function toHydrant(row) {
  return {
    id: row.id,
    coordinate: { latitude: row.lat, longitude: row.lon },
    properties: row.properties || {},
    completeness: detailCompleteness(row.properties || {}),
    type: typeCategory(row.properties || {})
  };
}

export default function App() {
  const mapRef = useRef(null);
  const regionFetchTimeout = useRef(null);

  const [hydrants, setHydrants] = useState([]);

  const categoryCounts = useMemo(() => {
    const detail = { full: 0, partial: 0, none: 0 };
    const type = { aboveground: 0, underground: 0, unknown: 0 };
    hydrants.forEach((h) => {
      detail[h.completeness]++;
      type[h.type]++;
    });
    return { detail, type };
  }, [hydrants]);

  const cities = useMemo(
    () =>
      cityData.map((c) => ({
        name: c.name,
        latitude: c.center[0],
        longitude: c.center[1],
        latitudeDelta: zoomToDelta(c.zoom),
        longitudeDelta: zoomToDelta(c.zoom)
      })),
    []
  );

  const [categorizeMode, setCategorizeMode] = useState('off');
  const [locating, setLocating] = useState(false);
  const [locationEnabled, setLocationEnabled] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [queryPoint, setQueryPoint] = useState(null);
  const [selectedHydrant, setSelectedHydrant] = useState(null);
  const [routeInfo, setRouteInfo] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeCoordinates, setRouteCoordinates] = useState(null);
  const [statusMessage, setStatusMessage] = useState('Loading hydrants…');

  async function loadHydrants(region) {
    try {
      const rows = await fetchHydrantsInBounds(regionToBounds(region));
      const loaded = rows.map(toHydrant);
      setHydrants(loaded);
      setStatusMessage(`${loaded.length} hydrants in view.`);
    } catch (err) {
      setStatusMessage('Could not reach the hydrant server.');
    }
  }

  useEffect(() => {
    loadHydrants(SLOVENIA_REGION);
  }, []);

  function handleRegionChangeComplete(region) {
    clearTimeout(regionFetchTimeout.current);
    regionFetchTimeout.current = setTimeout(() => loadHydrants(region), REGION_FETCH_DEBOUNCE_MS);
  }

  function fitTo(coordsArray) {
    mapRef.current?.fitToCoordinates(coordsArray, {
      edgePadding: { top: 80, right: 60, bottom: 220, left: 60 },
      animated: true
    });
  }

  async function routeFromHereToHydrant(from, hydrant, label) {
    setSelectedHydrant(hydrant);
    setRouteInfo(null);
    setRouteLoading(true);
    fitTo([from, hydrant.coordinate]);

    try {
      const route = await fetchRoute(from, hydrant.coordinate);
      setRouteCoordinates(route.coordinates);
      setRouteInfo({ distance: route.distance, duration: route.duration });
      fitTo(route.coordinates);
      setStatusMessage(
        `Quickest route to ${label.toLowerCase()}: ${(route.distance / 1000).toFixed(1)} km by road.`
      );
    } catch (err) {
      setRouteCoordinates([from, hydrant.coordinate]);
      setStatusMessage(`${label} — road route unavailable, showing straight line.`);
    } finally {
      setRouteLoading(false);
    }
  }

  async function ensureLocation() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      setStatusMessage("Location permission denied — can't route from your position.");
      return null;
    }
    setLocationEnabled(true);
    const pos = await Location.getCurrentPositionAsync({});
    const here = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
    setUserLocation(here);
    return here;
  }

  async function handleLocateMe() {
    setLocating(true);
    setStatusMessage('Finding your location…');
    const here = await ensureLocation();
    if (!here) {
      setLocating(false);
      return;
    }

    const row = await fetchNearestHydrant(here).catch(() => null);
    setLocating(false);
    if (!row) {
      setStatusMessage('Located you. Could not reach the hydrant server.');
      return;
    }
    routeFromHereToHydrant(here, toHydrant(row), 'Nearest hydrant');
  }

  async function handleMarkerPress(hydrant) {
    if (userLocation) {
      routeFromHereToHydrant(userLocation, hydrant, 'This hydrant');
      return;
    }
    setStatusMessage('Finding your location to route to this hydrant…');
    const here = await ensureLocation();
    if (!here) return;
    routeFromHereToHydrant(here, hydrant, 'This hydrant');
  }

  async function handleMapPress(e) {
    const point = e.nativeEvent.coordinate;
    const row = await fetchNearestHydrant(point).catch(() => null);
    if (!row) {
      setStatusMessage('Could not reach the hydrant server.');
      return;
    }
    setQueryPoint(point);
    routeFromHereToHydrant(point, toHydrant(row), 'Nearest hydrant to that point');
  }

  function handleCategorizeToggle() {
    const nextIndex = (CATEGORIZE_MODES.indexOf(categorizeMode) + 1) % CATEGORIZE_MODES.length;
    const nextMode = CATEGORIZE_MODES[nextIndex];
    setCategorizeMode(nextMode);

    if (nextMode === 'detail') {
      const c = categoryCounts.detail;
      setStatusMessage(`${c.full} full detail · ${c.partial} partial · ${c.none} not recorded.`);
    } else if (nextMode === 'type') {
      const c = categoryCounts.type;
      setStatusMessage(`${c.aboveground} above ground · ${c.underground} underground · ${c.unknown} type not recorded.`);
    } else {
      setStatusMessage(`${hydrants.length} hydrants across Slovenia.`);
    }
  }

  function handleSelectCity(city) {
    mapRef.current?.animateToRegion(city, 500);
    setStatusMessage(`Centered on ${city.name}.`);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topbar}>
        <View style={styles.brandRow}>
          <View style={styles.brandDot} />
          <Text style={styles.brandName}>Hydrant Finder</Text>
        </View>

        <View style={styles.controlsRow}>
          <CitySearchBar cities={cities} onSelectCity={handleSelectCity} />
        </View>

        <View style={styles.buttonRow}>
          <Pressable
            style={[styles.btn, categorizeMode !== 'off' && styles.btnActive]}
            onPress={handleCategorizeToggle}
          >
            <Text style={styles.btnText}>{CATEGORIZE_LABELS[categorizeMode]}</Text>
          </Pressable>
          <Pressable style={[styles.btn, locating && styles.btnActive]} onPress={handleLocateMe}>
            <Text style={styles.btnText}>{locating ? 'Locating…' : 'Locate me'}</Text>
          </Pressable>
        </View>
      </View>

      {!!statusMessage && (
        <View style={styles.status}>
          <Text style={styles.statusText}>{statusMessage}</Text>
        </View>
      )}

      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={SLOVENIA_REGION}
        showsUserLocation={locationEnabled}
        onUserLocationChange={(e) => {
          if (e.nativeEvent.coordinate) {
            setUserLocation({
              latitude: e.nativeEvent.coordinate.latitude,
              longitude: e.nativeEvent.coordinate.longitude
            });
          }
        }}
        onPress={handleMapPress}
        onRegionChangeComplete={handleRegionChangeComplete}
      >
        {hydrants.map((h) => (
          <Marker
            key={h.id}
            coordinate={h.coordinate}
            pinColor={
              categorizeMode === 'detail'
                ? detailColor(h.completeness)
                : categorizeMode === 'type'
                  ? typeMarkerColor(h.type)
                  : colors.hydrant
            }
            onPress={() => handleMarkerPress(h)}
          />
        ))}

        {queryPoint && (
          <Marker coordinate={queryPoint} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={styles.queryDot} />
          </Marker>
        )}

        {routeCoordinates && (
          <>
            <Polyline coordinates={routeCoordinates} strokeColor="#0b1f3a" strokeWidth={7} />
            <Polyline coordinates={routeCoordinates} strokeColor={colors.youAreHere} strokeWidth={4} />
          </>
        )}
      </MapView>

      {categorizeMode !== 'off' && <Legend mode={categorizeMode} />}

      <HydrantInfoCard
        hydrant={selectedHydrant}
        routeInfo={routeInfo}
        routeLoading={routeLoading}
        userLocation={userLocation}
        onClose={() => {
          setSelectedHydrant(null);
          setRouteCoordinates(null);
          setRouteInfo(null);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  topbar: {
    backgroundColor: colors.panel,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    padding: 12,
    gap: 10,
    zIndex: 10
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.hydrantStrong },
  brandName: { color: colors.ink, fontWeight: '700', fontSize: 16 },
  controlsRow: { flexDirection: 'row' },
  buttonRow: { flexDirection: 'row', gap: 10 },
  btn: {
    flex: 1,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center'
  },
  btnActive: { borderColor: colors.youAreHere },
  btnText: { color: colors.ink, fontSize: 14, fontWeight: '600' },
  status: {
    backgroundColor: colors.panel,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  statusText: { color: colors.muted, fontSize: 12 },
  map: { flex: 1 },
  queryDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.panel,
    borderWidth: 3,
    borderColor: colors.ink
  }
});
