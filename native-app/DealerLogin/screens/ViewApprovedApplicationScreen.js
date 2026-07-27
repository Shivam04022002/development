// ViewApprovedApplicationScreen.js
import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Navbar from '../components/Navbar';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE } from '../config';

const API_BASE_URL = `${API_BASE}/api`; //  mobile backend base

export default function ViewApprovedApplicationScreen({ route, navigation }) {
  const fileId = route?.params?.id || route?.params?.file?._id;

  const [user, setUser] = useState(null);
  const [application, setApplication] = useState(route?.params?.file || null);
  const [activeTab, setActiveTab] = useState('personal');
  const [loading, setLoading] = useState(!application);

  useEffect(() => {
    const run = async () => {
      try {
        const userJson = await AsyncStorage.getItem('userInfo');
        if (userJson) setUser(JSON.parse(userJson));

        if (!fileId) {
          setLoading(false);
          Alert.alert('Missing ID', 'No application id was provided.');
          return;
        }

        setLoading(true);
        const token = await AsyncStorage.getItem('userToken');
        if (!token) {
          setLoading(false);
          Alert.alert('Login required', 'Please sign in to view this application.');
          return;
        }

        // ✅ Mobile API for approved file by id
        const { data } = await axios.get(
          `${API_BASE_URL}/approved-files/${fileId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        setApplication(data);
      } catch (err) {
        console.error('Error fetching approved application:', err?.response?.data || err.message);
        Alert.alert('Error', 'Failed to fetch approved application.');
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [fileId]);

  // ---------- field mappers ----------
  const fullName = useMemo(
    () =>
      application?.applicant?.applicant?.name ||
      application?.applicant?.name ||
      '—',
    [application]
  );

  const fatherName = useMemo(
    () =>
      application?.applicant?.applicant?.fatherName ||
      application?.applicant?.fatherName ||
      '—',
    [application]
  );

  const coApplicantName = useMemo(
    () =>
      application?.coApplicant?.name ||
      application?.applicant?.coApplicantName ||
      '—',
    [application]
  );

  const loanAmount = useMemo(() => {
    const raw =
      application?.vehicleDetails?.financeRequired ??
      application?.loanAmount ??
      null;
    if (raw === null || raw === undefined || raw === '') return '—';
    const n = Number(raw);
    return Number.isFinite(n) ? `₹${n.toLocaleString()}` : String(raw);
  }, [application]);

  const tenure = application?.vehicleDetails?.tenure || '—';
  const vehicle = application?.vehicleDetails?.modelName || '—';

  const approvedOn =
    application?.approvedAt
      ? new Date(application.approvedAt).toLocaleDateString()
      : (application?.createdAt
        ? new Date(application.createdAt).toLocaleDateString()
        : '—');

  const idForDisplay = application?.formId || application?._id || '—';

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#fff7ed' }}>
        <Navbar user={user} onLogout={() => navigation.replace('Login')} />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#000" />
        </View>
      </SafeAreaView>
    );
  }

  if (!application) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#fff7ed' }}>
        <Navbar user={user} onLogout={() => navigation.replace('Login')} />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text>Application not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff7ed' }}>
      <Navbar user={user} onLogout={() => navigation.replace('Login')} />
      <ScrollView style={{ flex: 1, backgroundColor: '#fff' }} contentContainerStyle={{ padding: 15, paddingBottom: 70 }}>
        {/* Header */}
        <View style={styles.headerBox}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={20} color="#222" />
          </TouchableOpacity>

          <Text style={styles.heading}>Approved Loan Application</Text>

          <View style={styles.badgeRow}>
            <Text style={styles.appIdBadge}>
              Application ID: <Text style={styles.bold}>{idForDisplay}</Text>
            </Text>
            <Text style={styles.statusBadge}>Approved</Text>
          </View>

          <Text style={styles.approvedOn}>Application Approved on {approvedOn}</Text>
        </View>

        {/* Tabs */}
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'personal' && styles.tabActive]}
            onPress={() => setActiveTab('personal')}
          >
            <Text style={[styles.tabText, activeTab === 'personal' && styles.tabTextActive]}>
              Personal Details
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'loan' && styles.tabActive]}
            onPress={() => setActiveTab('loan')}
          >
            <Text style={[styles.tabText, activeTab === 'loan' && styles.tabTextActive]}>
              Loan Details
            </Text>
          </TouchableOpacity>
        </View>

        {/* Content */}
        <View style={styles.card}>
          {activeTab === 'personal' ? (
            <>
              <Text style={styles.cardTitle}>Personal Details</Text>
              <Detail label="Full Name" value={fullName} />
              <Detail label="Father Name" value={fatherName} />
              <Detail label="Co-Applicant" value={coApplicantName} />
            </>
          ) : (
            <>
              <Text style={styles.cardTitle}>Loan Details</Text>
              <Detail label="Loan Amount" value={loanAmount} />
              <Detail label="Tenure" value={tenure} />
              <Detail label="Vehicle" value={vehicle} />
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Detail({ label, value }) {
  return (
    <View style={detailStyles.row}>
      <Text style={detailStyles.label}>{label}</Text>
      <Text style={detailStyles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headerBox: { marginBottom: 14 },
  backBtn: { alignSelf: 'flex-start', padding: 6, borderRadius: 8, backgroundColor: '#F5F5F5', marginBottom: 6 },
  heading: { fontSize: 22, fontWeight: 'bold', color: '#222', marginBottom: 6, textAlign: 'center' },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 4, alignItems: 'center', justifyContent: 'center' },
  appIdBadge: { backgroundColor: '#e9ffe9', color: '#109c45', fontWeight: '600', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, fontSize: 13.5 },
  statusBadge: { backgroundColor: '#16C172', color: '#fff', borderRadius: 7, fontWeight: 'bold', fontSize: 13, paddingHorizontal: 9, paddingVertical: 3 },
  bold: { fontWeight: 'bold', color: '#111' },
  approvedOn: { color: '#16C172', fontWeight: '600', fontSize: 14, marginTop: 3, marginBottom: 6, textAlign: 'center' },
  tabRow: { flexDirection: 'row', backgroundColor: '#eee', borderRadius: 8, overflow: 'hidden', marginVertical: 7 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', backgroundColor: 'transparent' },
  tabActive: { backgroundColor: '#fff', borderBottomWidth: 2.5, borderBottomColor: '#16C172' },
  tabText: { color: '#aaa', fontWeight: 'bold', fontSize: 15 },
  tabTextActive: { color: '#16C172' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, elevation: 1, marginTop: 10, borderWidth: 1, borderColor: '#E0E0E0' },
  cardTitle: { fontWeight: 'bold', color: '#16C172', fontSize: 17, marginBottom: 12, textAlign: 'left' },
});

const detailStyles = StyleSheet.create({
  row: { flexDirection: 'row', marginBottom: 9, justifyContent: 'space-between' },
  label: { color: '#555', fontWeight: '600', fontSize: 14 },
  value: { color: '#181818', fontSize: 14, fontWeight: '500', maxWidth: 180, textAlign: 'right' },
});
