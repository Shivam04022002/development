import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * SecureStorage Utility
 * Centralized AsyncStorage wrapper for managing authentication session data.
 * Keys: userToken, userId, biometricEnabled, userInfo
 */

const KEYS = {
  TOKEN: 'userToken',
  USER_ID: 'userId',
  BIOMETRIC_ENABLED: 'biometricEnabled',
  USER_INFO: 'userInfo',
};

// ─── Token ──────────────────────────────────────────────

export const saveToken = async (token) => {
  console.log('[SecureStorage] Saving token:', token ? `${token.substring(0, 20)}...` : 'null');
  await AsyncStorage.setItem(KEYS.TOKEN, token);
};

export const getToken = async () => {
  const token = await AsyncStorage.getItem(KEYS.TOKEN);
  console.log('[SecureStorage] getToken:', token ? `${token.substring(0, 20)}...` : 'null');
  return token;
};

// ─── User ID ────────────────────────────────────────────

export const saveUserId = async (userId) => {
  await AsyncStorage.setItem(KEYS.USER_ID, String(userId));
};

export const getUserId = async () => {
  return await AsyncStorage.getItem(KEYS.USER_ID);
};

// ─── User Info ──────────────────────────────────────────

export const saveUserInfo = async (userInfo) => {
  console.log('[SecureStorage] Saving userInfo:', userInfo ? JSON.stringify(userInfo).substring(0, 80) : 'null');
  await AsyncStorage.setItem(KEYS.USER_INFO, JSON.stringify(userInfo));
};

export const getUserInfo = async () => {
  const json = await AsyncStorage.getItem(KEYS.USER_INFO);
  return json ? JSON.parse(json) : null;
};

// ─── Biometric Preference ───────────────────────────────

export const setBiometricEnabled = async (enabled) => {
  console.log('[SecureStorage] setBiometricEnabled:', enabled);
  await AsyncStorage.setItem(KEYS.BIOMETRIC_ENABLED, JSON.stringify(enabled));
};

export const isBiometricEnabled = async () => {
  const value = await AsyncStorage.getItem(KEYS.BIOMETRIC_ENABLED);
  return value === 'true' || value === true;
};

// ─── Session Management ─────────────────────────────────

/**
 * Save a complete login session.
 * @param {string} token - JWT token
 * @param {string} userId - User's ID
 * @param {object} userInfo - User profile data
 */
export const saveSession = async (token, userId, userInfo) => {
  console.log('[SecureStorage] saveSession — saving token, userId, userInfo');
  await Promise.all([
    saveToken(token),
    saveUserId(userId),
    saveUserInfo(userInfo),
  ]);
};

/**
 * Lock session (normal logout / lock screen).
 * Removes only the token so the user must re-authenticate.
 * Keeps userId, userInfo, and biometricEnabled so biometric login can
 * still unlock the session — like a banking app lock screen.
 */
export const clearSession = async () => {
  console.log('[SecureStorage] clearSession — removing token only (keeping userInfo for biometric)');
  await AsyncStorage.removeItem(KEYS.TOKEN);
};

/**
 * Full logout — clears everything including biometric preference.
 * Use this when the user explicitly wants to sign out completely.
 * After this, the user must re-enter credentials.
 */
export const fullLogout = async () => {
  console.log('[SecureStorage] fullLogout — clearing ALL session data');
  await AsyncStorage.multiRemove([
    KEYS.TOKEN,
    KEYS.USER_ID,
    KEYS.BIOMETRIC_ENABLED,
    KEYS.USER_INFO,
  ]);
};

/**
 * Clear everything including biometric preference.
 * Use this only when the user explicitly disables biometric.
 */
export const clearAll = async () => {
  console.log('[SecureStorage] clearAll — clearing ALL data');
  await AsyncStorage.multiRemove([
    KEYS.TOKEN,
    KEYS.USER_ID,
    KEYS.BIOMETRIC_ENABLED,
    KEYS.USER_INFO,
  ]);
};

export default {
  saveToken,
  getToken,
  saveUserId,
  getUserId,
  saveUserInfo,
  getUserInfo,
  setBiometricEnabled,
  isBiometricEnabled,
  saveSession,
  clearSession,
  fullLogout,
  clearAll,
  KEYS,
};
