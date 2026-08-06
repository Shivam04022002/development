import React, { useState } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

/**
 * DocumentUploadCard — a large "pick one image" card.
 *
 * Uses expo-image-picker, already a project dependency and already the app's
 * image source in ApplicationFormScreen. The picker options and the produced
 * image object are the same as that screen's selectImage(), so a file picked
 * here is byte-identical in shape to one picked during application creation:
 *
 *     { uri, type: 'image/jpeg', name: 'upload-<ts>.jpg' }
 *
 * Camera note: the Android manifest does not currently declare
 * android.permission.CAMERA, so on a release build the camera request is
 * refused by the OS. That is surfaced as a clear message rather than a silent
 * failure, and the gallery path is unaffected. Adding the permission is a
 * native rebuild, which is outside a UI phase.
 */
export default function DocumentUploadCard({
  label,
  value,
  onChange,
  error,
  disabled = false,
}) {
  const [busy, setBusy] = useState(false);

  const toImage = (asset) => ({
    uri: asset.uri,
    type: 'image/jpeg',
    name: `upload-${Date.now()}.jpg`,
  });

  const pickFromGallery = async () => {
    if (disabled || busy) return;
    setBusy(true);
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'We need media permission to select images.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.5,
      });
      if (!result.canceled && result.assets?.length > 0) onChange(toImage(result.assets[0]));
    } catch (err) {
      Alert.alert('Error', 'Failed to select image.');
      console.error('[DocumentUploadCard] gallery error:', err);
    } finally {
      setBusy(false);
    }
  };

  const pickFromCamera = async () => {
    if (disabled || busy) return;
    setBusy(true);
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Camera unavailable',
          'Camera permission was not granted. You can still choose the photo from your gallery.'
        );
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 0.5,
      });
      if (!result.canceled && result.assets?.length > 0) onChange(toImage(result.assets[0]));
    } catch (err) {
      Alert.alert(
        'Camera unavailable',
        'The camera could not be opened. You can still choose the photo from your gallery.'
      );
      console.error('[DocumentUploadCard] camera error:', err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>

      <View style={[styles.box, error ? styles.boxError : null]}>
        {value ? (
          <>
            <Image source={{ uri: value.uri }} style={styles.preview} resizeMode="cover" />
            <View style={styles.btnRow}>
              <TouchableOpacity
                style={[styles.btn, disabled && styles.btnDisabled]}
                onPress={pickFromCamera}
                disabled={disabled || busy}
              >
                <MaterialIcons name="photo-camera" size={17} color="#3450A1" />
                <Text style={styles.btnText}>Retake</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, disabled && styles.btnDisabled]}
                onPress={pickFromGallery}
                disabled={disabled || busy}
              >
                <MaterialIcons name="photo-library" size={17} color="#3450A1" />
                <Text style={styles.btnText}>Change</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.btnRemove, disabled && styles.btnDisabled]}
                onPress={() => !disabled && onChange(null)}
                disabled={disabled || busy}
              >
                <MaterialIcons name="delete-outline" size={17} color="#D84315" />
                <Text style={[styles.btnText, { color: '#D84315' }]}>Remove</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            <View style={styles.placeholder}>
              {busy ? (
                <ActivityIndicator size="small" color="#FF7300" />
              ) : (
                <>
                  <MaterialIcons name="add-a-photo" size={32} color="#C7A98A" />
                  <Text style={styles.placeholderText}>No image selected</Text>
                </>
              )}
            </View>
            <View style={styles.btnRow}>
              <TouchableOpacity
                style={[styles.btn, disabled && styles.btnDisabled]}
                onPress={pickFromCamera}
                disabled={disabled || busy}
              >
                <MaterialIcons name="photo-camera" size={17} color="#3450A1" />
                <Text style={styles.btnText}>Camera</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, disabled && styles.btnDisabled]}
                onPress={pickFromGallery}
                disabled={disabled || busy}
              >
                <MaterialIcons name="photo-library" size={17} color="#3450A1" />
                <Text style={styles.btnText}>Gallery</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

// Values mirror ApplicationFormScreen's imagePicker / docBtn / error styles so
// this card reads as part of the same form language.
const styles = StyleSheet.create({
  wrap: { marginBottom: 18 },
  label: { fontSize: 15, fontWeight: '600', color: '#000000', marginBottom: 5, marginLeft: 2 },
  box: {
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 8,
    backgroundColor: '#FAFAFA',
    padding: 12,
  },
  boxError: { borderColor: '#E55B13' },
  placeholder: {
    height: 150,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF7ED',
    borderRadius: 8,
  },
  placeholderText: { color: '#A67435', fontSize: 13.5, marginTop: 8 },
  preview: { width: '100%', height: 150, borderRadius: 8, backgroundColor: '#EEE' },
  btnRow: { flexDirection: 'row', marginTop: 10 },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#3450A1',
    borderRadius: 8,
    paddingVertical: 9,
    marginHorizontal: 3,
    backgroundColor: '#fff',
  },
  btnRemove: { borderColor: '#D84315', backgroundColor: '#FFF3E0' },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: '#3450A1', fontWeight: '600', fontSize: 13.5, marginLeft: 5 },
  error: { color: '#E55B13', fontSize: 12.5, marginTop: 4, marginLeft: 2, fontWeight: 'bold' },
});
