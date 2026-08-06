import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Toast from 'react-native-toast-message';
import Navbar from '../components/Navbar';
import DocumentUploadCard from '../components/DocumentUploadCard';
import ApplicationSummaryCard from '../components/ApplicationSummaryCard';
import { uploadRc } from '../utils/vehicleDocsApi';

/**
 * RC Upload — details + upload.
 *
 * The read-only application block is ApplicationSummaryCard, shared with the
 * Number Plate module. This screen owns the two-image upload and its submit.
 */
export default function RCUploadDetailsScreen({ navigation, route }) {
  const item = route?.params?.item || {};
  const applicationId = item.applicationId;

  const [user, setUser] = useState(null);
  const [front, setFront] = useState(null);
  const [back, setBack] = useState(null);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  // Guards against a double submit landing between the tap and the state flush.
  const submittingRef = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem('userInfo')
      .then((json) => { if (json) setUser(JSON.parse(json)); })
      .catch(() => {});
  }, []);

  const setImage = (which, value) => {
    if (which === 'front') setFront(value); else setBack(value);
    // Clear that field's error as soon as it is satisfied.
    setErrors((prev) => {
      if (!value || !prev[which]) return prev;
      const next = { ...prev };
      delete next[which];
      return next;
    });
  };

  const handleSubmit = async () => {
    if (submittingRef.current) return; // prevent double submit

    const nextErrors = {};
    if (!front) nextErrors.front = 'RC front image is required';
    if (!back) nextErrors.back = 'RC back image is required';
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setErrors({});

    try {
      await uploadRc(applicationId, front, back);

      Toast.show({
        type: 'success',
        text1: 'RC uploaded successfully',
        position: 'bottom',
        visibilityTime: 2500,
      });

      navigation.navigate('RCUploadScreen', { uploadedApplicationId: applicationId });
    } catch (err) {
      const aborted = err?.name === 'AbortError';
      console.error('RC upload failed:', err?.message || err);
      Toast.show({
        type: 'error',
        text1: 'Upload failed',
        text2: aborted ? 'The request timed out. Please try again.' : (err?.message || 'Please try again.'),
        position: 'bottom',
        visibilityTime: 3500,
      });
      // Selected images are intentionally kept so the user can simply retry.
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff7ed' }}>
      <View style={{ flex: 1, backgroundColor: '#fff' }}>
        <Navbar user={user} onLogout={() => navigation.replace('Login')} />

        <ScrollView contentContainerStyle={{ padding: 15, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <View style={styles.headerBox}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} disabled={submitting}>
              <Ionicons name="arrow-back" size={20} color="#222" />
            </TouchableOpacity>
            <Text style={styles.heading}>RC Upload</Text>
          </View>

          <ApplicationSummaryCard item={item} />

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Upload RC</Text>

            <DocumentUploadCard
              label="RC Front"
              value={front}
              onChange={(v) => setImage('front', v)}
              error={errors.front}
              disabled={submitting}
            />
            <DocumentUploadCard
              label="RC Back"
              value={back}
              onChange={(v) => setImage('back', v)}
              error={errors.back}
              disabled={submitting}
            />

            <TouchableOpacity
              style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={submitting}
              activeOpacity={0.85}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.submitText}>Submit</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  headerBox: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  backBtn: { padding: 6, marginRight: 6 },
  heading: { fontSize: 24, fontWeight: '800', color: '#000', letterSpacing: -0.5 },
  card: {
    backgroundColor: '#fff',
    marginVertical: 10,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#f2f2f2',
  },
  cardTitle: { fontWeight: 'bold', fontSize: 18, color: '#FF7300', marginBottom: 10 },
  submitBtn: {
    backgroundColor: '#FF7300',
    borderRadius: 9,
    padding: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    minHeight: 52,
  },
  submitBtnDisabled: { backgroundColor: '#FFD3A3' },
  submitText: { color: '#fff', fontWeight: 'bold', fontSize: 16.5, letterSpacing: 0.16 },
});
