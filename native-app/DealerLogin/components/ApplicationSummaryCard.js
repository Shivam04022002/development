import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { fetchApprovedApplication } from '../utils/vehicleDocsApi';

const formatDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

const formatAmount = (value) => {
  const n = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
  if (!Number.isFinite(n) || String(value ?? '').trim() === '') return '—';
  return `₹ ${n.toLocaleString('en-IN')}`;
};

const Row = ({ label, value }) => (
  <View style={styles.row}>
    <Text style={styles.rowLabel}>{label}</Text>
    <Text style={styles.rowValue}>{value || '—'}</Text>
  </View>
);

/**
 * ApplicationSummaryCard — the read-only application block shown above the
 * upload section, shared by the RC and Number Plate details screens.
 *
 * Loan Number, Customer Name, Mobile Number and Approval Date come from the
 * pending-list row that was passed through navigation, so they paint
 * immediately with no spinner. Dealer Name, Branch and Loan Amount are not part
 * of the pending payload, so they are read from the existing dealer endpoint
 * GET /api/approved-files/:id (same record, same server-side ownership check).
 * If that call fails the card still renders — those three rows stay "—" and the
 * upload below is unaffected.
 */
export default function ApplicationSummaryCard({ item = {} }) {
  const [detail, setDetail] = useState(null);
  const applicationId = item.applicationId;

  // The pending list now carries dealer, branch and amount (Phase 7), so the
  // common path needs no second request. The fetch remains only as a fallback
  // for a row from an older client/response that lacks them.
  const rowHasAllFields = item.dealerName !== undefined && item.branch !== undefined;

  useEffect(() => {
    let active = true;
    if (!applicationId || rowHasAllFields) return undefined;

    fetchApprovedApplication(applicationId)
      .then((data) => { if (active) setDetail(data); })
      .catch((err) => {
        // Non-fatal: the three enriched rows stay "—".
        console.warn('Could not load application detail:', err?.response?.data || err.message);
      });

    return () => { active = false; };
  }, [applicationId, rowHasAllFields]);

  const dealerName = item.dealerName ?? detail?.dealerDetails?.name ?? detail?.dealer?.name;
  const branch = item.branch ?? detail?.dealerDetails?.branch ?? detail?.dealer?.branch;
  const amount = item.amount ?? detail?.vehicleDetails?.financeRequired;

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Application Details</Text>
      <Row label="Loan Number" value={item.loanNumber} />
      <Row label="Customer Name" value={item.customerName} />
      <Row label="Mobile Number" value={item.mobileNumber} />
      <Row label="Dealer Name" value={dealerName} />
      <Row label="Branch" value={branch} />
      <Row label="Loan Amount" value={formatAmount(amount)} />
      <Row label="Approval Date" value={formatDate(item.approvedAt)} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    marginVertical: 10,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#f2f2f2',
  },
  cardTitle: { fontWeight: 'bold', fontSize: 18, color: '#FF7300', marginBottom: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  rowLabel: { fontSize: 14, color: '#888', width: 128 },
  rowValue: { fontSize: 14.5, color: '#222', fontWeight: '600', flex: 1 },
});
