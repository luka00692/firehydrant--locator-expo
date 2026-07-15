import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from './theme';

export default function CitySearchBar({ cities, onSelectCity }) {
  const [query, setQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  const suggestions =
    query.trim().length === 0
      ? []
      : cities.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 6);

  function handleSelect(city) {
    setQuery(city.name);
    setShowSuggestions(false);
    onSelectCity(city);
  }

  return (
    <View style={styles.wrap}>
      <TextInput
        style={styles.input}
        value={query}
        onChangeText={(text) => {
          setQuery(text);
          setShowSuggestions(true);
        }}
        onFocus={() => setShowSuggestions(true)}
        placeholder="Search a city…"
        placeholderTextColor={colors.muted}
        autoCorrect={false}
        autoCapitalize="words"
      />
      {showSuggestions && suggestions.length > 0 && (
        <View style={styles.dropdown}>
          <FlatList
            data={suggestions}
            keyExtractor={(item) => item.name}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable style={styles.suggestion} onPress={() => handleSelect(item)}>
                <Text style={styles.suggestionText}>{item.name}</Text>
              </Pressable>
            )}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, minWidth: 140 },
  input: {
    backgroundColor: colors.bg,
    color: colors.ink,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15
  },
  dropdown: {
    position: 'absolute',
    top: 44,
    left: 0,
    right: 0,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    maxHeight: 220,
    zIndex: 20,
    elevation: 20
  },
  suggestion: { paddingHorizontal: 12, paddingVertical: 10 },
  suggestionText: { color: colors.ink, fontSize: 14 }
});
