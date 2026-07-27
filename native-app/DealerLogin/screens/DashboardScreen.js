import React, { useState, useCallback, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { API_BASE } from "../config";
import { clearSession } from "../utils/SecureStorage";

const ORANGE = "#FF9100";
const YELLOW = "#FFD600";
const GREEN = "#34C759";
const RED = "#FF3B30";

const DEFAULT_POLL_INTERVAL = 5000;
// Set true to see detailed logs in Metro/console
const DEBUG = true;

export default function DashboardScreen({ navigation }) {
  const [user, setUser] = useState(null);

  const [applyFormCount, setApplyFormCount] = useState(0);
  const [pendingFilesCount, setPendingFilesCount] = useState(0);
  const [approvedFilesCount, setApprovedFilesCount] = useState(0);
  const [rejectedFilesCount, setRejectedFilesCount] = useState(0);

  const intervalRef = useRef(null);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      const load = async () => {
        try {
          const userJson = await AsyncStorage.getItem("userInfo");
          if (userJson) {
            const parsed = JSON.parse(userJson);
            if (isActive) setUser(parsed);
          }
        } catch (e) {
          if (DEBUG) console.warn("Failed reading userInfo:", e);
        }

        // immediate fetch then polling
        await fetchCounts(true);

        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }

        const pollIntervalStr = await AsyncStorage.getItem("pollInterval");
        const pollInterval = pollIntervalStr ? Number(pollIntervalStr) : DEFAULT_POLL_INTERVAL;

        intervalRef.current = setInterval(() => fetchCounts(true), pollInterval);
      };

      load();

      return () => {
        isActive = false;
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      };
    }, [])
  );

  // Try many response shapes to decide a numeric count
  const extractCount = (resJson) => {
    if (resJson == null) return null;
    if (typeof resJson === "number") return resJson;
    if (Array.isArray(resJson)) return resJson.length;
    if (typeof resJson === "object") {
      // common fields
      const keys = ["count", "total", "totalCount", "length", "size", "results", "data", "files", "docs"];
      for (const k of keys) {
        if (k in resJson) {
          const v = resJson[k];
          if (Array.isArray(v)) return v.length;
          if (typeof v === "number") return v;
          // if object with nested array
          if (v && typeof v === "object") {
            // try nested arrays
            for (const sub of ["data", "files", "results", "docs"]) {
              if (Array.isArray(v[sub])) return v[sub].length;
            }
          }
        }
      }
      // if object has only numeric values, try picking the first numeric
      for (const k of Object.keys(resJson)) {
        if (typeof resJson[k] === "number") return resJson[k];
      }
    }
    return null;
  };

  const fetchCounts = async (isActive = true) => {
    try {
      const baseUrl = (await AsyncStorage.getItem("baseUrl")) || API_BASE;
      const token = await AsyncStorage.getItem("userToken");
      const headers = token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };

      // derive user id from various possible shapes
      const userJson = await AsyncStorage.getItem("userInfo");
      let userId = null;
      if (userJson) {
        try {
          const parsed = JSON.parse(userJson);
          userId = parsed._id || parsed.id || parsed.userId || parsed.uid || parsed?.user?._id || null;
        } catch (e) {
          if (DEBUG) console.warn("userInfo JSON parse error", e);
        }
      }
      if (DEBUG) console.log("Dashboard fetchCounts: userId ->", userId);

      // IMPORTANT: include the exact sibling routes your app uses first
      const endpointsToTry = [
        // exact sibling endpoints used by your list screens
        { url: `${baseUrl}/api/pending-files${token ? "" : ""}`, mapper: (j) => ({ pending: extractCount(j) }) },
        { url: `${baseUrl}/api/approved-files${token ? "" : ""}`, mapper: (j) => ({ approved: extractCount(j) }) },
        { url: `${baseUrl}/api/rejected-files${token ? "" : ""}`, mapper: (j) => ({ rejected: extractCount(j) }) },

        // Keep the robust list of other possibilities after the exact routes
        // single stats endpoint (often used)
        {
          url: `${baseUrl}/api/applications/stats${userId ? `?user=${userId}` : ""}`,
          mapper: (j) => {
            return {
              apply: extractCount(j.apply ?? j.applyCount ?? j.applyFormCount ?? j.totalApply ?? j.total),
              pending: extractCount(j.pending ?? j.pendingCount ?? j.pendingFiles),
              approved: extractCount(j.approved ?? j.approvedCount ?? j.approvedFiles),
              rejected: extractCount(j.rejected ?? j.rejectedCount ?? j.rejectedFiles),
            };
          },
        },
        // common "applications" list endpoints with status filter
        {
          url: `${baseUrl}/api/applications?status=pending${userId ? `&user=${userId}` : ""}`,
          mapper: async (j) => ({ pending: extractCount(j) }),
        },
        {
          url: `${baseUrl}/api/applications?status=approved${userId ? `&user=${userId}` : ""}`,
          mapper: async (j) => ({ approved: extractCount(j) }),
        },
        {
          url: `${baseUrl}/api/applications?status=rejected${userId ? `&user=${userId}` : ""}`,
          mapper: async (j) => ({ rejected: extractCount(j) }),
        },
        // count endpoints
        {
          url: `${baseUrl}/api/applications/count?status=pending${userId ? `&user=${userId}` : ""}`,
          mapper: async (j) => ({ pending: extractCount(j) }),
        },
        {
          url: `${baseUrl}/api/applications/count?status=approved${userId ? `&user=${userId}` : ""}`,
          mapper: async (j) => ({ approved: extractCount(j) }),
        },
        {
          url: `${baseUrl}/api/applications/count?status=rejected${userId ? `&user=${userId}` : ""}`,
          mapper: async (j) => ({ rejected: extractCount(j) }),
        },
        // older custom routes many projects use
        {
          url: `${baseUrl}/api/pending${userId ? `?user=${userId}` : ""}`,
          mapper: async (j) => ({ pending: extractCount(j) }),
        },
        {
          url: `${baseUrl}/api/approved${userId ? `?user=${userId}` : ""}`,
          mapper: async (j) => ({ approved: extractCount(j) }),
        },
        {
          url: `${baseUrl}/api/rejected${userId ? `?user=${userId}` : ""}`,
          mapper: async (j) => ({ rejected: extractCount(j) }),
        },
        // fallback: try the generic applications list (no status) which we can parse
        {
          url: `${baseUrl}/api/applications${userId ? `?user=${userId}` : ""}`,
          mapper: (j) => {
            // If we get an array, count statuses locally
            if (Array.isArray(j)) {
              const pending = j.filter(it => (it.status || "").toString().toLowerCase() === "pending").length;
              const approved = j.filter(it => (it.status || "").toString().toLowerCase() === "approved").length;
              const rejected = j.filter(it => (it.status || "").toString().toLowerCase() === "rejected").length;
              return { pending, approved, rejected, apply: j.length };
            }
            // Otherwise try extracting counts from common fields
            return {
              apply: extractCount(j),
              pending: extractCount(j.pending ?? j.data ?? j.files),
              approved: extractCount(j.approved ?? j.data ?? j.files),
              rejected: extractCount(j.rejected ?? j.data ?? j.files),
            };
          }
        }
      ];

      // Try endpoints in order, merge results
      let merged = { apply: null, pending: null, approved: null, rejected: null };

      for (let i = 0; i < endpointsToTry.length; i++) {
        const ep = endpointsToTry[i];
        try {
          // if (DEBUG) console.log("Trying endpoint:", ep.url);
          const res = await fetch(ep.url, { headers });
          if (!res) continue;
          const txt = await res.text();
          if (!txt) {
            if (DEBUG) console.log("empty response for", ep.url);
            continue;
          }
          let json;
          try {
            json = JSON.parse(txt);
          } catch (e) {
            const n = Number(txt);
            json = Number.isNaN(n) ? txt : n;
          }

          // if (DEBUG) console.log("Dashboard got response from", ep.url, "=>", json);

          const out = await ep.mapper(json);
          for (const k of Object.keys(out)) {
            if (out[k] != null && !Number.isNaN(Number(out[k]))) {
              merged[k] = Number(out[k]);
            }
          }

          // if we have all counts, stop early
          if (merged.apply != null && merged.pending != null && merged.approved != null && merged.rejected != null) {
            if (DEBUG) console.log("All counts obtained — stopping early.");
            break;
          }
        } catch (err) {
          if (DEBUG) console.warn("fetch error for", ep.url, err);
        }
      }

      // Final fallback: keep previous values if null (to avoid flicker)
      if (isActive) {
        if (merged.apply != null) setApplyFormCount(merged.apply);
        if (merged.pending != null) setPendingFilesCount(merged.pending);
        if (merged.approved != null) setApprovedFilesCount(merged.approved);
        if (merged.rejected != null) setRejectedFilesCount(merged.rejected);
      }
    } catch (error) {
      if (DEBUG) console.warn("Error in fetchCounts:", error);
    }
  };

  const handleLogout = async () => {
    console.log('[Dashboard] Logging out (lock session)');
    await clearSession();
    navigation.replace("Login");
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#ffffff" }}>
      <View style={{ flex: 1, backgroundColor: "#ffffff" }}>
        <Navbar
          user={user}
          onLogout={handleLogout}
        />

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
          <View style={{ padding: 18 }}>
            <Text style={styles.heading}>Dashboard</Text>

            <DashboardCard
              title="Apply Form"
              // count={applyFormCount}
              icon={<MaterialIcons name="note-add" size={28} color={ORANGE} />}
              borderColor={ORANGE}
              onPress={() => navigation.navigate("ApplyForm")}
            />
            <DashboardCard
              title="Pending Files"
              count={pendingFilesCount}
              icon={<MaterialIcons name="schedule" size={28} color={YELLOW} />}
              borderColor={YELLOW}
              onPress={() => navigation.navigate("PendingFiles")}
            />
            <DashboardCard
              title="Approved Files"
              count={approvedFilesCount}
              icon={<MaterialIcons name="check-circle" size={28} color={GREEN} />}
              borderColor={GREEN}
              onPress={() => navigation.navigate("ApprovedFiles")}
            />
            <DashboardCard
              title="Rejected Files"
              count={rejectedFilesCount}
              icon={<MaterialIcons name="cancel" size={28} color={RED} />}
              borderColor={RED}
              onPress={() => navigation.navigate("RejectedFiles")}
            />
          </View>

          <View style={{ flex: 1, justifyContent: "flex-end" }}>
            <Footer />
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

function DashboardCard({ title, count, icon, borderColor, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.card, { borderColor }]}
      activeOpacity={0.85}
      onPress={onPress}
    >
      <View style={styles.cardContent}>
        <View>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.cardCount}>{count}</Text>
        </View>
        <View style={styles.iconWrap}>{icon}</View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  heading: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#A34B1A",
    marginBottom: 18,
    marginLeft: 6,
    marginTop: 12,
  },
  card: {
    backgroundColor: "#fff6ec",
    borderRadius: 14,
    borderWidth: 2,
    marginBottom: 18,
    elevation: 2,
    paddingVertical: 18,
    paddingHorizontal: 20,
  },
  cardContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardTitle: {
    fontSize: 17,
    color: "#222",
    fontWeight: "600",
    marginBottom: 3,
  },
  cardCount: {
    fontSize: 28,
    color: "#171717",
    fontWeight: "bold",
    marginTop: 4,
  },
  iconWrap: {
    backgroundColor: "#fff4e3",
    borderRadius: 24,
    padding: 6,
    alignItems: "center",
    justifyContent: "center",
  },
});
