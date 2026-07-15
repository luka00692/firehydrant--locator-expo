import { StyleSheet, Text, View } from 'react-native';
import { LEGENDS, colors } from './theme';

export default function Legend({ mode }) {
  const legend = LEGENDS[mode];
  if (!legend) return null;

  return (
    <View style={styles.legend}>
      <Text style={styles.title}>{legend.title}</Text>
      {legend.rows.map(([color, label]) => (
        <Row key={label} color={color} label={label} />
      ))}
    </View>
  );
}

function Row({ color, label }) {
  return (
    <View style={styles.row}>
      <View style={[styles.swatch, { backgroundColor: color }]} />
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  legend: {
    position: 'absolute',
    left: 16,
    bottom: 16,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: 220
  },
  title: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 6
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 2 },
  swatch: { width: 10, height: 10, borderRadius: 5 },
  label: { color: colors.ink, fontSize: 12 }
});
