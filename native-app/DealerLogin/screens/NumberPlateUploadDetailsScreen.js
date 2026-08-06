import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView,
  TouchableOpacity, ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Toast from 'react-native-toast-message';
import Navbar from '../components/Navbar';
import DocumentUploadCard from '../components/DocumentUploadCard';
import ApplicationSummaryCard from '../components/ApplicationSummaryCard';
import { uploadNumberPlate, normalisePlateNumber } from '../utils/vehicleDocsApi';

/**
 * Number Plate Upload — details + upload.
 *
 * Same shape as the RC details screen and sharing its read-only block and its
 * upload card; the difference is one image plus a text field instead of two
 * images.
 */
export default function NumberPlateUploadDetailsScreen({ navigation, route }) {
  const item = route?.params?.item || {};
  const applicationId = item.applicationId;

  const [user, setUser] = useState(null);
  const [image, setImage] = useState(null);
  const [plateNumber, setPlateNumber] = useState('');
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  // Guards against a double submit landing between the tap and the state flush.
  const submittingRef = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem('userInfo')
      .then((json) => { if (json) setUser(JSON.parse(json)); })
      .catch(() => {});
  }, []);

  const clearError = (field) =>
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });

  const onImageChange = (value) => {
    setImage(value);
    if (value) clearError('image');
  };

  // Upper-case as the dealer types, so what they see is what gets submitted.
  const onPlateChange = (text) => {
    setPlateNumber(text.toUpperCase());
    if (text.trim()) clearError('plateNumber');
  };

  const handleSubmit = async () => {
    if (submittingRef.current) return; // prevent double submit

    const trimmed = normalisePlateNumber(plateNumber);
    const nextErrors = {};
    if (!image) nextErrors.image = 'Number plate image is required';
    if (!trimmed) nextErrors.plateNumber = 'Number plate number is required';
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setErrors({});

    try {
      // uploadNumberPlate trims and upper-cases again, so the value that
      // reaches the backend is canonical no matter how it was typed.
      await uploadNumberPlate(applicationId, image, trimmed);

      Toast.show({
        type: 'success',
        text1: 'Number plate uploaded successfully',
        position: 'bottom',
        visibilityTime: 2500,
      });

      navigation.navigate('NumberPlateUploadScreen', { uploadedApplicationId: applicationId });
    } catch (err) {
      const aborted = err?.name === 'AbortError';
      console.error('Number plate upload failed:', err?.message || err);
      Toast.show({
        type: 'error',
        text1: 'Upload failed',
        text2: aborted ? 'The request timed out. Please try again.' : (err?.message || 'Please try again.'),
        position: 'bottom',
        visibilityTime: 3500,
      });
      // The selected image and the typed number are intentionally kept so the
      // user can simply retry.
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
            <Text style={styles.heading}>Number Plate Upload</Text>
          </View>

          <ApplicationSummaryCard item={item} />

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Upload Number Plate</Text>

            <DocumentUploadCard
              label="Number Plate Image"
              value={image}
              onChange={onImageChange}
              error={errors.image}
              disabled={submitting}
            />

            <View style={styles.field}>
              <Text style={styles.label}>Number Plate Number</Text>
              <TextInput
                style={[styles.input, errors.plateNumber ? styles.inputError : null]}
                placeholder="Example: UP32AB1234"
                placeholderTextColor="#888"
                value={plateNumber}
                onChangeText={onPlateChange}
                autoCapitalize="characters"
                autoCorrect={false}
                editable={!submitting}
              />
              {errors.plateNumber ? <Text style={styles.error}>{errors.plateNumber}</Text> : null}
            </View>

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

// Field / input / error values match ApplicationFormScreen so the text input
// reads as the same form language used everywhere else in the app.
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
  field: { marginBottom: 18 },
  label: { fontSize: 15, fontWeight: '600', color: '#000000', marginBottom: 5, marginLeft: 2 },
  input: {
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 8,
    padding: 10,
    fontSize: 15.5,
    backgroundColor: '#FAFAFA',
    marginTop: 2,
    color: '#222',
  },
  inputError: { borderColor: '#E55B13' },
  error: { color: '#E55B13', fontSize: 12.5, marginTop: 2, marginLeft: 2, fontWeight: 'bold' },
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
