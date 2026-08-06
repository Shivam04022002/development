import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView,
  TouchableOpacity, ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Navbar from './Navbar';

/**
 * PendingUploadListView — the pending-uploads list, shared by the RC and
 * Number Plate modules.
 *
 * The two lists differ only in their copy, their fetch function and where a row
 * navigates to, so everything else lives here once: search, debounce,
 * refresh-on-focus, optimistic removal after an upload, and the loading / empty
 * / error states.
 *
 * Search is performed BY THE BACKEND — the caller's fetchItems receives the
 * search term and is expected to pass it to the API. The list is never filtered
 * locally. Keystrokes are debounced so typing does not fire one request per
 * character.
 */
export default function PendingUploadListView({
  title,
  subtitle,
  emptyText,
  errorText,
  fetchItems,
  onSelectItem,
  onLogout,
  removedApplicationId,
  onRemovedHandled,
}) {
  const [user, setUser] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // Read by the focus effect, which must not re-subscribe on every keystroke.
  const queryRef = useRef('');
  queryRef.current = debouncedQuery;

  useEffect(() => {
    AsyncStorage.getItem('userInfo')
      .then((json) => { if (json) setUser(JSON.parse(json)); })
      .catch(() => {});
  }, []);

  const load = useCallback(async (search) => {
    setLoading(true);
    setError('');
    try {
      setItems(await fetchItems(search));
    } catch (err) {
      console.error(`Error fetching ${title} list:`, err?.response?.data || err.message);
      setError(errorText);
    } finally {
      setLoading(false);
    }
  }, [fetchItems, errorText, title]);

  // Debounce the search box, then query the backend.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 400);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => { load(debouncedQuery); }, [debouncedQuery, load]);

  // Refresh whenever the screen regains focus, so a record uploaded on the
  // details screen is gone when the user comes back.
  useFocusEffect(useCallback(() => { load(queryRef.current); }, [load]));

  // The details screen hands back the id it just uploaded. Dropping it here
  // makes the row disappear immediately, before the refetch lands.
  useEffect(() => {
    if (!removedApplicationId) return;
    setItems((prev) => prev.filter((it) => it.applicationId !== removedApplicationId));
    if (onRemovedHandled) onRemovedHandled();
  }, [removedApplicationId, onRemovedHandled]);

  const renderBody = () => {
    if (loading) {
      return <ActivityIndicator size="large" color="#000" style={{ marginTop: 40 }} />;
    }

    if (error) {
      return (
        <View style={styles.stateBox}>
          <MaterialIcons name="error-outline" size={40} color="#E55B13" />
          <Text style={styles.stateText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => load(debouncedQuery)}
            activeOpacity={0.8}
          >
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (items.length === 0) {
      return (
        <View style={styles.stateBox}>
          <MaterialIcons name="inbox" size={40} color="#C7A98A" />
          <Text style={styles.stateText}>{emptyText}</Text>
        </View>
      );
    }

    return items.map((item) => (
      <TouchableOpacity
        key={item.applicationId}
        style={styles.card}
        activeOpacity={0.75}
        onPress={() => onSelectItem(item)}
      >
        <View style={styles.cardMain}>
          <Text style={styles.cardName} numberOfLines={1}>
            {item.customerName || 'Unknown'}
          </Text>

          <View style={styles.cardLine}>
            <Text style={styles.cardLabel}>Loan No</Text>
            <Text style={styles.cardValue} numberOfLines={1}>{item.loanNumber || '—'}</Text>
          </View>
          <View style={styles.cardLine}>
            <Text style={styles.cardLabel}>Mobile</Text>
            <Text style={styles.cardValue} numberOfLines={1}>{item.mobileNumber || '—'}</Text>
          </View>

          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>Approved</Text>
          </View>
        </View>

        <MaterialIcons name="chevron-right" size={26} color="#B0B0B0" />
      </TouchableOpacity>
    ));
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff7ed' }}>
      <View style={{ flex: 1, backgroundColor: '#fff' }}>
        <Navbar user={user} onLogout={onLogout} />

        <ScrollView contentContainerStyle={{ paddingBottom: 30 }} keyboardShouldPersistTaps="handled">
          <Text style={styles.heading}>{title}</Text>
          <Text style={styles.subheading}>{subtitle}</Text>

          <View style={styles.searchRow}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search by Loan Number, Mobile Number or Customer Name"
              placeholderTextColor="#888"
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
            />
          </View>

          <View style={styles.listWrap}>{renderBody()}</View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

export const styles = StyleSheet.create({
  heading: { fontSize: 28, fontWeight: '800', color: '#000', marginTop: 20, marginBottom: 2, marginLeft: 18, letterSpacing: -0.5 },
  subheading: { fontSize: 14, color: '#777', marginLeft: 18, marginBottom: 14 },
  searchRow: { marginHorizontal: 16, marginBottom: 12 },
  searchInput: { borderWidth: 1.5, borderColor: '#E5E5E5', borderRadius: 10, padding: 12, fontSize: 15, backgroundColor: '#FAFAFA', color: '#000' },
  listWrap: { marginHorizontal: 10 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  cardMain: { flex: 1, paddingRight: 8 },
  cardName: { fontSize: 16, color: '#000', fontWeight: '700', marginBottom: 6 },
  cardLine: { flexDirection: 'row', marginTop: 2 },
  cardLabel: { fontSize: 13, color: '#888', width: 66 },
  cardValue: { fontSize: 13.5, color: '#333', fontWeight: '600', flex: 1 },
  statusBadge: {
    alignSelf: 'flex-start',
    marginTop: 9,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: '#E8F5E9',
    borderColor: '#16C172',
  },
  statusText: { fontSize: 11, fontWeight: '800', color: '#16C172', letterSpacing: 0.2 },
  stateBox: { alignItems: 'center', paddingVertical: 50, paddingHorizontal: 24 },
  stateText: { color: '#888', fontSize: 15, marginTop: 12, textAlign: 'center' },
  retryBtn: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#FF7300',
    borderRadius: 9,
    paddingVertical: 10,
    paddingHorizontal: 28,
    backgroundColor: '#FFF3E0',
  },
  retryText: { color: '#FF7300', fontWeight: 'bold', fontSize: 15 },
});
