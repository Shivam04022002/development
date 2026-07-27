import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import Navbar from '../components/Navbar';
import { API_BASE } from '../config';

const ORANGE = "#FF9100";
const GREEN = "#34C759";
const RED = "#FF3B30";
const BLUE = "#007AFF";

export default function NotificationsScreen({ navigation }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const loadUser = async () => {
      const userJson = await AsyncStorage.getItem('userInfo');
      if (userJson) setUser(JSON.parse(userJson));
    };
    loadUser();
  }, []);

  const fetchNotifications = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) return;

      const res = await fetch(`${API_BASE}/api/notifications`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data);
      }
    } catch (err) {
      console.warn("Failed to fetch notifications", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchNotifications();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchNotifications();
  };

  const markAllAsRead = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      await fetch(`${API_BASE}/api/notifications/read-all`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` }
      });
      // Optimistically update UI
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch (err) {
      console.warn("Error marking all as read", err);
    }
  };

  const markAsReadAndNavigate = async (notification) => {
    // If formId exists -> navigate to ApplicationDetails screen
    if (notification.formId) {
      navigation.navigate('ApplicationDetails', { formId: notification.formId });
    } else {
      // Fallbacks
      if (notification.type === 'approved') navigation.navigate('ApprovedFiles');
      else if (notification.type === 'rejected') navigation.navigate('RejectedFiles');
      else navigation.navigate('Dashboard');
    }

    if (notification.read) return;

    try {
      const token = await AsyncStorage.getItem('userToken');
      await fetch(`${API_BASE}/api/notifications/${notification._id}/read`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` }
      });
      // We don't really need to update state here as we navigate away, 
      // but if the user comes back, useFocusEffect will refetch
    } catch (err) {
      console.warn("Error marking as read", err);
    }
  };

  const getIconData = (type) => {
    switch (type) {
      case 'approved': return { icon: 'check-circle', color: GREEN, bg: '#E8F8EE' };
      case 'rejected': return { icon: 'cancel', color: RED, bg: '#FFEBEC' };
      case 'updated': return { icon: 'update', color: BLUE, bg: '#E6F0FF' };
      default: return { icon: 'notifications', color: ORANGE, bg: '#FFF4E0' };
    }
  };

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const renderItem = ({ item }) => {
    const { icon, color, bg } = getIconData(item.type);
    
    return (
      <TouchableOpacity 
        style={[styles.notificationCard, !item.read && styles.unreadCard]}
        onPress={() => markAsReadAndNavigate(item)}
      >
        <View style={[styles.iconWrapper, { backgroundColor: bg }]}>
          <MaterialIcons name={icon} size={28} color={color} />
        </View>
        <View style={styles.textContainer}>
          <View style={styles.headerRow}>
            <Text style={[styles.title, !item.read && styles.boldText]}>{item.title}</Text>
            {!item.read && <View style={styles.unreadDot} />}
          </View>
          {item.formId ? <Text style={styles.formIdText}>Form ID: {item.formId}</Text> : null}
          <Text style={[styles.body, !item.read && styles.boldText]}>{item.body}</Text>
          <Text style={styles.time}>{formatTime(item.createdAt)}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const hasUnread = notifications.some(n => !n.read);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff7ed" }}>
      <Navbar user={user} onLogout={() => navigation.replace("Login")} />
      
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
           <MaterialIcons name="arrow-back" size={24} color="#A34B1A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        {hasUnread ? (
          <TouchableOpacity onPress={markAllAsRead}>
            <Text style={styles.markReadText}>Mark all read</Text>
          </TouchableOpacity>
        ) : <View style={{ width: 80 }} />}
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={ORANGE} />
        </View>
      ) : notifications.length === 0 ? (
        <View style={styles.centerContainer}>
          <MaterialIcons name="notifications-none" size={60} color="#ccc" />
          <Text style={styles.emptyText}>No notifications yet</Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item._id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[ORANGE]} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    elevation: 2,
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#A34B1A',
  },
  markReadText: {
    color: ORANGE,
    fontWeight: '600',
    fontSize: 14,
  },
  listContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  notificationCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    elevation: 1,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  unreadCard: {
    backgroundColor: '#FFFaf2',
    borderColor: '#FFE0B2',
  },
  iconWrapper: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  textContainer: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 16,
    color: '#222',
  },
  body: {
    fontSize: 14,
    color: '#555',
    marginBottom: 6,
    lineHeight: 20,
  },
  formIdText: {
    fontSize: 12,
    color: '#888',
    fontWeight: 'bold',
    marginBottom: 4,
  },
  boldText: {
    fontWeight: 'bold',
    color: '#000',
  },
  time: {
    fontSize: 12,
    color: '#888',
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: ORANGE,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    marginTop: 12,
    fontSize: 16,
    color: '#888',
  }
});
