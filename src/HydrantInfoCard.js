import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from './theme';
import {
  POPUP_FIELDS,
  couplingsSummary,
  diameterSummary,
  formatDistance,
  formatMinutes,
  haversineMeters,
  hydrantLabel
} from './hydrantUtils';

export default function HydrantInfoCard({ hydrant, routeInfo, routeLoading, userLocation, onClose }) {
  if (!hydrant) return null;

  const props = hydrant.properties || {};
  const rows = [
    ['Diameter', diameterSummary(props)],
    ['Couplings', couplingsSummary(props)],
    ...POPUP_FIELDS.filter(([key]) => props[key]).map(([key, label]) => [label, props[key]])
  ];

  let distanceLine = null;
  if (routeInfo) {
    distanceLine = `${formatMinutes(routeInfo.duration)} drive (${formatDistance(routeInfo.distance)} by road)`;
  } else if (routeLoading) {
    distanceLine = 'Finding the quickest route…';
  } else if (userLocation) {
    const d = haversineMeters(userLocation, hydrant.coordinate);
    distanceLine = `${formatDistance(d)} from you (tap to get drive time)`;
  }

  return (
    <View style={styles.card}>
      <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={10}>
        <Text style={styles.closeText}>✕</Text>
      </Pressable>

      {distanceLine && <Text style={styles.distance}>{distanceLine}</Text>}
      <Text style={styles.title}>{hydrantLabel(props)}</Text>

      <View style={styles.rows}>
        {rows.map(([label, value]) => (
          <View style={styles.row} key={label}>
            <Text style={styles.rowLabel}>{label}</Text>
            <Text style={value ? styles.rowValue : styles.rowValueUnknown}>{value || 'Not recorded'}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 10
  },
  closeBtn: { position: 'absolute', top: 10, right: 12, padding: 4 },
  closeText: { color: colors.muted, fontSize: 16 },
  distance: { color: colors.youAreHere, fontWeight: '600', fontSize: 13, marginBottom: 4 },
  title: { color: colors.ink, fontSize: 16, fontWeight: '700', marginBottom: 8, paddingRight: 24 },
  rows: { gap: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  rowLabel: { color: colors.muted, fontSize: 13 },
  rowValue: { color: colors.ink, fontSize: 13, flexShrink: 1, textAlign: 'right' },
  rowValueUnknown: { color: colors.muted, fontStyle: 'italic', fontSize: 13, flexShrink: 1, textAlign: 'right' }
});
