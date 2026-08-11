/**
 * SectionTabs.js — the tab strip the application detail screens use to switch
 * between Applicant / Co-Applicant / Loan Details.
 *
 * The design is the one already established on ApplicationDetailsScreen and
 * ViewRejectedApplicationScreen: grey track, white pill for the active tab, a
 * #16C172 underline and label on it. It lives here so ViewLoanApplicationScreen
 * and ViewApprovedApplicationScreen cannot drift apart.
 *
 * Props:
 *   tabs      — [{ key, label }]. Labels are single-line: three of them fit a
 *               narrow phone at this size.
 *   activeKey — key of the selected tab.
 *   onChange  — called with the pressed tab's key.
 *   style     — optional override for the row, for screens whose scroll
 *               container already supplies the horizontal padding.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

// Both detail screens show the same three sections.
export const APPLICATION_TABS = [
  { key: 'applicant', label: 'Applicant' },
  { key: 'coApplicant', label: 'Co-Applicant' },
  { key: 'loanDetails', label: 'Loan Details' },
];

export default function SectionTabs({ tabs, activeKey, onChange, style }) {
  return (
    <View style={[styles.tabRow, style]} accessibilityRole="tablist">
      {tabs.map((tab) => {
        const active = tab.key === activeKey;
        return (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, active && styles.tabActive]}
            onPress={() => onChange(tab.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <Text numberOfLines={1} style={[styles.tabText, active && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tabRow: { flexDirection: 'row', backgroundColor: '#EEE', marginHorizontal: 15, borderRadius: 7, marginBottom: 0, overflow: 'hidden', marginTop: 4 },
  tab: { flex: 1, paddingVertical: 9, paddingHorizontal: 4, backgroundColor: 'transparent', alignItems: 'center' },
  tabActive: { backgroundColor: '#fff', borderBottomWidth: 2.5, borderBottomColor: '#16C172' },
  tabText: { fontWeight: 'bold', color: '#999', fontSize: 14 },
  tabTextActive: { color: '#16C172' },
});
