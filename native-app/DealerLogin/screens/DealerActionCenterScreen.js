import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, TextInput
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Toast from 'react-native-toast-message';
import Navbar from '../components/Navbar';
import DocumentUploadCard from '../components/DocumentUploadCard';
import { fetchApplicationActions, uploadReplacement } from '../utils/dealerActionsApi';

/**
 * Dealer Action Center for one application.
 *
 * Shows every document with its verification state and lets the dealer replace
 * only the ones the admin asked for. Uses the existing DocumentUploadCard for
 * picking the file, so there is one image-picker implementation in the app.
 *
 * A dealer can never verify a document — after upload the server sets the
 * status to "Pending" (awaiting admin verification), which is what renders here.
 */

const STATUS_STYLE = {
  Verified: { colour: '#16A34A', bg: '#E8F5E9', border: '#16C172', dot: '🟢' },
  Rejected: { colour: '#B91C1C', bg: '#FEF2F2', border: '#FECACA', dot: '🔴' },
  'Re-upload Requested': { colour: '#B45309', bg: '#FFFBEB', border: '#FDE68A', dot: '🟠' },
  Pending: { colour: '#92400E', bg: '#FFF7ED', border: '#FDE3BF', dot: '🟡' },
  'Not uploaded': { colour: '#6B7280', bg: '#F3F4F6', border: '#E5E7EB', dot: '⚪' },
};

const fmt = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? '—'
    : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

