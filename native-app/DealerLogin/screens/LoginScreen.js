import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  Modal,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { API_BASE } from '../config';
import { isBiometricAvailable, authenticate, getBiometricType } from '../utils/BiometricAuth';
import {
  saveSession,
  setBiometricEnabled,
  isBiometricEnabled as checkBiometricEnabled,
  getToken,
  getUserId,
  getUserInfo,
} from '../utils/SecureStorage';

const { width } = Dimensions.get('window');
const ORANGE = '#FF9100';
const DARK_BLUE = '#1a1a2e';
const GRADIENT_START = '#3450A1';
const GRADIENT_END = '#1a237e';

export default function LoginScreen({ navigation }) {
  const theme = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Biometric state
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabledState] = useState(false);
  const [biometricType, setBiometricType] = useState(null);

  // Enable biometric popup
  const [showBiometricPopup, setShowBiometricPopup] = useState(false);
  const [pendingLoginData, setPendingLoginData] = useState(null);

  useEffect(() => {
    checkBiometricStatus();
  }, []);

  const checkBiometricStatus = async () => {
    const available = await isBiometricAvailable();
    setBiometricAvailable(available);

    if (available) {
      const type = await getBiometricType();
      setBiometricType(type);
    }

    const enabled = await checkBiometricEnabled();
    setBiometricEnabledState(enabled);
  };

  // ─── Email + Password Login ─────────────────────────────

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Please enter email and password');
      return;
    }

    setError('');
    setLoading(true);

    try {
      console.log(`[Login] Attempting login at: ${API_BASE}/api/auth/login`);
      const response = await axios.post(`${API_BASE}/api/auth/login`, { email, password }, {
        timeout: 10000, 
        headers: { 'Content-Type': 'application/json' }
      });
      const data = response.data;

      if (data.token) {
        const userId = data.user?._id || data.user?.id || '';

        // Save session
        await saveSession(data.token, userId, data.user);

        // If biometric is available but not yet enabled, show the popup
        if (biometricAvailable && !biometricEnabled) {
          setPendingLoginData(data);
          setShowBiometricPopup(true);
        } else {
          // Already enabled or not available – go straight to Dashboard
          navigation.replace('Dashboard');
        }
      }
    } catch (err) {
      console.error('[Login Error]:', err.message);
      if (err.response) {
        // Server responded with a status other than 2xx
        setError(err.response.data?.message || 'Invalid credentials or server error.');
      } else if (err.request) {
        // The request was made but no response was received (Network error/timeout)
        setError('Network error. Unable to connect to the server. Please check your internet connection.');
      } else {
        // Something happened in setting up the request that triggered an Error
        setError('An unexpected error occurred. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // ─── Biometric Popup Handlers ───────────────────────────

  const handleEnableBiometric = async () => {
    await setBiometricEnabled(true);
    setBiometricEnabledState(true);
    setShowBiometricPopup(false);
    navigation.replace('Dashboard');
  };

  const handleSkipBiometric = () => {
    setShowBiometricPopup(false);
    navigation.replace('Dashboard');
  };

  // ─── Fingerprint Login ──────────────────────────────────

  const handleBiometricLogin = async () => {
    setError('');
    setLoading(true);

    try {
      const result = await authenticate('Authenticate to login');

      if (result.success) {
        const token = await getToken();
        console.log('[Biometric Login] Auth success, token:', token ? 'exists' : 'null');
        
        if (token) {
          // Token exists — try to refresh it
          try {
            console.log(`[Biometric Login] Refreshing token at: ${API_BASE}/api/auth/refresh`);
            const refreshRes = await axios.post(`${API_BASE}/api/auth/refresh`, {}, {
              timeout: 15000,
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
            });
            const refreshData = refreshRes.data;
            if (refreshData.token) {
              const existingUserId = await getUserId();
              const existingUser = await getUserInfo();
              await saveSession(
                refreshData.token,
                refreshData.user?._id || refreshData.user?.id || existingUserId || '',
                refreshData.user || existingUser || {}
              );
              console.log('[Biometric Login] Token refreshed — navigating to Dashboard');
              navigation.replace('Dashboard');
            } else {
              setError('Session expired. Please login with your credentials.');
            }
          } catch (refreshErr) {
            console.warn('[Biometric Login] Token refresh failed:', refreshErr.message);
            
            // Refresh failed — but check if existing token is still valid
            // (e.g. network timeout but token is not expired yet)
            try {
              const validateRes = await axios.post(`${API_BASE}/api/auth/validate`, {}, {
                timeout: 10000,
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json',
                },
              });
              if (validateRes.data?.valid) {
                console.log('[Biometric Login] Token still valid — continuing to Dashboard');
                const existingUser = await getUserInfo();
                if (validateRes.data.user) {
                  await saveSession(token, validateRes.data.user._id || '', validateRes.data.user);
                }
                navigation.replace('Dashboard');
                return;
              }
            } catch (validateErr) {
              console.warn('[Biometric Login] Token validation also failed:', validateErr.message);
            }
            
            setError('Session expired. Please login with your credentials.');
          }
        } else {
          // No token stored — need to login with credentials first
          const existingUser = await getUserInfo();
          if (existingUser) {
            setError('Your session has expired. Please login with your credentials to restore access.');
          } else {
            setError('No saved session found. Please login with your credentials.');
          }
        }
      } else {
        setError('Biometric authentication failed. Try again or use your credentials.');
      }
    } catch (err) {
      console.error('[Biometric Login] Error:', err);
      setError('Biometric authentication error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ─── Render ─────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.container, { backgroundColor: theme.background }]}>
          {/* Header */}
          <View style={styles.headerSection}>
            <View style={styles.logoContainer}>
              <MaterialIcons name="account-balance" size={42} color={GRADIENT_START} />
            </View>
            <Text style={[styles.appName, { color: theme.text }]}>Dealer Mitra</Text>
            <Text style={[styles.subtitle, { color: theme.placeholder }]}>
              Secure Dealer Finance Portal
            </Text>
          </View>

          {/* Error Message */}
          {error ? (
            <View style={styles.errorContainer}>
              <MaterialIcons name="error-outline" size={18} color="#D32F2F" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Email Input */}
          <View style={[styles.inputContainer, { backgroundColor: theme.card }]}>
            <MaterialIcons name="email" size={20} color={theme.placeholder} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { color: theme.text }]}
              placeholder="Email Address"
              placeholderTextColor={theme.placeholder}
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
          </View>

          {/* Password Input */}
          <View style={[styles.inputContainer, { backgroundColor: theme.card }]}>
            <MaterialIcons name="lock" size={20} color={theme.placeholder} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { color: theme.text, flex: 1 }]}
              placeholder="Password"
              placeholderTextColor={theme.placeholder}
              secureTextEntry={!showPassword}
              textContentType="password"
              value={password}
              onChangeText={setPassword}
            />
            <TouchableOpacity
              onPress={() => setShowPassword(!showPassword)}
              style={styles.eyeButton}
            >
              <MaterialIcons
                name={showPassword ? 'visibility' : 'visibility-off'}
                size={20}
                color={theme.placeholder}
              />
            </TouchableOpacity>
          </View>

          {/* Sign In Button */}
          <TouchableOpacity
            style={[styles.loginButton, loading && styles.loginButtonDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <MaterialIcons name="login" size={20} color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.loginButtonText}>Sign In</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Biometric Login Section */}
          {biometricEnabled && biometricAvailable ? (
            <>
              {/* Divider */}
              <View style={styles.dividerContainer}>
                <View style={[styles.dividerLine, { backgroundColor: theme.placeholder + '40' }]} />
                <Text style={[styles.dividerText, { color: theme.placeholder }]}>OR</Text>
                <View style={[styles.dividerLine, { backgroundColor: theme.placeholder + '40' }]} />
              </View>

              {/* Fingerprint Button */}
              <TouchableOpacity
                style={styles.biometricButton}
                onPress={handleBiometricLogin}
                disabled={loading}
                activeOpacity={0.85}
              >
                <MaterialIcons
                  name={biometricType === 'FaceID' ? 'face' : 'fingerprint'}
                  size={28}
                  color={ORANGE}
                />
                <Text style={styles.biometricButtonText}>
                  Login with bioMetric
                </Text>
              </TouchableOpacity>
            </>
          ) : null}

          {/* Security Badge */}
          <View style={styles.securityBadge}>
            <MaterialIcons name="verified-user" size={14} color="#4CAF50" />
            <Text style={[styles.securityText, { color: theme.placeholder }]}>
              Secured with 256-bit encryption
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* ─── Enable Biometric Popup ─────────────────────────── */}
      <Modal
        visible={showBiometricPopup}
        transparent
        animationType="fade"
        onRequestClose={handleSkipBiometric}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.popupContainer}>
            {/* Icon */}
            <View style={styles.popupIconContainer}>
              <MaterialIcons name="fingerprint" size={48} color={GRADIENT_START} />
            </View>

            <Text style={styles.popupTitle}>Enable Biometric Login</Text>
            <Text style={styles.popupMessage}>
              Do you want to enable fingerprint login for faster and secure access?
            </Text>

            <View style={styles.popupButtonRow}>
              <TouchableOpacity
                style={[styles.popupButton, styles.popupButtonNo]}
                onPress={handleSkipBiometric}
                activeOpacity={0.8}
              >
                <Text style={styles.popupButtonNoText}>NO</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.popupButton, styles.popupButtonYes]}
                onPress={handleEnableBiometric}
                activeOpacity={0.8}
              >
                <MaterialIcons name="fingerprint" size={18} color="#fff" style={{ marginRight: 6 }} />
                <Text style={styles.popupButtonYesText}>YES</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ──────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Header
  headerSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#EBF0FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    elevation: 4,
    shadowColor: '#3450A1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  appName: {
    fontSize: 28,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 14,
    marginTop: 4,
    letterSpacing: 0.3,
  },

  // Error
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFEBEE',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
    width: '100%',
    maxWidth: 340,
  },
  errorText: {
    color: '#D32F2F',
    fontSize: 14,
    marginLeft: 8,
    flex: 1,
  },

  // Inputs
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    maxWidth: 340,
    height: 52,
    borderColor: '#E0E0E0',
    borderWidth: 1,
    borderRadius: 12,
    marginBottom: 14,
    paddingHorizontal: 14,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 16,
    height: '100%',
  },
  eyeButton: {
    padding: 6,
  },

  // Login Button
  loginButton: {
    width: '100%',
    maxWidth: 340,
    flexDirection: 'row',
    backgroundColor: GRADIENT_START,
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    elevation: 4,
    shadowColor: GRADIENT_START,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  loginButtonDisabled: {
    opacity: 0.7,
  },
  loginButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 17,
    letterSpacing: 0.5,
  },

  // Divider
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    maxWidth: 340,
    marginVertical: 22,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    marginHorizontal: 16,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 1,
  },

  // Biometric Button
  biometricButton: {
    width: '100%',
    maxWidth: 340,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: ORANGE,
    backgroundColor: '#FFF8F0',
  },
  biometricButtonText: {
    color: ORANGE,
    fontWeight: 'bold',
    fontSize: 16,
    marginLeft: 10,
    letterSpacing: 0.3,
  },

  // Security Badge
  securityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 28,
  },
  securityText: {
    fontSize: 12,
    marginLeft: 6,
  },

  // Modal / Popup
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  popupContainer: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    width: '100%',
    maxWidth: 340,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
  },
  popupIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#EBF0FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
  },
  popupTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a1a2e',
    marginBottom: 10,
    textAlign: 'center',
  },
  popupMessage: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  popupButtonRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
  },
  popupButton: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  popupButtonNo: {
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  popupButtonNoText: {
    color: '#666',
    fontWeight: 'bold',
    fontSize: 15,
    letterSpacing: 0.5,
  },
  popupButtonYes: {
    backgroundColor: GRADIENT_START,
    elevation: 3,
  },
  popupButtonYesText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 15,
    letterSpacing: 0.5,
  },
});
