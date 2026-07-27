import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';

// Utility for formatting to dd/mm/yyyy
const formatDDMMYYYY = (dateObj) => {
  const d = dateObj.getDate().toString().padStart(2, '0');
  const m = (dateObj.getMonth() + 1).toString().padStart(2, '0');
  const y = dateObj.getFullYear();
  return `${d}/${m}/${y}`;
};

export default function DateFilterBar({ value, onChange }) {
  const [showPicker, setShowPicker] = useState(false);

  // Converts dd/mm/yyyy to yyyy-mm-dd for backend comparison
  const formatForCompare = (val) => {
    if (!val) return '';
    const [d, m, y] = val.split('/');
    return `${y}-${m}-${d}`;
  };

  const onDateChange = (event, date) => {
    setShowPicker(false);
    if (date) {
      onChange(formatDDMMYYYY(date));
    }
  };

  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 15, marginVertical: 12
    }}>
      <TouchableOpacity onPress={() => setShowPicker(true)}>
        <Ionicons name="calendar-outline" size={20} color="#222" style={{ marginRight: 7 }} />
      </TouchableOpacity>
      <TextInput
        placeholder="Filter by Date (DD/MM/YYYY)"
        value={value}
        style={{
          flex: 1,
          borderWidth: 1,
          borderColor: '#eee',
          borderRadius: 8,
          paddingVertical: 7,
          paddingHorizontal: 10,
          color: '#111',
          backgroundColor: '#f8f8f8'
        }}
        onFocus={() => setShowPicker(true)}
        editable={false}
        pointerEvents="none"
      />
      {value !== '' && (
        <TouchableOpacity onPress={() => onChange('')}>
          <Ionicons name="close-circle" size={18} color="#d32f2f" style={{ marginLeft: 8 }} />
        </TouchableOpacity>
      )}
      {showPicker && (
        <DateTimePicker
          value={value ? new Date(formatForCompare(value)) : new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'calendar'}
          onChange={onDateChange}
        />
      )}
    </View>
  );
}
