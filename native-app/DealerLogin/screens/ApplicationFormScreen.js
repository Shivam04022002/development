import React, { useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  Image, Modal, Alert, Platform, KeyboardAvoidingView, ActivityIndicator
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearSession } from '../utils/SecureStorage';
import { Picker } from '@react-native-picker/picker';
import Navbar from '../components/Navbar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { API_BASE } from '../config';

// Aadhaar Helpers
const formatAadhaar = (value) => {
  const digits = value.replace(/\D/g, '');
  return digits.slice(0, 12);
};

const isValidAadhaar = (value) => {
  if (!value) return false;
  return /^[2-9][0-9]{11}$/.test(value);
};

// PAN Helpers
const formatPAN = (value) => {
  const alphanumeric = value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return alphanumeric.slice(0, 10);
};

const isValidPAN = (value) => {
  if (!value) return false;
  return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(value);
};

const FieldText = React.memo(function FieldText({ label, value, onChange, err, editable = true, multiline = false, keyboardType = 'default', autoCapitalize = 'sentences', maxLength }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value || ''}
        onChangeText={onChange}
        editable={editable}
        multiline={multiline}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        maxLength={maxLength}
        style={[styles.input, !editable && { backgroundColor: '#f0f0f0' }]}
      />
      {err ? <Text style={styles.error}>{err}</Text> : null}
    </View>
  );
});

const FieldImage = React.memo(function FieldImage({ label, value, onPick, err }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity onPress={onPick} style={styles.imagePicker}>
        {value ? (
          <Image
            source={{ uri: typeof value === 'string' ? value : value?.uri }}
            style={styles.imagePreview}
          />
        ) : (
          <Text style={{ color: '#3450A1' }}>Select Image</Text>
        )}
      </TouchableOpacity>
      {err ? <Text style={styles.error}>{err}</Text> : null}
    </View>
  );
});

const FieldDocument = React.memo(function FieldDocument({ label, value, onPickImage, onPickPDF, err }) {
  const isPDF = value?.type === 'application/pdf' || (typeof value === 'object' && value?.name?.endsWith('.pdf'));
  const isImage = value && !isPDF;
  const imageUri = typeof value === 'string' ? value : value?.uri;

  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.docPickerContainer}>
        {value ? (
          <View style={styles.docPreview}>
            {isPDF ? (
              <View style={styles.pdfPreview}>
                <Text style={styles.pdfIcon}>📄</Text>
                <Text style={styles.pdfName} numberOfLines={1}>{value?.name || 'Document.pdf'}</Text>
              </View>
            ) : (
              <Image
                source={{ uri: imageUri }}
                style={styles.imagePreview}
              />
            )}
          </View>
        ) : null}
        <View style={styles.docButtonRow}>
          <TouchableOpacity onPress={onPickImage} style={styles.docBtn}>
            <Text style={styles.docBtnText}>Select Image</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onPickPDF} style={[styles.docBtn, styles.docBtnPDF]}>
            <Text style={[styles.docBtnText, { color: '#D84315' }]}>Select PDF</Text>
          </TouchableOpacity>
        </View>
      </View>
      {err ? <Text style={styles.error}>{err}</Text> : null}
    </View>
  );
});

const generateFormId = () => 'FORM-' + Date.now().toString().slice(-6);

