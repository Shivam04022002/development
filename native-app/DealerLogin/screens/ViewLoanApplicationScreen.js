import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, ScrollView, Alert } from 'react-native';
import Navbar from '../components/Navbar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearSession } from '../utils/SecureStorage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { API_BASE } from '../config';
import { WORKFLOW_STAGES, stageLabel, stageIndex } from '../utils/workflowConfig';
import CibilMeter, { cibilColor, hasCibilScore } from '../components/CibilMeter';
import SectionTabs, { APPLICATION_TABS } from '../components/SectionTabs';
import {
  resolveParty,
  partySubjectKey,
  normalizePan,
} from '../utils/cibilSubjectKey';

// ✅ Render Step Circle with Completed, Current, and Pending States
function renderStepCircle(idx, currentStep) {
  if (idx < currentStep - 1) {
    // Completed step
    return (
      <View key={idx} style={styles.stepWrapper}>
        <View style={[styles.progressCircleGrid, styles.stepDone]}>
          <Text style={[styles.progressCircleTextGrid, { color: '#fff' }]}>✓</Text>
        </View>
        <Text style={styles.progressStepLabelGrid}>{stageLabel(WORKFLOW_STAGES[idx])}</Text>
      </View>
    );
  } else if (idx === currentStep - 1) {
    // Current step
    return (
      <View key={idx} style={styles.stepWrapper}>
        <View style={[styles.progressCircleGrid, styles.stepCurrent]}>
          <Text style={[styles.progressCircleTextGrid, { color: '#16C172' }]}>{idx + 1}</Text>
        </View>
        <Text style={styles.progressStepLabelGrid}>{stageLabel(WORKFLOW_STAGES[idx])}</Text>
      </View>
    );
  } else {
    // Future step
    return (
      <View key={idx} style={styles.stepWrapper}>
        <View style={[styles.progressCircleGrid, styles.stepPending]}>
          <Text style={[styles.progressCircleTextGrid, { color: '#BDBDBD' }]}>{idx + 1}</Text>
        </View>
        <Text style={styles.progressStepLabelGrid}>{stageLabel(WORKFLOW_STAGES[idx])}</Text>
      </View>
    );
  }
}

// Party resolution and subject keying live in utils/cibilSubjectKey.js, which
// mirrors the backend and admin UI rules exactly. Imported rather than
// re-implemented here so the three copies cannot drift apart.

// Older records carry only a subset of the fields below. Nothing missing may
// reach the screen as a blank row, "undefined" or "Invalid Date" — the em dash
// is what the rest of the app already shows for an absent value.
const text = (value) => {
  const str = value === null || value === undefined ? '' : String(value).trim();
  return str || '—';
};

const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
};

const hasParty = (party) =>
  Object.values(resolveParty(party)).some(
    (v) => v !== null && v !== undefined && String(v).trim() !== ''
  );

