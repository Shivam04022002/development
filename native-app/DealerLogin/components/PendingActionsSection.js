import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

/**
 * PendingActionsSection — "My Pending Actions" on the dealer dashboard.
 *
 * Presentational. Everything it shows (which documents need action, the reason,
 * who asked, the counters) is decided by the backend; this renders it and
 * routes the tap. Added below the existing cards — no card, layout or style on
 * the dashboard is changed.
 */

const ORANGE = '#FF9100';
const RED = '#FF3B30';
const GREEN = '#34C759';

const fmtDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const today = new Date();
  const sameDay =
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear();
  if (sameDay) return 'Today';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

const Counter = ({ label, value, colour }) => (
  <View style={styles.counter}>
    <Text style={[styles.counterValue, colour ? { color: colour } : null]}>{value}</Text>
    <Text style={styles.counterLabel}>{label}</Text>
  </View>
);

export default function PendingActionsSection({ loading, failed, counters, items, onOpen }) {
  const awaiting = (items || []).filter((i) => i.actionCount > 0);

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>My Pending Actions</Text>

      <View style={styles.counterRow}>
        <Counter label="Pending Actions" value={loading ? '—' : counters?.pendingActions ?? 0} colour={RED} />
        <Counter label="Completed Today" value={loading ? '—' : counters?.completedToday ?? 0} colour={GREEN} />
        <Counter label="Awaiting You" value={loading ? '—' : counters?.applicationsAwaitingDealer ?? 0} colour={ORANGE} />
      </View>

      {loading ? (
        <ActivityIndicator size="small" color={ORANGE} style={{ marginVertical: 18 }} />
      ) : failed ? (
        <Text style={styles.muted}>Could not load your pending actions.</Text>
      ) : awaiting.length === 0 ? (
        <View style={styles.emptyRow}>
          <MaterialIcons name="check-circle" size={18} color={GREEN} />
          <Text style={styles.emptyText}>No pending actions</Text>
        </View>
      ) : (
        awaiting.map((item) => (
          <TouchableOpacity
            key={item.applicationId}
            style={styles.card}
            activeOpacity={0.8}
            onPress={() => onOpen(item)}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.loan}>{item.loanNumber || '—'}</Text>
              {item.customerName ? <Text style={styles.customer}>{item.customerName}</Text> : null}

              {item.pendingActions.map((a) => (
                <View key={`${a.role}-${a.field}`} style={styles.action}>
                  <Text style={styles.actionTitle}>
                    <Text style={{ color: RED }}>● </Text>
                    {a.label} Re-upload Required
                  </Text>
                  {a.reason ? (
                    <Text style={styles.reason}>
                      <Text style={styles.reasonKey}>Reason </Text>
                      {a.reason}
                    </Text>
                  ) : null}
                  <Text style={styles.requested}>
                    <Text style={styles.reasonKey}>Requested </Text>
                    {fmtDate(a.requestedAt)}
                  </Text>
                </View>
              ))}
            </View>

            <View style={styles.openBtn}>
              <Text style={styles.openText}>Open</Text>
            </View>
          </TouchableOpacity>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 6 },
  heading: { fontSize: 18, fontWeight: '800', color: '#A34B1A', marginBottom: 10, marginLeft: 4 },
  counterRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  counter: {
    flex: 1,
    backgroundColor: '#fff6ec',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#F3D9BE',
    paddingVertical: 10,
    alignItems: 'center',
  },
  counterValue: { fontSize: 20, fontWeight: 'bold', color: '#171717' },
  counterLabel: { fontSize: 11, color: '#7c6a58', marginTop: 2, textAlign: 'center' },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#FFD9D6',
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 10,
    elevation: 1,
  },
  loan: { fontSize: 15, fontWeight: '800', color: '#171717' },
  customer: { fontSize: 12.5, color: '#666', marginTop: 1 },
  action: { marginTop: 7 },
  actionTitle: { fontSize: 13.5, fontWeight: '700', color: '#222' },
  reason: { fontSize: 12, color: '#555', marginTop: 1 },
  reasonKey: { color: '#999' },
  requested: { fontSize: 12, color: '#555', marginTop: 1 },
  openBtn: {
    backgroundColor: '#FF7300',
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 14,
    marginLeft: 10,
  },
  openText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },

  emptyRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 12, paddingLeft: 4 },
  emptyText: { color: '#666', fontSize: 14 },
  muted: { color: '#999', fontSize: 13, paddingVertical: 12, paddingLeft: 4 },
});
