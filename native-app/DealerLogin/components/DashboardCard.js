import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons, MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';

const icons = {
  apply: <MaterialIcons name="post-add" size={28} color="#ff9800" />,
  pending: <MaterialCommunityIcons name="clock-outline" size={28} color="#FFC107" />,
  approved: <Ionicons name="checkmark-circle-outline" size={28} color="#43A047" />,
  rejected: <MaterialIcons name="cancel" size={28} color="#f44336" />
};

const borderColors = {
  apply: "#ff9800",
  pending: "#FFC107",
  approved: "#43A047",
  rejected: "#f44336"
};

export default function DashboardCard({ title, count, type }) {
  return (
    <View style={[styles.card, { borderColor: borderColors[type] }]}>
      <View style={styles.row}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.icon}>{icons[type]}</View>
      </View>
      <Text style={styles.count}>{count}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff7ed",
    borderRadius: 12,
    borderWidth: 2,
    marginBottom: 14,
    paddingVertical: 18,
    paddingHorizontal: 18,
    elevation: 1,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  title: {
    fontSize: 17,
    fontWeight: "bold",
    color: "#232346",
  },
  icon: {
    opacity: 0.9,
    backgroundColor: "#fff7ed",
    borderRadius: 14,
    padding: 2,
  },
  count: {
    fontSize: 28,
    color: "#232346",
    fontWeight: "bold",
    marginTop: 8,
  } 
});