function DetailRow({ label, value }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

// The same four personal fields, rendered identically for either role.
function PersonDetails({ party }) {
  const person = resolveParty(party);
  return (
    <>
      <DetailRow label="Full Name" value={text(person.name)} />
      <DetailRow label="Father's Name" value={text(person.fatherName)} />
      <DetailRow label="DOB" value={formatDate(person.dateOfBirth)} />
      <DetailRow label="Aadhar No" value={text(person.aadharNo)} />
    </>
  );
}

export default function ViewLoanApplicationScreen({ route, navigation }) {
  const { fileId } = route.params;
  const [user, setUser] = useState(null);
  const [application, setApplication] = useState(null);
  const [loading, setLoading] = useState(true);

  // Which of Applicant / Co-Applicant / Loan Details is on screen. It drives
  // both the section below the tabs and whose score the CIBIL card shows.
  const [activeTab, setActiveTab] = useState('applicant');

  useEffect(() => {
    const loadUser = async () => {
      const userJson = await AsyncStorage.getItem('userInfo');
      if (userJson) setUser(JSON.parse(userJson));
    };
    loadUser();
  }, []);

  useEffect(() => {
    const fetchApplication = async () => {
      setLoading(true);
      try {
        const token = await AsyncStorage.getItem('userToken');
        const response = await fetch(`${API_BASE}/api/pending-files/${fileId}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error('Failed to fetch application data');
        }

        const data = await response.json();
        setApplication(data);
      } catch (err) {
        console.error(err);
        Alert.alert('Error', 'Could not fetch application data.');
      } finally {
        setLoading(false);
      }
    };

    fetchApplication();
  }, [fileId]);

  const handleLogout = async () => {
    await clearSession();
    navigation.replace('Login');
  };

  if (loading || !application) {
    return (
      <View style={{ flex: 1, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#212121" />
      </View>
    );
  }

  // ✅ Calculate current step dynamically using shared config
  const currentStep = stageIndex(application.workflowStage) + 1 || 1;

  // Applicant shape differs by record age: legacy records embed the real
  // applicant one level down (application.applicant.applicant), newer ones
  // store it flat. Resolve once here so the JSX below reads plain fields.
  const applicant = resolveParty(application.applicant);

  // Some applications have no co-applicant at all; the card stays, its body
  // becomes an empty state.
  const hasCoApplicant = hasParty(application.coApplicant);

  // CIBIL summary as already returned by the existing response. No refetch.
  //
  // The application may now carry one report PER PERSON in `cibilSubjects`,
  // each tagged with its own `subjectPan`; `application.cibil` remains the
  // single-subject summary that predates it. An entry is field-compatible with
  // `cibil` (same score/state/requestId names), so either can drive the card.
  //
  // Resolution is the rule the Admin panel applies verbatim
  // (admin-frontend/src/utils/cibilSubjects.js — subjectSummary), so mobile and
  // Admin cannot disagree about whose score is whose:
  //
  //   1. the `cibilSubjects` entry whose SUBJECT KEY is this party's
  //   2. `cibil`, only when its own subjectPan IS this party
  //   3. `cibil` with NO subjectPan, for the APPLICANT only — the pre-swap rule,
  //      where an unattributed summary meant "the applicant"
  //   4. otherwise nothing at all
  //
  // The key is the party's PAN when they have one and a derived `K:` key over
  // their identity when they do not, so a PAN-less person — applicant or
  // co-applicant — still resolves to their own report.
  //
  // There is deliberately no fifth rule: a party with no report of their own
  // shows the empty state rather than borrowing the other person's score.
  const cibil = application.cibil || {};
  const cibilSubjects = Array.isArray(application.cibilSubjects) ? application.cibilSubjects : [];
  const legacySubjectPan = normalizePan(cibil.subjectPan);

  const summaryFor = (party, isApplicant) => {
    const key = partySubjectKey(party);
    if (key) {
      const entry = cibilSubjects.find((e) => normalizePan(e?.subjectPan) === key);
      if (entry) return entry;
      if (legacySubjectPan && legacySubjectPan === key) return cibil;
    }
    if (!legacySubjectPan && isApplicant) return cibil;
    return {};
  };

  // The one CIBIL card follows the tabs: the Co-Applicant tab shows the
  // co-applicant's score, Applicant and Loan Details both show the applicant's.
  const cibilIsApplicant = activeTab !== 'coApplicant';
  const cibilParty = cibilIsApplicant ? application.applicant : application.coApplicant;
  const cibilSubjectLabel = cibilIsApplicant ? 'Applicant' : 'Co-Applicant';
  const cibilSummary = summaryFor(cibilParty, cibilIsApplicant);
  const cibilScore = hasCibilScore(cibilSummary.score) ? cibilSummary.score : null;
  const cibilProcessing =
    cibilScore === null &&
    String(cibilSummary.state || '').toLowerCase() === 'pending';
  const cibilRating =
    cibilScore === null ? '' : cibilScore >= 750 ? 'EXCELLENT' : cibilScore >= 650 ? 'GOOD' : 'LOW';

  const chunkArray = (arr, size) => {
    const result = [];
    for (let i = 0; i < arr.length; i += size) {
      result.push(arr.slice(i, i + size));
    }
    return result;
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff7ed' }}>
      <View style={{ flex: 1, backgroundColor: '#fff' }}>
        <Navbar user={user} onLogout={handleLogout} />
        <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
          <Text style={styles.heading}>Loan Application Form</Text>

          <View style={styles.badgeRow}>
            <Text style={styles.badgeLabel}>Application ID:</Text>
            <View style={styles.appIdBadge}>
              <Text style={styles.appIdText}>{application._id}</Text>
            </View>
          </View>

          <Text style={styles.useridRow}>
            <Text style={{ color: '#222' }}>Form ID: <Text style={{ fontWeight: 'bold' }}>{application.formId}</Text></Text>
            <Text> | </Text>
            <Text style={{ color: '#222' }}>Name: <Text style={{ fontWeight: 'bold' }}>{applicant.name}</Text></Text>
          </Text>

          <Text style={styles.progressLabel}>Application Progress</Text>
          <View style={styles.progressGrid}>
            {chunkArray(WORKFLOW_STAGES, 3).map((chunk, rowIndex) => (
              <View
                key={rowIndex}
                style={[
                  styles.progressRow,
                  rowIndex === 2 ? { justifyContent: 'center' } : {},
                ]}
              >
                {chunk.map((label, index) =>
                  renderStepCircle(rowIndex * 3 + index, currentStep)
                )}
              </View>
            ))}
          </View>

          {/* CIBIL Meter — one card, reading the cibil summary already present
              on the loaded application; no extra request is made. Its subject
              is whoever the selected tab is about. */}
          <View style={styles.cibilCard}>
            <Text style={styles.cibilTitle}>CIBIL Score</Text>
            <Text style={styles.cibilSubject}>{cibilSubjectLabel}</Text>
            <CibilMeter score={cibilScore} processing={cibilProcessing} size={210} />
            <Text
              style={[
                styles.cibilRating,
                { color: cibilRating ? cibilColor(cibilScore) : '#94A3B8' },
              ]}
            >
              {cibilRating || (cibilProcessing ? 'Fetching CIBIL...' : 'CIBIL Not Available')}
            </Text>
          </View>

          {/* Status Box */}
          <View style={styles.statusBox}>
            <View style={{ borderLeftWidth: 5, borderLeftColor: '#16C172', paddingLeft: 13 }}>
              <Text style={styles.statusText}>
                Current Status: <Text style={{ fontWeight: 'bold', color: '#111' }}>{application.status}</Text>
              </Text>
            </View>
          </View>

          {/* Tabs */}
          <SectionTabs tabs={APPLICATION_TABS} activeKey={activeTab} onChange={setActiveTab} />

          {/* One section at a time, chosen by the tab above. Applicant and
              Co-Applicant are whoever currently holds each role on the loaded
              application, so a swap is reflected without any extra work. */}
          <View style={styles.detailsCard}>
            {activeTab === 'applicant' && (
              <>
                <Text style={styles.sectionTitle}>Applicant Details</Text>
                <PersonDetails party={application.applicant} />
              </>
            )}

            {activeTab === 'coApplicant' && (
              <>
                <Text style={styles.sectionTitle}>Co-Applicant Details</Text>
                {hasCoApplicant ? (
                  <PersonDetails party={application.coApplicant} />
                ) : (
                  <Text style={styles.emptyState}>No Co-Applicant</Text>
                )}
              </>
            )}

            {activeTab === 'loanDetails' && (
              <>
                <Text style={styles.sectionTitle}>Loan Details</Text>
                <DetailRow label="Application ID" value={text(application._id)} />
                <DetailRow
                  label="Vehicle"
                  value={text(
                    [application.vehicleDetails?.brandName, application.vehicleDetails?.modelName]
                      .filter(Boolean)
                      .join(' ')
                  )}
                />
                <DetailRow label="Price" value={text(application.vehicleDetails?.priceOfVehicle)} />
                <DetailRow
                  label="Finance Required"
                  value={text(application.vehicleDetails?.financeRequired)}
                />
                <DetailRow
                  label="Tenure"
                  value={
                    application.vehicleDetails?.tenure
                      ? `${application.vehicleDetails.tenure} months`
                      : '—'
                  }
                />
              </>
            )}
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: 26, fontWeight: 'bold', color: '#181818', marginTop: 16, marginBottom: 6, textAlign: 'center', letterSpacing: 0.2 },
  badgeRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
  badgeLabel: { fontWeight: '600', color: '#222', fontSize: 13.5, marginRight: 5 },
  appIdBadge: { backgroundColor: '#F5F5F5', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  appIdText: { color: '#222', fontWeight: 'bold', fontSize: 14, letterSpacing: 0.2 },
  useridRow: { textAlign: 'center', fontSize: 14.8, marginBottom: 8, color: '#222', fontWeight: '500' },
  progressLabel: { fontWeight: '700', color: '#222', fontSize: 14.8, marginTop: 10, marginBottom: 7, textAlign: 'center' },
  progressGrid: { marginTop: 5, marginBottom: 18 },
  progressRow: { flexDirection: 'row', justifyContent: 'space-evenly', marginBottom: 16 },
  stepWrapper: { alignItems: 'center', flex: 1, minWidth: 90, maxWidth: 110 },
  progressCircleGrid: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, justifyContent: 'center', alignItems: 'center', marginBottom: 5, backgroundColor: '#fff' },
  progressCircleTextGrid: { fontWeight: 'bold', fontSize: 17 },
  progressStepLabelGrid: { fontSize: 11.6, color: '#222', textAlign: 'center', fontWeight: '600', maxWidth: 96 },
  stepDone: { backgroundColor: '#16C172', borderColor: '#16C172' },
  stepCurrent: { backgroundColor: '#fff', borderColor: '#16C172' },
  stepPending: { backgroundColor: '#fff', borderColor: '#BDBDBD' },
  cibilCard: { backgroundColor: '#fff', marginHorizontal: 14, marginTop: 4, marginBottom: 6, borderRadius: 9, paddingVertical: 16, paddingHorizontal: 16, alignItems: 'center', elevation: 1, borderWidth: 1, borderColor: '#E0E0E0', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, shadowOffset: { width: 0, height: 2 } },
  cibilTitle: { fontWeight: 'bold', color: '#222', fontSize: 17, marginBottom: 2, textAlign: 'center' },
  // Whose score is on the meter — the card is shared by all three tabs.
  cibilSubject: { color: '#666', fontSize: 12.5, fontWeight: '700', letterSpacing: 0.6, marginBottom: 11, textAlign: 'center', textTransform: 'uppercase' },
  cibilRating: { marginTop: 10, fontSize: 15, fontWeight: '800', letterSpacing: 1, textAlign: 'center' },
  statusBox: { backgroundColor: '#F8F8F8', borderRadius: 8, padding: 0, marginHorizontal: 18, marginTop: 10, marginBottom: 14, elevation: 1 },
  statusText: { fontSize: 15, color: '#111', fontWeight: 'bold', paddingVertical: 10 },
  detailsCard: { backgroundColor: '#fff', marginHorizontal: 14, marginTop: 18, borderRadius: 9, padding: 16, elevation: 1, borderWidth: 1, borderColor: '#E0E0E0' },
  emptyState: { color: '#999', fontSize: 15, fontWeight: '500', paddingVertical: 8 },
  sectionTitle: { fontWeight: 'bold', color: '#222', fontSize: 17, marginBottom: 11, textAlign: 'left' },
  detailRow: { flexDirection: 'row', marginBottom: 10 },
  detailLabel: { flex: 1.1, color: '#666', fontWeight: 'bold', fontSize: 15 },
  detailValue: { flex: 2, color: '#222', fontSize: 15, fontWeight: '500', textAlign: 'right' },
});
