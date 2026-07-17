import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ALGORITHMS, ALGORITHM_LABELS, crackHash, hashPassword } from './passwordCrack';
import { colors } from './theme';

export default function PasswordCrackLab({ visible, onClose }) {
  const [password, setPassword] = useState('');
  const [algorithm, setAlgorithm] = useState('md5');
  const [hash, setHash] = useState(null);
  const [result, setResult] = useState(null);
  const [cracking, setCracking] = useState(false);

  function handleHash() {
    if (!password) return;
    setHash(hashPassword(password, algorithm));
    setResult(null);
  }

  function handleCrack() {
    if (!hash) return;
    setCracking(true);
    // Deferred so the "cracking…" state actually paints before the
    // (synchronous, CPU-bound) attack runs.
    setTimeout(() => {
      setResult(crackHash(hash, algorithm));
      setCracking(false);
    }, 50);
  }

  function reset() {
    setPassword('');
    setHash(null);
    setResult(null);
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <ScrollView style={styles.safe} contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Password Hash Lab</Text>
          <Pressable style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>Close</Text>
          </Pressable>
        </View>

        <Text style={styles.blurb}>
          Educational demo. Type a password, hash it locally with different algorithms, then run a
          dictionary + brute-force attack against your own hash — nothing here touches a real
          account, hash, or server.
        </Text>

        <Text style={styles.label}>Password to hash</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={(v) => {
            setPassword(v);
            setHash(null);
            setResult(null);
          }}
          placeholder="e.g. password1"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={styles.label}>Algorithm</Text>
        <View style={styles.algoRow}>
          {ALGORITHMS.map((a) => (
            <Pressable
              key={a}
              style={[styles.algoBtn, algorithm === a && styles.algoBtnActive]}
              onPress={() => {
                setAlgorithm(a);
                setHash(null);
                setResult(null);
              }}
            >
              <Text style={[styles.algoBtnText, algorithm === a && styles.algoBtnTextActive]}>
                {a.toUpperCase()}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.algoCaption}>{ALGORITHM_LABELS[algorithm]}</Text>

        <Pressable style={[styles.actionBtn, !password && styles.actionBtnDisabled]} onPress={handleHash}>
          <Text style={styles.actionBtnText}>Hash it</Text>
        </Pressable>

        {hash && (
          <View style={styles.hashBox}>
            <Text style={styles.hashLabel}>Resulting hash</Text>
            <Text style={styles.hashValue} selectable>
              {hash}
            </Text>
          </View>
        )}

        {hash && (
          <Pressable
            style={[styles.actionBtn, styles.crackBtn, cracking && styles.actionBtnDisabled]}
            disabled={cracking}
            onPress={handleCrack}
          >
            <Text style={styles.actionBtnText}>{cracking ? 'Cracking…' : 'Crack this hash'}</Text>
          </Pressable>
        )}

        {result && (
          <View style={styles.resultBox}>
            {result.cracked ? (
              <>
                <Text style={styles.resultTitleGood}>Cracked ✓</Text>
                <Text style={styles.resultLine}>
                  Guessed: <Text style={styles.mono}>{result.guess}</Text>
                </Text>
              </>
            ) : (
              <Text style={styles.resultTitleBad}>Not cracked within this demo's dictionary + brute force</Text>
            )}
            <Text style={styles.resultLine}>Attempts: {result.attempts.toLocaleString()}</Text>
            <Text style={styles.resultLine}>Time: {result.elapsedMs} ms</Text>
            <Text style={styles.resultLine}>
              Speed: {Math.round(result.attempts / Math.max(result.elapsedMs, 1) * 1000).toLocaleString()}{' '}
              guesses/sec
            </Text>
            {algorithm === 'bcrypt' && (
              <Text style={styles.note}>
                bcrypt's deliberate slowness is why it wasn't brute-forced here even at a few characters —
                the same property makes real-world cracking millions of times slower than for MD5/SHA-1/SHA-256.
              </Text>
            )}
          </View>
        )}

        {(hash || result) && (
          <Pressable style={styles.resetBtn} onPress={reset}>
            <Text style={styles.resetBtnText}>Reset</Text>
          </Pressable>
        )}
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 14, paddingBottom: 60 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: colors.ink, fontSize: 20, fontWeight: '700' },
  closeBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: colors.border },
  closeBtnText: { color: colors.ink, fontWeight: '600' },
  blurb: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  label: { color: colors.ink, fontSize: 13, fontWeight: '600', marginTop: 6 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.ink,
    backgroundColor: colors.panel
  },
  algoRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  algoBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel
  },
  algoBtnActive: { borderColor: colors.youAreHere, backgroundColor: colors.youAreHere },
  algoBtnText: { color: colors.ink, fontSize: 12, fontWeight: '600' },
  algoBtnTextActive: { color: '#fff' },
  algoCaption: { color: colors.muted, fontSize: 12 },
  actionBtn: {
    backgroundColor: colors.youAreHere,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 6
  },
  crackBtn: { backgroundColor: colors.hydrantStrong },
  actionBtnDisabled: { opacity: 0.5 },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  hashBox: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    gap: 4
  },
  hashLabel: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  hashValue: { color: colors.ink, fontFamily: 'monospace', fontSize: 12 },
  resultBox: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    gap: 4
  },
  resultTitleGood: { color: colors.detailFull, fontWeight: '700', fontSize: 15 },
  resultTitleBad: { color: colors.muted, fontWeight: '700', fontSize: 14 },
  resultLine: { color: colors.ink, fontSize: 13 },
  mono: { fontFamily: 'monospace' },
  note: { color: colors.muted, fontSize: 12, marginTop: 6, lineHeight: 17 },
  resetBtn: { alignItems: 'center', paddingVertical: 10 },
  resetBtnText: { color: colors.muted, fontSize: 13, fontWeight: '600' }
});