export default function DealerActionCenterScreen({ navigation, route }) {
  const applicationId = route?.params?.applicationId;

  const [user, setUser] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Per-document local state: the picked replacement and the dealer's reply.
  const [picked, setPicked] = useState({});
  const [replies, setReplies] = useState({});
  const [busyKey, setBusyKey] = useState('');
  const busyRef = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem('userInfo')
      .then((json) => { if (json) setUser(JSON.parse(json)); })
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await fetchApplicationActions(applicationId));
    } catch (err) {
      console.error('Failed to load action center:', err?.response?.data || err.message);
      setError(err?.response?.data?.message || 'Could not load this application.');
    } finally {
      setLoading(false);
    }
  }, [applicationId]);

  // Refresh on focus, so returning here shows the admin's latest decisions.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const submit = async (doc) => {
    const key = `${doc.role}.${doc.field}`;
    if (busyRef.current) return;

    const image = picked[key];
    if (!image) {
      Toast.show({ type: 'error', text1: 'Select a document first', position: 'bottom' });
      return;
    }

    busyRef.current = true;
    setBusyKey(key);
    try {
      await uploadReplacement(applicationId, doc.role, doc.field, image, replies[key] || '');
      Toast.show({
        type: 'success',
        text1: `${doc.label} uploaded`,
        text2: 'Awaiting verification.',
        position: 'bottom',
        visibilityTime: 2500,
      });
      setPicked((p) => ({ ...p, [key]: null }));
      setReplies((r) => ({ ...r, [key]: '' }));
      await load();
    } catch (err) {
      Toast.show({
        type: 'error',
        text1: 'Upload failed',
        text2: err?.message || 'Please try again.',
        position: 'bottom',
        visibilityTime: 3500,
      });
      // The picked file is intentionally kept so the dealer can simply retry.
    } finally {
      busyRef.current = false;
      setBusyKey('');
    }
  };

  const renderDoc = (doc) => {
    const key = `${doc.role}.${doc.field}`;
    const s = STATUS_STYLE[doc.status] || STATUS_STYLE.Pending;
    const busy = busyKey === key;

    return (
      <View key={key} style={styles.docCard}>
        <View style={styles.docHead}>
          <Text style={styles.docLabel}>{doc.label}</Text>
          <Text style={styles.docOwner}>
            {doc.role === 'applicant' ? 'Applicant' : 'Co-Applicant'}
          </Text>
        </View>

        <View style={[styles.badge, { backgroundColor: s.bg, borderColor: s.border }]}>
          <Text style={[styles.badgeText, { color: s.colour }]}>
            {s.dot} {doc.status}
          </Text>
        </View>

        {/* The admin's remark — why this was rejected or asked for again. */}
        {doc.actionRequired && doc.reason ? (
          <View style={styles.remarkBox}>
            {doc.requestedBy ? (
              <Text style={styles.remarkBy}>Requested by {doc.requestedBy}</Text>
            ) : null}
            <Text style={styles.remarkText}>{doc.reason}</Text>
          </View>
        ) : null}

        {doc.status === 'Verified' && doc.verifiedBy ? (
          <Text style={styles.meta}>Verified by {doc.verifiedBy} · {fmt(doc.verifiedAt)}</Text>
        ) : null}

        {doc.dealerResponse ? (
          <Text style={styles.meta}>Your response: {doc.dealerResponse}</Text>
        ) : null}

        {/* Version history — previous files are never deleted. */}
        {doc.versions?.length > 0 && (
          <View style={styles.history}>
            <Text style={styles.historyTitle}>Previous versions</Text>
            {doc.versions.map((v) => (
              <Text key={v.version} style={styles.historyRow}>
                v{v.version} · {v.status || '—'}
                {v.remarks ? ` · ${v.remarks}` : ''}
              </Text>
            ))}
            <Text style={styles.historyRow}>
              v{(doc.versions.length || 0) + 1} · current
            </Text>
          </View>
        )}

        {/* Only documents the admin asked for can be replaced. */}
        {doc.actionRequired ? (
          <View style={styles.uploadArea}>
            <DocumentUploadCard
              label="Upload New Document"
              value={picked[key] || null}
              onChange={(v) => setPicked((p) => ({ ...p, [key]: v }))}
              disabled={busy}
            />
            <TextInput
              style={styles.reply}
              placeholder="Add a response (optional)"
              placeholderTextColor="#888"
              value={replies[key] || ''}
              onChangeText={(t) => setReplies((r) => ({ ...r, [key]: t }))}
              editable={!busy}
            />
            <TouchableOpacity
              style={[styles.submitBtn, busy && styles.submitBtnDisabled]}
              onPress={() => submit(doc)}
              disabled={busy}
              activeOpacity={0.85}
            >
              {busy ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.submitText}>Submit Document</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff7ed' }}>
      <View style={{ flex: 1, backgroundColor: '#fff' }}>
        <Navbar user={user} onLogout={() => navigation.replace('Login')} />

        <ScrollView contentContainerStyle={{ padding: 15, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <View style={styles.headerBox}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={20} color="#222" />
            </TouchableOpacity>
            <Text style={styles.heading}>Action Center</Text>
          </View>

          {loading ? (
            <ActivityIndicator size="large" color="#000" style={{ marginTop: 40 }} />
          ) : error ? (
            <View style={styles.stateBox}>
              <Text style={styles.stateText}>{error}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={load} activeOpacity={0.8}>
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : !data ? null : (
            <>
              <View style={styles.summary}>
                <Text style={styles.loan}>{data.loanNumber || '—'}</Text>
                <Text style={styles.customer}>{data.customerName || ''}</Text>
                <Text style={styles.stage}>
                  {data.pendingActions?.length
                    ? `${data.pendingActions.length} document(s) need your attention`
                    : 'No pending actions'}
                </Text>
              </View>

              <Text style={styles.sectionTitle}>Documents</Text>
              {(data.documents || []).map(renderDoc)}
            </>
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  headerBox: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  backBtn: { padding: 6, marginRight: 6 },
  heading: { fontSize: 24, fontWeight: '800', color: '#000', letterSpacing: -0.5 },

  summary: {
    backgroundColor: '#fff6ec', borderRadius: 12, borderWidth: 1.5,
    borderColor: '#F3D9BE', padding: 14, marginBottom: 14,
  },
  loan: { fontSize: 17, fontWeight: '800', color: '#171717' },
  customer: { fontSize: 13.5, color: '#555', marginTop: 2 },
  stage: { fontSize: 12.5, color: '#A34B1A', marginTop: 6, fontWeight: '700' },

  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#333', marginBottom: 8, marginLeft: 2 },

  docCard: {
    backgroundColor: '#fff', borderRadius: 12, borderWidth: 1,
    borderColor: '#EAEAEA', padding: 14, marginBottom: 12,
  },
  docHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  docLabel: { fontSize: 15, fontWeight: '700', color: '#171717' },
  docOwner: { fontSize: 11.5, color: '#999' },
  badge: {
    alignSelf: 'flex-start', marginTop: 6, paddingHorizontal: 9,
    paddingVertical: 3, borderRadius: 999, borderWidth: 1,
  },
  badgeText: { fontSize: 11.5, fontWeight: '800' },

  remarkBox: {
    marginTop: 8, padding: 9, borderRadius: 8,
    backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A',
  },
  remarkBy: { fontSize: 11, color: '#92400E', fontWeight: '700', marginBottom: 2 },
  remarkText: { fontSize: 12.5, color: '#7c5a12' },
  meta: { fontSize: 11.5, color: '#666', marginTop: 5 },

  history: { marginTop: 8, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  historyTitle: { fontSize: 11, fontWeight: '800', color: '#9ca3af', marginBottom: 3 },
  historyRow: { fontSize: 11.5, color: '#6b7280' },

  uploadArea: { marginTop: 12 },
  reply: {
    borderWidth: 1, borderColor: '#E5E5E5', borderRadius: 8, padding: 10,
    fontSize: 14, backgroundColor: '#FAFAFA', color: '#222', marginBottom: 10,
  },
  submitBtn: {
    backgroundColor: '#FF7300', borderRadius: 9, padding: 13,
    alignItems: 'center', justifyContent: 'center', minHeight: 48,
  },
  submitBtnDisabled: { backgroundColor: '#FFD3A3' },
  submitText: { color: '#fff', fontWeight: 'bold', fontSize: 15.5 },

  stateBox: { alignItems: 'center', paddingVertical: 50 },
  stateText: { color: '#888', fontSize: 15, textAlign: 'center' },
  retryBtn: {
    marginTop: 16, borderWidth: 1, borderColor: '#FF7300', borderRadius: 9,
    paddingVertical: 10, paddingHorizontal: 28, backgroundColor: '#FFF3E0',
  },
  retryText: { color: '#FF7300', fontWeight: 'bold', fontSize: 15 },
});
