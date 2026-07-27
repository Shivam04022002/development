import * as LocalAuthentication from 'expo-local-authentication';

/**
 * BiometricAuth Utility
 * Handles device biometric availability checks and authentication prompts
 * using expo-local-authentication.
 */

/**
 * Check if the device has biometric hardware and enrolled biometrics.
 * @returns {Promise<boolean>}
 */
export const isBiometricAvailable = async () => {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) return false;

    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    return isEnrolled;
  } catch (error) {
    console.warn('BiometricAuth: availability check failed', error);
    return false;
  }
};

/**
 * Get the supported biometric type string for display purposes.
 * @returns {Promise<'Fingerprint' | 'FaceID' | 'Iris' | null>}
 */
export const getBiometricType = async () => {
  try {
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      return 'FaceID';
    }
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      return 'Fingerprint';
    }
    if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
      return 'Iris';
    }
    return null;
  } catch (error) {
    console.warn('BiometricAuth: type check failed', error);
    return null;
  }
};

/**
 * Trigger the OS biometric authentication prompt.
 * @param {string} promptMessage - Message shown to the user in the biometric dialog
 * @returns {Promise<{ success: boolean, error: string | null }>}
 */
export const authenticate = async (promptMessage = 'Authenticate to login') => {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: 'Cancel',
      disableDeviceFallback: false, // allow PIN/pattern as fallback
      fallbackLabel: 'Use Passcode',
    });

    return {
      success: result.success,
      error: result.error || null,
    };
  } catch (error) {
    console.warn('BiometricAuth: authentication failed', error);
    return {
      success: false,
      error: error.message || 'Authentication failed',
    };
  }
};

export default {
  isBiometricAvailable,
  getBiometricType,
  authenticate,
};
