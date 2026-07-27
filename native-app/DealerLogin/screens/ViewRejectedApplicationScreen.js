// ViewRejectedApplicationScreen.js
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Navbar from '../components/Navbar';
import { SafeAreaView } from 'react-native-safe-area-context';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE } from '../config';

export default function ViewRejectedApplicationScreen({ route, navigation }) {
  // accept either { id } or { fileId }
  const fileId = route?.params?.id || route?.params?.fileId;

  const [user, setUser] = useState(null);
  const [application, setApplication] = useState(null);
  const [activeTab, setActiveTab] = useState('personal'); // 'personal' | 'loan' | 'rejection'
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const run = async () => {
      try {
        const userJson = await AsyncStorage.getItem('userInfo');
        if (userJson) setUser(JSON.parse(userJson));

        if (!fileId) {
          setLoading(false);
          Alert.alert('Missing ID', 'No file ID was provided to this screen.');
          return;
        }

        setLoading(true);
        const token = await AsyncStorage.getItem('userToken');

        // ✅ DETAIL: GET /api/rejected/:id
        const { data } = await axios.get(
          `${API_BASE}/api/rejected/${fileId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        setApplication(data);
      } catch (error) {
        console.error('Error fetching rejected application:', error?.response?.data || error?.message);
        Alert.alert('Error', 'Failed to fetch application details.');
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [fileId]);

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
          <Text>No application found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const fullName =
    application?.applicant?.applicant?.name ||
    application?.applicant?.name || '—';

  const fatherName =
    application?.applicant?.applicant?.fatherName ||
    application?.applicant?.fatherName || '—';

  const coApplicantName =
    application?.coApplicant?.name ||
    application?.applicant?.coApplicantName || '—';

  const loanAmountRaw =
    application?.vehicleDetails?.financeRequired ??
    application?.loanAmount;
  const loanAmount =
    loanAmountRaw !== undefined && loanAmountRaw !== null && loanAmountRaw !== ''
      ? `₹${Number(loanAmountRaw).toLocaleString()}`
      : '—';

  const tenure = application?.vehicleDetails?.tenure || '—';
  const vehicle = application?.vehicleDetails?.modelName || '—';

  const rejectedAt =
    application?.rejection?.rejectedAt
      ? new Date(application.rejection.rejectedAt).toLocaleDateString()
      : (application?.createdAt ? new Date(application.createdAt).toLocaleDateString() : '—');

  const rejectionReason =
    application?.rejection?.reason ||
    application?.rejectionReason ||
    'No reason provided';

  const idForDisplay = application?.formId || application?._id || '—';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff7ed' }}>
      <Navbar user={user} onLogout={() => navigation.replace('Login')} />
      <View style={{ flex: 1, backgroundColor: '#fff' }}>
        {/* Header */}
        <View style={styles.headerBox}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={20} color="#222" />
          </TouchableOpacity>

          <Text style={styles.heading}>Rejected Loan Application</Text>

          <View style={styles.badgeRow}>
            <Text style={styles.appIdBadge}>
              Application ID: <Text style={styles.bold}>{idForDisplay}</Text>
            </Text>
            <Text style={styles.statusBadge}>Rejected</Text>
          </View>

          <Text style={{ marginTop: 6, color: '#555' }}>
            Rejected on: {rejectedAt}
          </Text>
        </View>

        {/* Tabs */}
        <View style={styles.tabRow}>
          <Tab label="Personal Details" active={activeTab === 'personal'} onPress={() => setActiveTab('personal')} />
          <Tab label="Loan Details" active={activeTab === 'loan'} onPress={() => setActiveTab('loan')} />
          <Tab label="Rejection Reason" active={activeTab === 'rejection'} onPress={() => setActiveTab('rejection')} />
        </View>

        <ScrollView style={{ flex: 1 }}>
          {
            activeTab === 'personal' && (
              <Card title="Personal Details">
                <Detail label="Full Name" value={fullName} />
                <Detail label="Father Name" value={fatherName} />
                <Detail label="Co-Applicant" value={coApplicantName} />
              </Card>
            )}
          {activeTab === 'loan' && (
            <Card title="Loan Details">
              <Detail label="Loan Amount" value={loanAmount} />
              <Detail label="Tenure" value={tenure} />
              <Detail label="Vehicle" value={vehicle} />
            </Card>
          )}

          {activeTab === 'rejection' && (
            <Card title="Rejection Details" danger>
              <Text style={{ color: '#d32f2f', marginTop: 4, fontSize: 14 }}>
                {rejectionReason}
              </Text>
            </Card>
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

/* ---------- Small UI helpers ---------- */

function Tab({ label, active, onPress }) {
  return (
    <TouchableOpacity style={[styles.tab, active && styles.tabActive]} onPress={onPress}>
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Card({ title, children, danger }) {
  return (
    <View style={[styles.card, danger ? { borderColor: '#fbbaba' } : null]}>
      <Text style={[styles.cardTitle, danger ? { color: '#d32f2f' } : null]}>{title}</Text>
      {children}
    </View>
  );
}

function Detail({ label, value }) {
  return (
    <View style={{ flexDirection: 'row', marginBottom: 10, justifyContent: 'space-between' }}>
      <Text style={{ fontWeight: '600', color: '#555' }}>{label}</Text>
      <Text style={{ fontWeight: '500', color: '#111' }}>{value || '—'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: 26, fontWeight: 'bold', color: '#181818', marginTop: 16, marginBottom: 6, textAlign: 'center', letterSpacing: 0.2 },
  badgeRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
  appIdBadge: { backgroundColor: '#F5F5F5', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  statusBadge: { backgroundColor: '#fde7e7', color: '#d32f2f', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, marginLeft: 8, fontWeight: '700' },
  tabRow: { flexDirection: 'row', backgroundColor: '#EEE', marginHorizontal: 15, borderRadius: 7, marginBottom: 0, overflow: 'hidden', marginTop: 4 },
  tab: { flex: 1, paddingVertical: 9, backgroundColor: 'transparent', alignItems: 'center' },
  tabActive: { backgroundColor: '#fff', borderBottomWidth: 2.5, borderBottomColor: '#16C172' },
  tabText: { fontWeight: 'bold', color: '#999', fontSize: 15 },
  tabTextActive: { color: '#16C172' },
  card: { backgroundColor: '#fff', marginHorizontal: 14, marginTop: 18, borderRadius: 9, padding: 16, elevation: 1, borderWidth: 1, borderColor: '#E0E0E0' },
  cardTitle: { fontWeight: '700', color: '#111', fontSize: 16, marginBottom: 10 },
});
