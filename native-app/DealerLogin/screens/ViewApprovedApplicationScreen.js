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
import SectionTabs, { APPLICATION_TABS } from '../components/SectionTabs';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE } from '../config';

const API_BASE_URL = `${API_BASE}/api`; //  mobile backend base

// A party (applicant or co-applicant) may use the legacy nested shape, where
// the real person sits one level down. Resolve once so callers read plain
// fields.
const resolveParty = (party) => party?.applicant || party || {};

// Nothing absent may reach the screen as "undefined", "null" or "Invalid Date";
// the em dash is what this screen already shows for a missing value.
const text = (value) => {
  const str = value === null || value === undefined ? '' : String(value).trim();
  return str || '—';
};

const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
};

// Same rupee formatting the screen already used for Loan Amount.
const formatAmount = (raw) => {
  if (raw === null || raw === undefined || raw === '') return '—';
  const n = Number(raw);
  return Number.isFinite(n) ? `₹${n.toLocaleString()}` : String(raw);
};

const hasParty = (party) =>
  Object.values(resolveParty(party)).some(
    (v) => v !== null && v !== undefined && String(v).trim() !== ''
  );

// The same four personal fields, rendered identically for either role.
function PersonDetails({ party }) {
  const person = resolveParty(party);
  return (
    <>
      <Detail label="Full Name" value={text(person.name)} />
      <Detail label="Father's Name" value={text(person.fatherName)} />
      <Detail label="DOB" value={formatDate(person.dateOfBirth)} />
      <Detail label="Aadhaar No." value={text(person.aadharNo)} />
    </>
  );
}

export default function ViewApprovedApplicationScreen({ route, navigation }) {
  const fileId = route?.params?.id || route?.params?.file?._id;

  const [user, setUser] = useState(null);
  const [application, setApplication] = useState(route?.params?.file || null);
  const [loading, setLoading] = useState(!application);

  // Which of Applicant / Co-Applicant / Loan Details is on screen.
  const [activeTab, setActiveTab] = useState('applicant');

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
  // Whoever currently holds each role on the persisted record, so a swap done
  // in Admin is reflected without any extra work here.
  const applicantParty = application?.applicant;
  const coApplicantParty = application?.coApplicant;
  const hasCoApplicant = useMemo(() => hasParty(coApplicantParty), [coApplicantParty]);

  // Disbursement details, captured by Admin when the application was approved
  // and carried onto the approved record. Absent on records approved before
  // that step existed.
  const disbursement = application?.disbursement;

  const loanNumber = text(disbursement?.loanNumber);
  const approvedAmount = formatAmount(disbursement?.approvedAmount);
  const disbursementDate = formatDate(disbursement?.disbursementDate);

  const loanAmount = useMemo(
    () =>
      formatAmount(
        application?.vehicleDetails?.financeRequired ?? application?.loanAmount ?? null
      ),
    [application]
  );

  // Stored as a plain month count; "months" is the unit the rest of the app
  // prints. A value that already carries the unit is left alone.
  const tenure = useMemo(() => {
    const raw = text(application?.vehicleDetails?.tenure);
    if (raw === '—' || /month/i.test(raw)) return raw;
    return `${raw} months`;
  }, [application]);

  const vehicle = text(
    [application?.vehicleDetails?.brandName, application?.vehicleDetails?.modelName]
      .filter(Boolean)
      .join(' ')
  );

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

        {/* Tabs — the same strip ViewLoanApplicationScreen uses. This screen's
            scroll container already pads 15, so the row drops its own margin. */}
        <SectionTabs
          tabs={APPLICATION_TABS}
          activeKey={activeTab}
          onChange={setActiveTab}
          style={styles.tabRow}
        />

        {/* One section at a time, chosen by the tab above. Applicant and
            Co-Applicant are the roles as they are persisted right now, so an
            Admin-side swap is reflected without any extra work here. */}
        <View style={styles.card}>
          {activeTab === 'applicant' && (
            <>
              <Text style={styles.cardTitle}>Applicant Details</Text>
              <PersonDetails party={applicantParty} />
            </>
          )}

          {activeTab === 'coApplicant' && (
            <>
              <Text style={styles.cardTitle}>Co-Applicant Details</Text>
              {hasCoApplicant ? (
                <PersonDetails party={coApplicantParty} />
              ) : (
                <Text style={styles.emptyState}>No Co-Applicant</Text>
              )}
            </>
          )}

          {activeTab === 'loanDetails' && (
            <>
              <Text style={styles.cardTitle}>Loan Details</Text>
              <Detail label="Loan Number" value={loanNumber} />
              <Detail label="Loan Amount" value={loanAmount} />
              <Detail label="Approved Amount" value={approvedAmount} />
              <Detail label="Tenure" value={tenure} />
              <Detail label="Vehicle" value={vehicle} />
              <Detail label="Disbursement Date" value={disbursementDate} />
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
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, elevation: 1, marginTop: 10, borderWidth: 1, borderColor: '#E0E0E0' },
  cardTitle: { fontWeight: 'bold', color: '#16C172', fontSize: 17, marginBottom: 12, textAlign: 'left' },
  // Only the horizontal margin is dropped — the scroll container pads 15, so
  // the strip still sits 15 from the screen edge, as on the pending screen.
  tabRow: { marginHorizontal: 0 },
  emptyState: { color: '#999', fontSize: 14, fontWeight: '500', paddingVertical: 6 },
});

const detailStyles = StyleSheet.create({
  // flexShrink lets both sides wrap instead of pushing the row wider than the
  // card, which matters now that a card can be half the screen.
  row: { flexDirection: 'row', marginBottom: 9, justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  label: { color: '#555', fontWeight: '600', fontSize: 14, flexShrink: 1 },
  value: { color: '#181818', fontSize: 14, fontWeight: '500', flexShrink: 1, textAlign: 'right' },
});
