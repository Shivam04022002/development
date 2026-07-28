/**
 * CibilStatusScreen.js — shown immediately after a dealer submits an application.
 *
 * Instead of dropping straight back to the previous screen, the dealer sees the
 * CIBIL meter sweeping while the submission is in flight, then the outcome the
 * backend decided.
 *
 * NOTHING is decided here. The screen only renders what the backend returns:
 *   • POST /api/applications/submit  → { status: "rejected" | "pending_cibil", reason?, message? }
 *   • GET  /api/applications/by-formid/:formId → the stored application, whose
 *     `cibil` summary carries { score, state } written by the CIBIL workflow.
 *
 * Rejection is never computed in the app — it is taken from the backend status.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  BackHandler,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { API_BASE } from '../config';
import CibilMeter, { cibilColor, hasCibilScore } from '../components/CibilMeter';

const PHASE = {
  PROCESSING: 'processing',
  SUCCESS: 'success',
  REJECTED: 'rejected',
  PENDING: 'pending',
  UNAVAILABLE: 'unavailable',
  ERROR: 'error',
};

const DEFAULT_LOW_CIBIL_MESSAGE =
  'Your application has been rejected because your CIBIL score is below the minimum eligibility criteria.';

/** Read the stored application (existing endpoint) to get the CIBIL summary. */
const fetchApplication = async (formId, token) => {
  if (!formId) return null;
  try {
    const res = await fetch(
      `${API_BASE}/api/applications/by-formid/${encodeURIComponent(formId)}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      }
    );
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn('[CibilStatus] Could not read application:', err?.message);
    return null;
  }
};

export default function CibilStatusScreen({ route, navigation }) {
  const { payload, formId } = route.params || {};

  const [phase, setPhase] = useState(PHASE.PROCESSING);
  const [score, setScore] = useState(null);
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [attempt, setAttempt] = useState(0);
  const runIdRef = useRef(0);

  const goHome = useCallback(() => {
    navigation.reset({ index: 0, routes: [{ name: 'Dashboard' }] });
  }, [navigation]);

  // Resolve the outcome purely from what the backend reported.
  const applyOutcome = useCallback((submitData, appDoc) => {
    const cibil = appDoc?.cibil || {};
    const cibilScore = hasCibilScore(cibil.score) ? cibil.score : null;
    setScore(cibilScore);

    const backendStatus =
      submitData?.status || (appDoc?.status === 'rejected' ? 'rejected' : null);

    if (backendStatus === 'rejected') {
      setReason(submitData?.reason || appDoc?.rejection?.reason || 'Low CIBIL Score');
      setMessage(submitData?.message || DEFAULT_LOW_CIBIL_MESSAGE);
      setPhase(PHASE.REJECTED);
      return;
    }

    if (cibil.state === 'unavailable') {
      setPhase(PHASE.UNAVAILABLE);
      return;
    }

    if (cibilScore === null) {
      setPhase(PHASE.PENDING);
      return;
    }

    setPhase(PHASE.SUCCESS);
  }, []);

  useEffect(() => {
    if (!payload) {
      setMessage('Nothing to submit.');
      setPhase(PHASE.ERROR);
      return;
    }

    // Only the latest run may update the screen.
    const myRun = runIdRef.current + 1;
    runIdRef.current = myRun;
    const isCurrent = () => runIdRef.current === myRun;

    const run = async () => {
      setPhase(PHASE.PROCESSING);
      setScore(null);

      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        if (isCurrent()) {
          setMessage('Session expired. Please login again.');
          setPhase(PHASE.ERROR);
        }
        return;
      }

      try {
        const res = await axios.post(`${API_BASE}/api/applications/submit`, payload, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'User-Agent': 'Mozilla/5.0 (Mobile; React Native)',
          },
          timeout: 20000,
        });

        if (res.status !== 200 && res.status !== 201) {
          throw new Error('Failed to submit application to server.');
        }

        const appDoc = await fetchApplication(formId, token);
        if (isCurrent()) applyOutcome(res.data || {}, appDoc);
      } catch (err) {
        console.error('❌ [CibilStatus] Submit failed:', err?.message);

        // The request may have timed out after the application was already
        // created — check the stored record before reporting a failure.
        const appDoc = await fetchApplication(formId, token);
        if (!isCurrent()) return;

        if (appDoc) {
          applyOutcome(null, appDoc);
          return;
        }

        let details = '';
        if (err?.response?.data && typeof err.response.data !== 'string') {
          details = ` (${JSON.stringify(err.response.data)})`;
        }
        setMessage(
          `Could not submit your application right now. Please try again.${details}`
        );
        setPhase(PHASE.ERROR);
      }
    };

    run();
  }, [attempt, payload, formId, applyOutcome]);

  // Back is blocked while the CIBIL check is running; otherwise it goes Home.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (phase === PHASE.PROCESSING) return true;
      goHome();
      return true;
    });
    return () => sub.remove();
  }, [phase, goHome]);

  const view = VIEWS[phase] || VIEWS[PHASE.PROCESSING];
  const processing = phase === PHASE.PROCESSING;
  const showMeter = phase !== PHASE.ERROR;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.card}>
          {showMeter && (
            <CibilMeter score={score} processing={processing} size={240} />
          )}

          <View
            style={[
              styles.badge,
              { backgroundColor: view.badgeBg, borderColor: view.accent },
            ]}
          >
            <Text style={[styles.badgeText, { color: view.accent }]}>{view.badge}</Text>
          </View>

          <Text style={[styles.title, { color: view.accent }]}>{view.title}</Text>

          {phase === PHASE.REJECTED && (
            <View style={styles.reasonBox}>
              <Text style={styles.reasonLabel}>Reason</Text>
              <Text style={styles.reasonValue}>{reason || 'Low CIBIL Score'}</Text>
            </View>
          )}

          <Text style={styles.subtitle}>
            {phase === PHASE.REJECTED || phase === PHASE.ERROR
              ? message || view.subtitle
              : view.subtitle}
          </Text>

          {phase === PHASE.SUCCESS && hasCibilScore(score) && (
            <Text style={[styles.scoreLine, { color: cibilColor(score) }]}>
              CIBIL Score: {score}
            </Text>
          )}
        </View>

        {!processing && (
          <View style={styles.actions}>
            {phase === PHASE.ERROR && (
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() => setAttempt((a) => a + 1)}
                activeOpacity={0.8}
              >
                <Text style={styles.secondaryBtnText}>Try Again</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.primaryBtn} onPress={goHome} activeOpacity={0.8}>
              <Text style={styles.primaryBtnText}>Go to Home</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const VIEWS = {
  [PHASE.PROCESSING]: {
    badge: 'Please wait',
    badgeBg: '#F1F5F9',
    accent: '#334155',
    title: 'Checking your CIBIL...',
    subtitle: 'We are fetching the CIBIL report for this application. Do not close the app.',
  },
  [PHASE.SUCCESS]: {
    badge: 'Submitted',
    badgeBg: '#DCFCE7',
    accent: '#16A34A',
    title: 'Application Submitted Successfully',
    subtitle: 'The CIBIL check is complete and your application has been submitted.',
  },
  [PHASE.REJECTED]: {
    badge: 'Rejected',
    badgeBg: '#FEE2E2',
    accent: '#EF4444',
    title: 'Application Rejected',
    subtitle: DEFAULT_LOW_CIBIL_MESSAGE,
  },
  [PHASE.PENDING]: {
    badge: 'Pending',
    badgeBg: '#FEF3C7',
    accent: '#F59E0B',
    title: 'CIBIL Verification Pending',
    subtitle:
      'Your application has been submitted and is waiting for the CIBIL response. You can track it from Pending Files.',
  },
  [PHASE.UNAVAILABLE]: {
    badge: 'Unavailable',
    badgeBg: '#F1F5F9',
    accent: '#64748B',
    title: 'CIBIL Currently Unavailable',
    subtitle:
      'Please try again later. Your application has been submitted and will be verified once CIBIL responds.',
  },
  [PHASE.ERROR]: {
    badge: 'Failed',
    badgeBg: '#FEE2E2',
    accent: '#EF4444',
    title: 'Submission Failed',
    subtitle: 'Could not submit your application right now. Please try again.',
  },
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff7ed' },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  badge: {
    marginTop: 18,
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  title: {
    marginTop: 12,
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 21,
    color: '#475569',
    textAlign: 'center',
  },
  scoreLine: {
    marginTop: 14,
    fontSize: 16,
    fontWeight: '800',
  },
  reasonBox: {
    marginTop: 14,
    alignSelf: 'stretch',
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  reasonLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#B91C1C',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  reasonValue: {
    marginTop: 2,
    fontSize: 16,
    fontWeight: '700',
    color: '#991B1B',
  },
  actions: {
    marginTop: 20,
  },
  primaryBtn: {
    backgroundColor: '#3450A1',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  secondaryBtn: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#3450A1',
    paddingVertical: 13,
    alignItems: 'center',
    marginBottom: 12,
  },
  secondaryBtnText: {
    color: '#3450A1',
    fontSize: 16,
    fontWeight: '800',
  },
});