export default function ApplicationFormScreen({ navigation }) {
  const [user, setUser] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  useFocusEffect(
    useCallback(() => {
      const loadUser = async () => {
        const userJson = await AsyncStorage.getItem('userInfo');
        if (userJson) setUser(JSON.parse(userJson));
      };
      loadUser();
    }, [])
  );

  const handleLogout = async () => {
    console.log('[ApplicationForm] Logging out (lock session)');
    await clearSession();
    navigation.replace("Login");
  };

  const [applicantFormId] = useState(generateFormId());
  const [coApplicantFormId] = useState(generateFormId());

  const [showVehicleDialog, setShowVehicleDialog] = useState(false);

  const [applicantForm, setApplicantForm] = useState({
    photo: null,
    firstName: '', surname: '', mobile: '', email: '', gender: '', fatherName: '', dateOfBirth: null, aadharNo: '', panNo: '',
    address: '', city: '', state: '', pincode: '', policeStation: '', postOffice: '',
    aadharFront: null, aadharBack: null, panImage: null,
    coApplicantName: '',
  });

  const [coApplicantForm, setCoApplicantForm] = useState({
    photo: null,
    name: '', mobile: '', email: '', gender: '', fatherName: '', dateOfBirth: null, aadharNo: '', panNo: '',
    address: '', pincode: '', policeStation: '', postOffice: '',
    aadharFront: null, aadharBack: null, panImage: null,
    form60: null, relation: '', customRelation: '', documentType: '',
  });

  const [vehicleForm, setVehicleForm] = useState({
    brandName: '', modelName: '', priceOfVehicle: '', financeRequired: '', tenure: '', vehiclePhoto: null
  });

  const [errors, setErrors] = useState({ applicant: {}, coApplicant: {}, form: '' });
  const [showDatePicker, setShowDatePicker] = useState({ which: '', visible: false });

  const updateApplicantForm = useCallback((field, value) => {
    setApplicantForm(prev => ({ ...prev, [field]: value }));
    setErrors(prev => ({ ...prev, applicant: { ...prev.applicant, [field]: '' } }));
  }, []);
  const updateCoApplicantForm = useCallback((field, value) => {
    setCoApplicantForm(prev => ({ ...prev, [field]: value }));
    setErrors(prev => ({ ...prev, coApplicant: { ...prev.coApplicant, [field]: '' } }));
  }, []);

  // Stable callback hooks (must be at top level)

  // Stable handlers for applicant fields
  const onChangeApplicantFirstName = useCallback((v) => updateApplicantForm('firstName', v), [updateApplicantForm]);
  const onChangeApplicantSurname = useCallback((v) => updateApplicantForm('surname', v), [updateApplicantForm]);
  const onChangeApplicantMobile = useCallback((v) => updateApplicantForm('mobile', v), [updateApplicantForm]);
  const onChangeApplicantEmail = useCallback((v) => updateApplicantForm('email', v), [updateApplicantForm]);
  const onChangeApplicantGender = useCallback((v) => updateApplicantForm('gender', v), [updateApplicantForm]);
  const onChangeApplicantFather = useCallback((v) => updateApplicantForm('fatherName', v), [updateApplicantForm]);
  const onChangeApplicantAadhar = useCallback((v) => updateApplicantForm('aadharNo', formatAadhaar(v)), [updateApplicantForm]);
  const onChangeApplicantPAN = useCallback((v) => updateApplicantForm('panNo', formatPAN(v)), [updateApplicantForm]);
  const onChangeApplicantAddress = useCallback((v) => updateApplicantForm('address', v), [updateApplicantForm]);
  const onChangeApplicantCity = useCallback((v) => updateApplicantForm('city', v), [updateApplicantForm]);
  const onChangeApplicantState = useCallback((v) => updateApplicantForm('state', v), [updateApplicantForm]);
  const onChangeApplicantPincode = useCallback((v) => updateApplicantForm('pincode', v), [updateApplicantForm]);
  const onChangeApplicantPoliceStation = useCallback((v) => updateApplicantForm('policeStation', v), [updateApplicantForm]);
  const onChangeApplicantPostOffice = useCallback((v) => updateApplicantForm('postOffice', v), [updateApplicantForm]);
  const onChangeApplicantCoApplicantName = useCallback((v) => updateApplicantForm('coApplicantName', v), [updateApplicantForm]);

  // Stable handlers for co-applicant fields
  const onChangeCoApplicantName = useCallback((v) => updateCoApplicantForm('name', v), [updateCoApplicantForm]);
  const onChangeCoApplicantMobile = useCallback((v) => updateCoApplicantForm('mobile', v), [updateCoApplicantForm]);
  const onChangeCoApplicantEmail = useCallback((v) => updateCoApplicantForm('email', v), [updateCoApplicantForm]);
  const onChangeCoApplicantGender = useCallback((v) => updateCoApplicantForm('gender', v), [updateCoApplicantForm]);
  const onChangeCoApplicantFather = useCallback((v) => updateCoApplicantForm('fatherName', v), [updateCoApplicantForm]);
  const onChangeCoApplicantAadhar = useCallback((v) => updateCoApplicantForm('aadharNo', formatAadhaar(v)), [updateCoApplicantForm]);
  const onChangeCoApplicantAddress = useCallback((v) => updateCoApplicantForm('address', v), [updateCoApplicantForm]);
  const onChangeCoApplicantPincode = useCallback((v) => updateCoApplicantForm('pincode', v), [updateCoApplicantForm]);
  const onChangeCoApplicantPoliceStation = useCallback((v) => updateCoApplicantForm('policeStation', v), [updateCoApplicantForm]);
  const onChangeCoApplicantPostOffice = useCallback((v) => updateCoApplicantForm('postOffice', v), [updateCoApplicantForm]);
  const onChangeCoApplicantRelation = useCallback((v) => updateCoApplicantForm('relation', v), [updateCoApplicantForm]);
  const onChangeCoApplicantPAN = useCallback((v) => updateCoApplicantForm('panNo', formatPAN(v)), [updateCoApplicantForm]);
  const onChangeCoApplicantDocumentType = useCallback((v) => updateCoApplicantForm('documentType', v), [updateCoApplicantForm]);
  const onChangeCoApplicantCustomRelation = useCallback((v) => updateCoApplicantForm('customRelation', v), [updateCoApplicantForm]);

  // Stable image/document picker handlers — moved from JSX useCallback to top level
  const onPickApplicantPhoto = useCallback(() => selectImage(url => updateApplicantForm('photo', url)), [updateApplicantForm]);
  const onPickApplicantAadharFrontImage = useCallback(() => selectImage(url => updateApplicantForm('aadharFront', url)), [updateApplicantForm]);
  const onPickApplicantAadharFrontPDF = useCallback(() => selectPDF(url => updateApplicantForm('aadharFront', url)), [updateApplicantForm]);
  const onPickApplicantAadharBackImage = useCallback(() => selectImage(url => updateApplicantForm('aadharBack', url)), [updateApplicantForm]);
  const onPickApplicantAadharBackPDF = useCallback(() => selectPDF(url => updateApplicantForm('aadharBack', url)), [updateApplicantForm]);
  const onPickApplicantPanImage = useCallback(() => selectImage(url => updateApplicantForm('panImage', url)), [updateApplicantForm]);
  const onPickApplicantPanPDF = useCallback(() => selectPDF(url => updateApplicantForm('panImage', url)), [updateApplicantForm]);

  const onPickCoApplicantPhoto = useCallback(() => selectImage(url => updateCoApplicantForm('photo', url)), [updateCoApplicantForm]);
  const onPickCoApplicantAadharFrontImage = useCallback(() => selectImage(url => updateCoApplicantForm('aadharFront', url)), [updateCoApplicantForm]);
  const onPickCoApplicantAadharFrontPDF = useCallback(() => selectPDF(url => updateCoApplicantForm('aadharFront', url)), [updateCoApplicantForm]);
  const onPickCoApplicantAadharBackImage = useCallback(() => selectImage(url => updateCoApplicantForm('aadharBack', url)), [updateCoApplicantForm]);
  const onPickCoApplicantAadharBackPDF = useCallback(() => selectPDF(url => updateCoApplicantForm('aadharBack', url)), [updateCoApplicantForm]);
  const onPickCoApplicantPanImage = useCallback(() => selectImage(url => updateCoApplicantForm('panImage', url)), [updateCoApplicantForm]);
  const onPickCoApplicantPanPDF = useCallback(() => selectPDF(url => updateCoApplicantForm('panImage', url)), [updateCoApplicantForm]);
  const onPickCoApplicantForm60 = useCallback(() => selectImage(url => updateCoApplicantForm('form60', url)), [updateCoApplicantForm]);

  // Vehicle photo picker
  const onPickVehiclePhoto = useCallback(() => selectImage(img => setVehicleForm(prev => ({ ...prev, vehiclePhoto: img }))), []);


  const selectImage = async (onPicked) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission denied', 'We need media permission to select images.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.5,
    });

    if (!result.canceled && result.assets.length > 0) {
      const img = result.assets[0];
      const imageObj = {
        uri: img.uri,
        type: 'image/jpeg',
        name: `upload-${Date.now()}.jpg`
      };
      onPicked(imageObj);
    }
  };

  const selectPDF = async (onPicked) => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const doc = result.assets[0];
        const pdfObj = {
          uri: doc.uri,
          type: 'application/pdf',
          name: doc.name || `document-${Date.now()}.pdf`,
        };
        onPicked(pdfObj);
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to select PDF file.');
      console.error('PDF selection error:', err);
    }
  };

  const handleDatePicked = (which, event, date) => {
    setShowDatePicker({ which: '', visible: false });
    if (!date) return;
    if (which === 'applicant') updateApplicantForm('dateOfBirth', date);
    else if (which === 'coApplicant') updateCoApplicantForm('dateOfBirth', date);
  };

  const validateAndProceed = () => {
    const applicantReq = ['photo', 'firstName', 'surname', 'mobile', 'gender', 'fatherName', 'dateOfBirth', 'aadharNo', 'panNo', 'address', 'city', 'state', 'aadharFront', 'aadharBack', 'panImage', 'postOffice'];
    const coApplicantReq = ['photo', 'name', 'mobile', 'gender', 'fatherName', 'dateOfBirth', 'aadharNo', 'address', 'aadharFront', 'aadharBack', 'postOffice', 'documentType', 'relation'];

    let appErr = {}, coAppErr = {}, globalErr = '';

    applicantReq.forEach(f => { if (!applicantForm[f]) appErr[f] = 'Required'; });
    coApplicantReq.forEach(f => { if (!coApplicantForm[f]) coAppErr[f] = 'Required'; });

    // Custom relation validation
    if (coApplicantForm.relation === 'Others' && !coApplicantForm.customRelation?.trim()) {
      coAppErr.customRelation = 'Please specify the relation';
    }

    // Aadhaar validation for Applicant
    if (applicantForm.aadharNo && !isValidAadhaar(applicantForm.aadharNo)) {
      appErr.aadharNo = 'Invalid Aadhaar. Must be 12 digits starting with 2-9.';
    }

    // PAN validation for Applicant
    if (applicantForm.panNo && !isValidPAN(applicantForm.panNo)) {
      appErr.panNo = 'Invalid PAN. Format: ABCDE1234F';
    }

    // Aadhaar validation for Co-Applicant
    if (coApplicantForm.aadharNo && !isValidAadhaar(coApplicantForm.aadharNo)) {
      coAppErr.aadharNo = 'Invalid Aadhaar. Must be 12 digits starting with 2-9.';
    }

    // Mobile Validation
    if (applicantForm.mobile && applicantForm.mobile.length < 10) {
      appErr.mobile = 'Mobile number must be 10 digits';
    }
    if (coApplicantForm.mobile && coApplicantForm.mobile.length < 10) {
      coAppErr.mobile = 'Mobile number must be 10 digits';
    }

    // Email Validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (applicantForm.email && !emailRegex.test(applicantForm.email)) {
      appErr.email = 'Invalid email format';
    }

    // PAN validation for Co-Applicant (only if documentType is 'pan')
    if (coApplicantForm.documentType === 'pan') {
      if (!coApplicantForm.panNo) coAppErr.panNo = 'PAN required';
      else if (!isValidPAN(coApplicantForm.panNo)) {
        coAppErr.panNo = 'Invalid PAN. Format: ABCDE1234F';
      }
      if (!coApplicantForm.panImage) coAppErr.panImage = 'PAN image required';
    } else if (coApplicantForm.documentType === 'form60') {
      if (!coApplicantForm.form60) coAppErr.form60 = 'Form 60 required';
    }

    if (Object.keys(appErr).length > 0 || Object.keys(coAppErr).length > 0) {
      globalErr = 'Fill all required fields correctly.';
      setErrors({ applicant: appErr, coApplicant: coAppErr, form: globalErr });
      Alert.alert('Form Incomplete', globalErr);
      return;
    }

    setErrors({ applicant: {}, coApplicant: {}, form: '' });
    setShowVehicleDialog(true);
  };



  const uploadFileToBackend = async (file, { retries = 2, timeoutMs = 60000 } = {}) => {
    const isPDF = file.type === 'application/pdf';

    const buildFormData = () => {
      const fd = new FormData();
      fd.append("photo", {
        uri: file.uri,
        type: file.type || 'image/jpeg',
        name: file.name || (isPDF ? `upload-${Date.now()}.pdf` : `upload-${Date.now()}.jpg`),
      });
      return fd;
    };

    const token = await AsyncStorage.getItem('userToken');

    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(`${API_BASE}/api/upload`, {
          method: 'POST',
          body: buildFormData(),
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const responseData = await response.json();
        return responseData.url;
      } catch (err) {
        clearTimeout(timer);
        lastErr = err;
        console.warn(`⚠️ [UPLOAD RETRY ${attempt + 1}/${retries + 1}] ${file.name}: ${err.message}`);
        if (attempt < retries) {
          // Small backoff before retrying
          await new Promise(r => setTimeout(r, 600 * (attempt + 1)));
        }
      }
    }

    console.error(`❌ [UPLOAD FAIL] ${file.name}: ${lastErr?.message}`);
    throw new Error(`Upload failed for ${file.name || 'file'}: ${lastErr?.message || 'Unknown error'}`);
  };

  // Run async tasks with a concurrency cap so we don't overload WiFi / backend.
  const runWithConcurrency = async (tasks, limit = 3) => {
    const results = new Array(tasks.length);
    let next = 0;
    const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
      while (true) {
        const i = next++;
        if (i >= tasks.length) return;
        results[i] = await tasks[i]();
      }
    });
    await Promise.all(workers);
    return results;
  };

  const handleFinalSubmit = async () => {
    if (isSubmitting) return; // Prevent double-submit

    setIsSubmitting(true);
    setUploadProgress(0);

    try {
      const token = await AsyncStorage.getItem('userToken');
      const userInfo = await AsyncStorage.getItem('userInfo');
      const currentUser = JSON.parse(userInfo);

      if (!token || !currentUser) {
        Alert.alert('Error', 'Session expired. Please login again.');
        navigation.replace('Login');
        return;
      }

      // ── Collect every file that needs uploading across all forms ──
      const applicantEntries = Object.entries(applicantForm).filter(([, v]) => v?.uri && !v.uri.startsWith('http'));
      const coApplicantEntries = Object.entries(coApplicantForm).filter(([, v]) => v?.uri && !v.uri.startsWith('http'));
      const needsVehicleUpload = vehicleForm.vehiclePhoto?.uri && !vehicleForm.vehiclePhoto.uri.startsWith('http');

      const totalFiles = applicantEntries.length + coApplicantEntries.length + (needsVehicleUpload ? 1 : 0);
      let completed = 0;
      const bumpProgress = () => {
        completed += 1;
        if (totalFiles > 0) {
          setUploadProgress(Math.round((completed / totalFiles) * 100));
        }
      };

      const uploadOne = async (key, value) => {
        try {
          const url = await uploadFileToBackend(value);
          bumpProgress();
          return [key, url];
        } catch (uploadErr) {
          throw new Error(`Failed to upload ${key}: ${uploadErr.message}`);
        }
      };

      // ── Upload all files with a concurrency cap of 3 ──
      // Tag each task so we know which form + key to assign the resulting URL to.
      const allTasks = [
        ...applicantEntries.map(([k, v]) => ({ form: 'applicant', key: k, file: v })),
        ...coApplicantEntries.map(([k, v]) => ({ form: 'coApplicant', key: k, file: v })),
        ...(needsVehicleUpload ? [{ form: 'vehicle', key: 'vehiclePhoto', file: vehicleForm.vehiclePhoto }] : []),
      ];

      const taskFns = allTasks.map((t) => async () => {
        const [, url] = await uploadOne(t.key, t.file);
        return { ...t, url };
      });

      const uploadResults = await runWithConcurrency(taskFns, 3);

      const applicantUploaded = { ...applicantForm };
      const coApplicantUploaded = { ...coApplicantForm };
      let vehiclePhotoUrlParallel = '';
      uploadResults.forEach(({ form, key, url }) => {
        if (form === 'applicant') applicantUploaded[key] = url;
        else if (form === 'coApplicant') coApplicantUploaded[key] = url;
        else if (form === 'vehicle') vehiclePhotoUrlParallel = url;
      });

      // Serialize dates
      if (applicantUploaded.dateOfBirth instanceof Date) {
        applicantUploaded.dateOfBirth = applicantUploaded.dateOfBirth.toISOString();
      }
      if (coApplicantUploaded.dateOfBirth instanceof Date) {
        coApplicantUploaded.dateOfBirth = coApplicantUploaded.dateOfBirth.toISOString();
      }

      // Resolve relations
      if (coApplicantUploaded.relation === 'Others') {
        coApplicantUploaded.relation = coApplicantUploaded.customRelation || 'Others';
      }
      delete coApplicantUploaded.customRelation;

      // Vehicle photo URL (already uploaded above in parallel, or already a remote URL)
      const vehiclePhotoUrl = vehicleForm.vehiclePhoto?.uri?.startsWith('http')
        ? vehicleForm.vehiclePhoto.uri
        : (vehiclePhotoUrlParallel || '');
      
      // ── Safety: ensure all image fields are strings (not objects) ──
      const ensureString = (val) => {
        if (!val) return '';
        if (typeof val === 'string') return val;
        if (typeof val === 'object' && val.uri && val.uri.startsWith('http')) return val.uri;
        if (typeof val === 'object') {
          console.warn('⚠️ [PAYLOAD] Image field is still an object (not uploaded?):', JSON.stringify(val).substring(0, 100));
          return '';
        }
        return String(val);
      };

      // Convert image fields to strings
      const imageKeys = ['photo', 'aadharFront', 'aadharBack', 'panImage', 'form60'];
      for (const key of imageKeys) {
        if (key in applicantUploaded) applicantUploaded[key] = ensureString(applicantUploaded[key]);
        if (key in coApplicantUploaded) coApplicantUploaded[key] = ensureString(coApplicantUploaded[key]);
      }

      const payload = {
        applicant: {
          ...applicantUploaded,
          mobileNumber: applicantUploaded.mobile,
          // firstName / surname are the structured values; `name` is composed
          // from them so existing screens and records keep working unchanged.
          name: `${applicantUploaded.firstName || ''} ${applicantUploaded.surname || ''}`.trim(),
          email: (applicantUploaded.email && applicantUploaded.email.trim()) ? applicantUploaded.email.trim() : 'N/A',
          formId: applicantFormId,
        },
        coApplicant: { 
          ...coApplicantUploaded, 
          email: (coApplicantUploaded.email && coApplicantUploaded.email.trim()) ? coApplicantUploaded.email.trim() : 'N/A', 
          formId: coApplicantFormId 
        },
        vehicleDetails: {
          brandName: vehicleForm.brandName,
          modelName: vehicleForm.modelName,
          priceOfVehicle: vehicleForm.priceOfVehicle,
          financeRequired: vehicleForm.financeRequired,
          tenure: vehicleForm.tenure,
          vehiclePhoto: ensureString(vehiclePhotoUrl),
          formId: applicantFormId,
        }
      };

      // ── Debug: log all image fields in the final payload ──
      console.log('📤 [SUBMIT] Final payload image fields:');
      console.log('  applicant.photo:', typeof payload.applicant.photo, payload.applicant.photo ? payload.applicant.photo.substring(0, 60) : 'EMPTY');
      console.log('  applicant.aadharFront:', typeof payload.applicant.aadharFront, payload.applicant.aadharFront ? payload.applicant.aadharFront.substring(0, 60) : 'EMPTY');
      console.log('  applicant.aadharBack:', typeof payload.applicant.aadharBack, payload.applicant.aadharBack ? payload.applicant.aadharBack.substring(0, 60) : 'EMPTY');
      console.log('  applicant.panImage:', typeof payload.applicant.panImage, payload.applicant.panImage ? payload.applicant.panImage.substring(0, 60) : 'EMPTY');
      console.log('  coApplicant.photo:', typeof payload.coApplicant.photo, payload.coApplicant.photo ? payload.coApplicant.photo.substring(0, 60) : 'EMPTY');
      console.log('  coApplicant.aadharFront:', typeof payload.coApplicant.aadharFront, payload.coApplicant.aadharFront ? payload.coApplicant.aadharFront.substring(0, 60) : 'EMPTY');
      console.log('  coApplicant.aadharBack:', typeof payload.coApplicant.aadharBack, payload.coApplicant.aadharBack ? payload.coApplicant.aadharBack.substring(0, 60) : 'EMPTY');
      console.log('  vehicleDetails.vehiclePhoto:', typeof payload.vehicleDetails.vehiclePhoto, payload.vehicleDetails.vehiclePhoto ? payload.vehicleDetails.vehiclePhoto.substring(0, 60) : 'EMPTY');

      // ── Hand off to the CIBIL status screen ──
      // It performs POST /api/applications/submit (same endpoint, same payload)
      // so the dealer watches the CIBIL meter while the check runs, then sees
      // the outcome the backend returned instead of dropping straight back.
      setShowVehicleDialog(false);
      navigation.replace('CibilStatus', { payload, formId: applicantFormId });
    } catch (err) {
      console.error('❌ Error:', err?.message);
      
      let errorDetails = '';
      if (err?.response) {
        if (typeof err.response.data === 'string' && err.response.data.includes('<html')) {
          errorDetails = `\n\nServer Response: 503/WAF Blocked. Check NGINX logs.`;
        } else {
          errorDetails = `\n\nServer Error: ${JSON.stringify(err.response.data)}`;
        }
      }
      
      Alert.alert(
        'Submission Failed', 
        `${err.message}${errorDetails}`
      );
    } finally {
      setIsSubmitting(false);
      setUploadProgress(0);
    }
  };

  // --- UI ---
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff7ed' }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
      >
        <View style={{ flex: 1, backgroundColor: "#fff7ed" }}>
          <Navbar user={user} onLogout={handleLogout} />
            <ScrollView contentContainerStyle={{ paddingBottom: 40 }} scrollEnabled={!isSubmitting}>
              {/* Applicant Card */}
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Applicant Form</Text>
                <Text style={styles.formId}>Form ID: {applicantFormId}</Text>
                <View style={styles.section}>
                  <FieldImage label="Photo (passport size)" value={applicantForm.photo}
                    onPick={onPickApplicantPhoto} err={errors.applicant.photo} />
                  <FieldText label="First Name" value={applicantForm.firstName} onChange={onChangeApplicantFirstName} err={errors.applicant.firstName} />
                  <FieldText label="Surname" value={applicantForm.surname} onChange={onChangeApplicantSurname} err={errors.applicant.surname} />
                  <FieldText label="Mobile Number" value={applicantForm.mobile} onChange={onChangeApplicantMobile} err={errors.applicant.mobile} keyboardType="numeric" maxLength={10} />
                  <FieldText label="Email (Optional)" value={applicantForm.email} onChange={onChangeApplicantEmail} err={errors.applicant.email} keyboardType="email-address" autoCapitalize="none" />
                  <View style={{ marginBottom: 12 }}>
                    <Text style={styles.label}>Gender</Text>
                    <View style={styles.pickerWrapper}>
                      <Picker
                        selectedValue={applicantForm.gender}
                        onValueChange={onChangeApplicantGender}
                        style={{ width: '100%', color: '#222' }}
                      >
                        <Picker.Item label="Select gender..." value="" />
                        <Picker.Item label="Male" value="Male" />
                        <Picker.Item label="Female" value="Female" />
                        <Picker.Item label="Other" value="Other" />
                      </Picker>
                    </View>
                    {errors.applicant.gender ? <Text style={styles.error}>{errors.applicant.gender}</Text> : null}
                  </View>
                  <FieldText label="Father's Name" value={applicantForm.fatherName} onChange={onChangeApplicantFather} err={errors.applicant.fatherName} />
                  <View style={styles.row}>
                    <TouchableOpacity style={{ flex: 1 }} onPress={() => setShowDatePicker({ which: 'applicant', visible: true })}>
                      <FieldText label="Date of Birth" value={applicantForm.dateOfBirth ? applicantForm.dateOfBirth.toISOString().slice(0, 10) : ''} editable={false} err={errors.applicant.dateOfBirth} />
                    </TouchableOpacity>
                    <FieldText label="Age" value={applicantForm.dateOfBirth ? (new Date().getFullYear() - applicantForm.dateOfBirth.getFullYear()).toString() : ''} editable={false} />
                  </View>
                  <FieldText label="Aadhar Number" value={applicantForm.aadharNo} onChange={onChangeApplicantAadhar} err={errors.applicant.aadharNo} keyboardType="numeric" />
                  <FieldText
                    label="PAN Number"
                    value={applicantForm.panNo}
                    onChange={onChangeApplicantPAN}
                    err={errors.applicant.panNo}
                    autoCapitalize="characters"
                  />
                  <FieldText label="Address" value={applicantForm.address} onChange={onChangeApplicantAddress} err={errors.applicant.address} multiline />
                  <FieldText label="City" value={applicantForm.city} onChange={onChangeApplicantCity} err={errors.applicant.city} />
                  <FieldText label="State" value={applicantForm.state} onChange={onChangeApplicantState} err={errors.applicant.state} />
                  <FieldText label="Pincode" value={applicantForm.pincode} onChange={onChangeApplicantPincode} err={errors.applicant.pincode} keyboardType="numeric" />
                  <FieldText label="Nearby Police Station" value={applicantForm.policeStation} onChange={onChangeApplicantPoliceStation} err={errors.applicant.policeStation} />
                  <FieldDocument label="Aadhaar Card (Front)"
                    value={applicantForm.aadharFront}
                    onPickImage={onPickApplicantAadharFrontImage}
                    onPickPDF={onPickApplicantAadharFrontPDF}
                    err={errors.applicant.aadharFront} />
                  <FieldDocument label="Aadhaar Card (Back)"
                    value={applicantForm.aadharBack}
                    onPickImage={onPickApplicantAadharBackImage}
                    onPickPDF={onPickApplicantAadharBackPDF}
                    err={errors.applicant.aadharBack} />
                  <FieldDocument label="PAN Card"
                    value={applicantForm.panImage}
                    onPickImage={onPickApplicantPanImage}
                    onPickPDF={onPickApplicantPanPDF}
                    err={errors.applicant.panImage} />
                  <FieldText label="Post Office" value={applicantForm.postOffice} onChange={onChangeApplicantPostOffice} err={errors.applicant.postOffice} />
                  <FieldText label="Co-Applicant Name" value={applicantForm.coApplicantName} onChange={onChangeApplicantCoApplicantName} />
                </View>
              </View>
  
              {/* Co-Applicant Card */}
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Co-Applicant Form</Text>
                <Text style={styles.formId}>Form ID: {coApplicantFormId}</Text>
                <View style={styles.section}>
                  <FieldImage label="Photo (passport size)" value={coApplicantForm.photo}
                    onPick={onPickCoApplicantPhoto} err={errors.coApplicant.photo} />
                  <FieldText label="Name" value={coApplicantForm.name} onChange={onChangeCoApplicantName} err={errors.coApplicant.name} />
                  <FieldText label="Mobile Number" value={coApplicantForm.mobile} onChange={onChangeCoApplicantMobile} err={errors.coApplicant.mobile} keyboardType="numeric" maxLength={10} />
                  <FieldText label="Email (Optional)" value={coApplicantForm.email} onChange={onChangeCoApplicantEmail} err={errors.coApplicant.email} keyboardType="email-address" autoCapitalize="none" />
                  <View style={{ marginBottom: 12 }}>
                    <Text style={styles.label}>Gender</Text>
                    <View style={styles.pickerWrapper}>
                      <Picker
                        selectedValue={coApplicantForm.gender}
                        onValueChange={onChangeCoApplicantGender}
                        style={{ width: '100%', color: '#222' }}
                      >
                        <Picker.Item label="Select gender..." value="" />
                        <Picker.Item label="Male" value="Male" />
                        <Picker.Item label="Female" value="Female" />
                        <Picker.Item label="Other" value="Other" />
                      </Picker>
                    </View>
                    {errors.coApplicant.gender ? <Text style={styles.error}>{errors.coApplicant.gender}</Text> : null}
                  </View>
                  <FieldText label="Father's Name" value={coApplicantForm.fatherName} onChange={onChangeCoApplicantFather} err={errors.coApplicant.fatherName} />
                  <View style={styles.row}>
                    <TouchableOpacity style={{ flex: 1 }} onPress={() => setShowDatePicker({ which: 'coApplicant', visible: true })}>
                      <FieldText label="Date of Birth" value={coApplicantForm.dateOfBirth ? coApplicantForm.dateOfBirth.toISOString().slice(0, 10) : ''} editable={false} err={errors.coApplicant.dateOfBirth} />
                    </TouchableOpacity>
                    <FieldText label="Age" value={coApplicantForm.dateOfBirth ? (new Date().getFullYear() - coApplicantForm.dateOfBirth.getFullYear()).toString() : ''} editable={false} />
                  </View>
                  <FieldText label="Aadhar Number" value={coApplicantForm.aadharNo} onChange={onChangeCoApplicantAadhar} err={errors.coApplicant.aadharNo} keyboardType="numeric" />
                  <FieldText label="Address" value={coApplicantForm.address} onChange={onChangeCoApplicantAddress} err={errors.coApplicant.address} multiline />
                  <FieldText label="Pincode" value={coApplicantForm.pincode} onChange={onChangeCoApplicantPincode} err={errors.coApplicant.pincode} keyboardType="numeric" />
                  <FieldText label="Nearby Police Station" value={coApplicantForm.policeStation} onChange={onChangeCoApplicantPoliceStation} err={errors.coApplicant.policeStation} />
                  <FieldDocument label="Aadhaar Card (Front)"
                    value={coApplicantForm.aadharFront}
                    onPickImage={onPickCoApplicantAadharFrontImage}
                    onPickPDF={onPickCoApplicantAadharFrontPDF}
                    err={errors.coApplicant.aadharFront} />
                  <FieldDocument label="Aadhaar Card (Back)"
                    value={coApplicantForm.aadharBack}
                    onPickImage={onPickCoApplicantAadharBackImage}
                    onPickPDF={onPickCoApplicantAadharBackPDF}
                    err={errors.coApplicant.aadharBack} />
                  <Text style={{ marginTop: 12, fontWeight: 'bold' }}>Document Type</Text>
                  <View style={styles.row}>
                    <TouchableOpacity
                      style={[styles.radioBtn, coApplicantForm.documentType === 'pan' && styles.radioActive]}
                      onPress={() => onChangeCoApplicantDocumentType('pan')}
                    >
                      <Text style={{ color: '#222' }}>PAN Card</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.radioBtn, coApplicantForm.documentType === 'form60' && styles.radioActive]}
                      onPress={() => onChangeCoApplicantDocumentType('form60')}
                    >
                      <Text style={{ color: '#222' }}>Form 60</Text>
                    </TouchableOpacity>
                  </View>
                  {coApplicantForm.documentType === 'pan' && (
                    <>
                      <FieldText
                        label="PAN Number"
                        value={coApplicantForm.panNo}
                        onChange={onChangeCoApplicantPAN}
                        err={errors.coApplicant.panNo}
                        autoCapitalize="characters"
                      />
  
                      <FieldDocument
                        label="PAN Card"
                        value={coApplicantForm.panImage}
                        onPickImage={onPickCoApplicantPanImage}
                        onPickPDF={onPickCoApplicantPanPDF}
                        err={errors.coApplicant.panImage}
                      />
                    </>
                  )}
                  {coApplicantForm.documentType === 'form60' && (
                    <FieldImage
                      label="Form 60"
                      value={coApplicantForm.form60}
                      onPick={onPickCoApplicantForm60}
                      err={errors.coApplicant.form60}
                    />
                  )}
  
                  <FieldText label="Post Office" value={coApplicantForm.postOffice} onChange={onChangeCoApplicantPostOffice} err={errors.coApplicant.postOffice} />
  

                  <View style={{ marginBottom: 12 }}>
                    <Text style={styles.label}>Relation with Applicant</Text>
                    <View style={styles.pickerWrapper}>
                      <Picker
                        selectedValue={coApplicantForm.relation}
                        onValueChange={onChangeCoApplicantRelation}
                        style={{ width: '100%', color: '#222' }}
                      >
                        <Picker.Item label="Select relation..." value="" />
                        <Picker.Item label="Father" value="Father" />
                        <Picker.Item label="Mother" value="Mother" />
                        <Picker.Item label="Brother" value="Brother" />
                        <Picker.Item label="Husband" value="Husband" />
                        <Picker.Item label="Wife" value="Wife" />
                        <Picker.Item label="Son" value="Son" />
                        <Picker.Item label="Others" value="Others" />
                      </Picker>
                    </View>
                    {errors.coApplicant.relation ? <Text style={styles.error}>{errors.coApplicant.relation}</Text> : null}
  

                    {coApplicantForm.relation === 'Others' && (
                      <View style={{ marginTop: 8 }}>
                        <FieldText
                          label="Specify Relation"
                          value={coApplicantForm.customRelation}
                          onChange={onChangeCoApplicantCustomRelation}
                          err={errors.coApplicant.customRelation}
                        />
                      </View>
                    )}
                  </View>
                </View>
              </View>
  
              {/* Submit Button */}
              <TouchableOpacity
                style={[styles.submitBtn, isSubmitting && { backgroundColor: '#ccc' }]}
                onPress={validateAndProceed}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <ActivityIndicator color="#fff" size="small" />
                    <Text style={styles.submitText}>Uploading... {Math.min(uploadProgress, 100)}%</Text>
                  </View>
                ) : (
                  <Text style={styles.submitText}>Submit Application</Text>
                )}
              </TouchableOpacity>
  

              {isSubmitting && (
                <View style={styles.progressBarWrapper}>
                  <View style={[styles.progressBar, { width: `${Math.min(uploadProgress, 100)}%` }]} />
                  <Text style={styles.progressText}>{Math.min(uploadProgress, 100)}%</Text>
                </View>
              )}
  
  
  
              {/* Vehicle Details Modal */}
              <Modal visible={showVehicleDialog} animationType="slide" transparent>
                <View style={styles.modalBg}>
                  <ScrollView style={styles.vehicleModal} contentContainerStyle={{ paddingBottom: 20 }}>
                    <Text style={styles.cardTitle}>Vehicle Details</Text>
  
                    {/* Vehicle Photo */}
                    <FieldImage
                      label="Vehicle Photo"
                      value={vehicleForm.vehiclePhoto}
                      onPick={onPickVehiclePhoto}
                    />
  
  
  
                    <FieldText label="Brand Name" value={vehicleForm.brandName} onChange={v => setVehicleForm(prev => ({ ...prev, brandName: v }))} />
                    <FieldText label="Model Name" value={vehicleForm.modelName} onChange={v => setVehicleForm(prev => ({ ...prev, modelName: v }))} />
                    <FieldText label="Price of Vehicle" value={vehicleForm.priceOfVehicle} onChange={v => setVehicleForm(prev => ({ ...prev, priceOfVehicle: v }))} keyboardType="numeric" />
                    <FieldText label="Finance Required" value={vehicleForm.financeRequired} onChange={v => setVehicleForm(prev => ({ ...prev, financeRequired: v }))} keyboardType="numeric" />
  

                    <Text style={styles.label}>Tenure</Text>
                    <View style={styles.tenureRow}>
                      {['12', '15', '18', '21', '24'].map(opt => (
                        <TouchableOpacity
                          key={opt}
                          style={[
                            styles.tenureBtn,
                            vehicleForm.tenure === opt && styles.tenureBtnActive,
                          ]}
                          onPress={() => setVehicleForm(prev => ({ ...prev, tenure: opt }))}
                          activeOpacity={0.7}
                        >
                          <Text style={[
                            styles.tenureBtnText,
                            vehicleForm.tenure === opt && styles.tenureBtnTextActive,
                          ]}>
                            {opt} Months
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
  
                    <View style={styles.modalButtonRow}>
                      <TouchableOpacity
                        style={styles.modalCancelBtn}
                        onPress={() => setShowVehicleDialog(false)}
                        disabled={isSubmitting}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.modalCancelBtnText}>✕  Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.modalSubmitBtn,
                          isSubmitting && styles.modalSubmitBtnDisabled,
                        ]}
                        onPress={handleFinalSubmit}
                        disabled={isSubmitting}
                        activeOpacity={0.8}
                      >
                        {isSubmitting ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <ActivityIndicator color="#fff" size="small" />
                            <Text style={styles.modalSubmitBtnText}>
                              Uploading... {Math.min(uploadProgress, 100)}%
                            </Text>
                          </View>
                        ) : (
                          <Text style={styles.modalSubmitBtnText}>✓  Submit</Text>
                        )}
                      </TouchableOpacity>
                    </View>
  
                    {/* Progress bar inside modal */}
                    {isSubmitting && (
                      <View style={styles.modalProgressWrapper}>
                        <View style={styles.modalProgressTrack}>
                          <View style={[styles.modalProgressFill, { width: `${Math.min(uploadProgress, 100)}%` }]} />
                        </View>
                        <Text style={styles.modalProgressText}>
                          {Math.min(uploadProgress, 100)}% uploaded
                        </Text>
                      </View>
                    )}
                </ScrollView>
              </View>
            </Modal>

            {/* DatePicker Modal */}
            {showDatePicker.visible && (
              <DateTimePicker
                value={new Date()}
                mode="date"
                display="default"
                onChange={(e, date) => handleDatePicked(showDatePicker.which, e, date)}
              />
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  heading: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#FF7300',
    textAlign: 'center',
    marginVertical: 18,
  },
  card: {
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginVertical: 12,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#f2f2f2',
  },
  cardTitle: {
    fontWeight: 'bold',
    fontSize: 18,
    color: '#FF7300',
    marginBottom: 6,
  },
  formId: {
    fontSize: 12,
    color: '#A67435',
    marginBottom: 6,
    fontStyle: 'italic',
    textAlign: 'right',
  },
  section: {
    marginTop: 2,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 5,
    marginLeft: 2,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 8,
    padding: 10,
    fontSize: 15.5,
    backgroundColor: '#FAFAFA',
    marginBottom: 0,
    marginTop: 2,
    color: '#222',
  },
  error: {
    color: '#E55B13',
    fontSize: 12.5,
    marginTop: 2,
    marginLeft: 2,
    fontWeight: 'bold',
  },
  imagePicker: {
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 62,
    backgroundColor: '#FAFAFA',
    marginBottom: 2,
    marginTop: 2,
    flexDirection: 'row',
    gap: 7,
  },
  imagePreview: {
    width: 70,
    height: 70,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#FF7300',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginBottom: 5,
    marginTop: 3,
  },
  pickerWrapper: {
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 8,
    backgroundColor: '#FAFAFA',
    marginTop: 2,
    marginBottom: 0,
    paddingHorizontal: 4,
  },
  radioBtn: {
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 15,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginHorizontal: 5,
    backgroundColor: '#FFF',
  },
  radioActive: {
    backgroundColor: '#FFD3A3',
    borderColor: '#FF7300',
  },
  submitBtn: {
    backgroundColor: '#FF7300',
    borderRadius: 9,
    padding: 15,
    alignItems: 'center',
    marginTop: 20,
    flex: 1,
  },
  submitText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16.5,
    letterSpacing: 0.16,
  },
  cancelBtn: {
    backgroundColor: '#fff',
    borderRadius: 9,
    padding: 15,
    alignItems: 'center',
    marginTop: 20,
    borderWidth: 1.5,
    borderColor: '#FF7300',
  },
  cancelBtnText: {
    color: '#FF7300',
    fontWeight: 'bold',
    fontSize: 16.5,
    letterSpacing: 0.16,
  },

  /* ── Premium Modal Buttons ─────────── */
  modalButtonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
    paddingHorizontal: 2,
  },
  modalCancelBtn: {
    flex: 1,
    backgroundColor: '#FFF7F0',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.8,
    borderColor: '#FF7300',
    elevation: 2,
    shadowColor: '#FF7300',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  modalCancelBtnText: {
    color: '#E06500',
    fontWeight: '700',
    fontSize: 16,
    letterSpacing: 0.5,
  },
  modalSubmitBtn: {
    flex: 1.4,
    backgroundColor: '#FF7300',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#FF7300',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  modalSubmitBtnDisabled: {
    backgroundColor: '#BDBDBD',
    elevation: 1,
    shadowOpacity: 0.05,
  },
  modalSubmitBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
    letterSpacing: 0.5,
  },

  /* ── Modal Progress Bar ─────────────── */
  modalProgressWrapper: {
    marginTop: 16,
    paddingHorizontal: 2,
  },
  modalProgressTrack: {
    height: 10,
    backgroundColor: '#F0E4D7',
    borderRadius: 10,
    overflow: 'hidden',
  },
  modalProgressFill: {
    height: '100%',
    backgroundColor: '#FF7300',
    borderRadius: 10,
  },
  modalProgressText: {
    marginTop: 6,
    textAlign: 'right',
    fontSize: 12.5,
    color: '#8B6914',
    fontWeight: '600',
  },
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  vehicleModal: {
    backgroundColor: '#fff',
    borderRadius: 11,
    padding: 22,
    width: '93%',
    maxHeight: '85%',
    borderWidth: 1,
    borderColor: '#f2f2f2',
  },
  progressBarWrapper: {
    marginHorizontal: 16,
    marginTop: 8,
    height: 14,
    backgroundColor: '#f0f0f0',
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#FF7300',
    borderRadius: 10,
  },
  progressText: {
    position: 'absolute',
    top: -22,
    right: 10,
    fontSize: 13,
    color: '#555',
    fontWeight: '600',
  },
  docPickerContainer: {
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#FAFAFA',
    marginTop: 2,
  },
  docPreview: {
    alignItems: 'center',
    marginBottom: 10,
  },
  docButtonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  docBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#3450A1',
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
    backgroundColor: '#F0F4FF',
  },
  docBtnPDF: {
    borderColor: '#D84315',
    backgroundColor: '#FFF3E0',
  },
  docBtnText: {
    color: '#3450A1',
    fontWeight: '600',
    fontSize: 13.5,
  },
  pdfPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 8,
  },
  pdfIcon: {
    fontSize: 22,
  },
  pdfName: {
    fontSize: 13.5,
    color: '#D84315',
    fontWeight: '600',
    maxWidth: 200,
  },


  tenureRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 12,
    marginTop: 6,
  },
  tenureBtn: {
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: '#FAFAFA',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },
  tenureBtnActive: {
    backgroundColor: '#FF7300',
    borderColor: '#FF7300',
    elevation: 4,
    shadowColor: '#FF7300',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  tenureBtnText: {
    color: '#555',
    fontWeight: '600',
    fontSize: 14,
  },
  tenureBtnTextActive: {
    color: '#fff',
    fontWeight: 'bold',
  },
});
