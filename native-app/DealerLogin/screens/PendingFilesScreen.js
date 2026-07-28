import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert
} from 'react-native';
import Navbar from '../components/Navbar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import axios from 'axios';
import { useNavigation } from '@react-navigation/native';
import ViewLoanApplicationScreen from './ViewLoanApplicationScreen';
import { API_BASE } from '../config';
import DateTimePicker from '@react-native-community/datetimepicker';
import { stageColor, stageLabel } from '../utils/workflowConfig';

// Applicant shape differs by record age: legacy records nest the real applicant
// one level down (applicant.applicant), newer ones store it flat. Resolve once
// so the list reads a plain `.name`.
const resolveApplicant = (file) => file?.applicant?.applicant || file?.applicant || {};

export default function PendingFilesScreen({ navigation }) {

  const [user, setUser] = useState(null);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const formatDate = (dateValue) => {
    if (!dateValue) return '';
    const date = new Date(dateValue);
    const d = date.getDate().toString().padStart(2, '0');
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const y = date.getFullYear();
    return `${d}/${m}/${y}`;
  };

  const onStartDateChange = (event, selectedDate) => {
    setShowStartPicker(false);
    if (selectedDate) setStartDate(selectedDate);
  };

  const onEndDateChange = (event, selectedDate) => {
    setShowEndPicker(false);
    if (selectedDate) setEndDate(selectedDate);
  };

  useEffect(() => {
    const loadUser = async () => {
      try {
        const userJson = await AsyncStorage.getItem('userInfo');
        console.log('Loaded user info:', userJson);
        if (userJson) setUser(JSON.parse(userJson));
      } catch (err) {
        console.log('Error loading user info:', err);
      }
    };
    loadUser();

    const fetchPendingFiles = async () => {
      try {
        const token = await AsyncStorage.getItem('userToken');
        console.log('User token:', token);

        const response = await axios.get(`${API_BASE}/api/pending-files`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        console.log('Pending files fetched:', response.data);
        setFiles(response.data);
      } catch (error) {
        console.error("Error fetching pending files:", error.response?.data || error.message);
        Alert.alert("Error", "Failed to fetch pending files.");
      } finally {
        setLoading(false);
      }
    };
    fetchPendingFiles();
  }, []);

  const getFilteredFiles = () => {
    let result = files;

    if (searchQuery.trim()) {
      const lowerQuery = searchQuery.toLowerCase().trim();
      result = result.filter(f => {
        const name = (resolveApplicant(f).name || '').toLowerCase();
        const id = (f._id || f.formId || '').toLowerCase();
        return name.includes(lowerQuery) || id.includes(lowerQuery);
      });
    }

    if (startDate || endDate) {
      result = result.filter(f => {
        const fileDate = new Date(f.createdAt);
        fileDate.setHours(0, 0, 0, 0);

        if (startDate) {
          const sDate = new Date(startDate);
          sDate.setHours(0, 0, 0, 0);
          if (fileDate < sDate) return false;
        }
        if (endDate) {
          const eDate = new Date(endDate);
          eDate.setHours(23, 59, 59, 999);
          if (fileDate > eDate) return false;
        }
        return true;
      });
    }
    return result;
  };

  const filteredFiles = getFilteredFiles();

  const handleRowPress = (file) => {
    console.log("Row pressed for file:", file); // good for debugging
    navigation.navigate('ViewLoanApplicationScreen', { fileId: file._id });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff7ed' }}>
      <View style={{ flex: 1, backgroundColor: '#fff' }}>
        <Navbar user={user} onLogout={() => navigation.replace('Login')} />

        <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
          <Text style={styles.heading}>Pending Files</Text>

          <View style={styles.searchRow}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search by Name or Form ID..."
              placeholderTextColor="#888"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>

          <View style={styles.filterRow}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.filterLabel}>Start Date</Text>
              <TouchableOpacity onPress={() => setShowStartPicker(true)}>
                <TextInput
                  style={styles.filterInput}
                  placeholder="dd/mm/yyyy"
                  placeholderTextColor="#888"
                  value={formatDate(startDate)}
                  editable={false}
                  pointerEvents="none"
                />
              </TouchableOpacity>
              {showStartPicker && (
                <DateTimePicker
                  value={startDate ? new Date(startDate) : new Date()}
                  mode="date"
                  display="default"
                  onChange={onStartDateChange}
                />
              )}
            </View>
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={styles.filterLabel}>End Date</Text>
              <TouchableOpacity onPress={() => setShowEndPicker(true)}>
                <TextInput
                  style={styles.filterInput}
                  placeholder="dd/mm/yyyy"
                  placeholderTextColor="#888"
                  value={formatDate(endDate)}
                  editable={false}
                  pointerEvents="none"
                />
              </TouchableOpacity>
              {showEndPicker && (
                <DateTimePicker
                  value={endDate ? new Date(endDate) : new Date()}
                  mode="date"
                  display="default"
                  onChange={onEndDateChange}
                />
              )}
            </View>
          </View>

          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={[styles.th, { flex: 2.5 }]}>Customer Name</Text>
              <Text style={[styles.th, { flex: 1.5, textAlign: 'center' }]}>Stage</Text>
              <Text style={[styles.th, { flex: 1.5, textAlign: 'right' }]}>Date</Text>
            </View>

            {loading ? (
              <Text style={styles.noFilesText}>Loading pending files...</Text>
            ) : filteredFiles.length === 0 ? (
              <Text style={styles.noFilesText}>No pending files found.</Text>
            ) : (
              filteredFiles.map((file, idx) => (
                <TouchableOpacity
                  key={file._id}
                  onPress={() => handleRowPress(file)}
                  activeOpacity={0.65}
                >
                  <View
                    style={[
                      styles.tableRow,
                      idx === filteredFiles.length - 1 ? { borderBottomWidth: 0 } : {},
                    ]}
                  >
                    <View style={{ flex: 2.5, paddingRight: 8, justifyContent: 'center' }}>
                      <Text style={styles.tdName} numberOfLines={2}>
                        {resolveApplicant(file).name || 'N/A'}
                      </Text>
                    </View>
                    <View style={{ flex: 1.5, justifyContent: 'center', alignItems: 'center' }}>
                      <View style={[styles.stageBadge, { backgroundColor: stageColor(file.workflowStage).bg, borderColor: stageColor(file.workflowStage).border }]}>
                        <Text style={[styles.stageBadgeText, { color: stageColor(file.workflowStage).text }]}>
                          {stageLabel(file.workflowStage) || file.status || 'N/A'}
                        </Text>
                      </View>
                    </View>
                    <View style={{ flex: 1.5, justifyContent: 'center' }}>
                      <Text style={[styles.td, { textAlign: 'right' }]}>
                        {formatDate(file.createdAt)}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  heading: {
    fontSize: 28,
    fontWeight: '800',
    color: '#000',
    marginTop: 20,
    marginBottom: 10,
    textAlign: 'left',
    marginLeft: 18,
    letterSpacing: -0.5,
  },
  filterRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 18,
    marginTop: 4,
    justifyContent: 'space-between',
  },
  filterLabel: {
    color: '#333',
    fontWeight: '700',
    marginBottom: 4,
    fontSize: 14,
    marginLeft: 2,
  },
  searchRow: {
    marginHorizontal: 16,
    marginBottom: 8,
  },
  searchInput: {
    borderWidth: 1.5,
    borderColor: '#E5E5E5',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    backgroundColor: '#FAFAFA',
    color: '#000',
  },
  filterInput: {
    borderWidth: 1.5,
    borderColor: '#E5E5E5',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    backgroundColor: '#FAFAFA',
    color: '#000',
  },
  table: {
    marginTop: 8,
    backgroundColor: '#fff',
    borderRadius: 14,
    marginHorizontal: 10,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#FAFAFA',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1.5,
    borderBottomColor: '#E0E0E0',
    alignItems: 'center',
  },
  th: {
    color: '#000',
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: -0.2,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    backgroundColor: '#fff',
    minHeight: 70,
  },
  tdName: {
    fontSize: 15,
    color: '#000',
    fontWeight: '600',
  },
  td: {
    fontSize: 14,
    color: '#444',
  },
  noFilesText: {
    textAlign: 'center',
    padding: 30,
    color: '#888',
    fontSize: 15,
  },
  stageBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EAEAEA',
  },
  stageBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'capitalize',
    letterSpacing: 0.2,
  },
});
