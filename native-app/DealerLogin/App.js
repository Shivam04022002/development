import * as React from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LoginScreen from './screens/LoginScreen';
import DashboardScreen from './screens/DashboardScreen';
import { View, useColorScheme, StatusBar } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';

import ApplicationFormScreen from './screens/ApplicationFormScreen';
import PendingFilesScreen from './screens/PendingFilesScreen';
import ViewLoanApplicationScreen from './screens/ViewLoanApplicationScreen';
import ApprovedFilesScreen from './screens/ApprovedFilesScreen';
import ViewRejectedApplicationScreen from './screens/ViewRejectedApplicationScreen';
import RejectedFilesScreen from './screens/RejectedFilesScreen';
import ViewApprovedApplicationScreen from './screens/ViewApprovedApplicationScreen';
import DealerProfileScreen from './screens/DealerProfileScreen';
import NotificationsScreen from './screens/NotificationsScreen';
import ApplicationDetailsScreen from './screens/ApplicationDetailsScreen';
import CibilStatusScreen from './screens/CibilStatusScreen';
import { createNavigationContainerRef } from '@react-navigation/native';

import Toast from 'react-native-toast-message';
import * as Notifications from 'expo-notifications';
import { registerForPushNotificationsAsync } from './utils/PushNotifications';
import { API_BASE } from './config';
import Constants from 'expo-constants';

import { ThemeProvider } from './theme/ThemeContext';
import AnimatedSplash from './components/AnimatedSplash';
import { isBiometricAvailable, authenticate } from './utils/BiometricAuth';
import { isBiometricEnabled, getToken, saveSession, getUserId, getUserInfo } from './utils/SecureStorage';

// Prevent auto-hide of splash screen
SplashScreen.preventAutoHideAsync();

const Stack = createNativeStackNavigator();
export const navigationRef = createNavigationContainerRef();

export default function App() {
  const [isLoading, setIsLoading] = React.useState(true);
  const [initialRoute, setInitialRoute] = React.useState('Login');
  const [showSplash, setShowSplash] = React.useState(true);
  const colorScheme = useColorScheme();

  React.useEffect(() => {
    const initialize = async () => {
      try {
        // Hide native splash screen
        await SplashScreen.hideAsync();

        const token = await getToken();
        const biometricEnabled = await isBiometricEnabled();
        const userInfo = await getUserInfo();

        console.log('[App Init] token:', token ? `${token.substring(0, 20)}...` : 'null');
        console.log('[App Init] biometricEnabled:', biometricEnabled);
        console.log('[App Init] userInfo:', userInfo ? 'exists' : 'null');

        if (!token) {
          // No token at all — must login
          console.log('[App Init] No token — going to Login');
          setInitialRoute('Login');
          return;
        }

        if (!userInfo) {
          // Token exists but no userInfo — try to validate & refresh
          console.log('[App Init] Token exists but no userInfo — attempting refresh');
          try {
            const refreshRes = await fetch(`${API_BASE}/api/auth/refresh`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
            });
            const refreshData = await refreshRes.json();
            if (refreshRes.ok && refreshData.token && refreshData.user) {
              await saveSession(
                refreshData.token,
                refreshData.user._id || refreshData.user.id || '',
                refreshData.user
              );
              console.log('[App Init] Refresh succeeded, restored session');
              setInitialRoute('Dashboard');
              registerAndSavePushToken(refreshData.token);
              return;
            }
          } catch (refreshErr) {
            console.warn('[App Init] Refresh without userInfo failed:', refreshErr.message);
          }
          // Refresh failed — go to login
          setInitialRoute('Login');
          return;
        }

        // Token + userInfo exist
        if (biometricEnabled) {
          const biometricAvailable = await isBiometricAvailable();
          if (biometricAvailable) {
            console.log('[App Init] Prompting biometric authentication...');
            const result = await authenticate('Authenticate with fingerprint to continue');
            if (result.success) {
              console.log('[App Init] Biometric success — refreshing token');
              let currentToken = token;
              try {
                const refreshRes = await fetch(`${API_BASE}/api/auth/refresh`, {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                  },
                });
                const refreshData = await refreshRes.json();
                if (refreshRes.ok && refreshData.token) {
                  currentToken = refreshData.token;
                  const existingUserId = await getUserId();
                  await saveSession(
                    refreshData.token,
                    refreshData.user?._id || refreshData.user?.id || existingUserId || '',
                    refreshData.user || userInfo
                  );
                  console.log('[App Init] Token refreshed after biometric');
                } else {
                  // Refresh failed but token might still work — continue with existing token
                  console.warn('[App Init] Token refresh returned non-ok, continuing with existing token');
                }
              } catch (refreshErr) {
                // Network error during refresh — still allow entry with existing token
                console.warn('[App Init] Token refresh during app init failed:', refreshErr.message);
                console.log('[App Init] Continuing with existing token');
              }
              setInitialRoute('Dashboard');
              registerAndSavePushToken(currentToken);
            } else {
              // Biometric failed – stay on Login screen
              console.log('[App Init] Biometric failed — going to Login');
              setInitialRoute('Login');
            }
          } else {
            // Hardware not available but token exists – go to Dashboard
            console.log('[App Init] Biometric hardware unavailable — auto-login to Dashboard');
            setInitialRoute('Dashboard');
            registerAndSavePushToken(token);
          }
        } else {
          // Biometric not enabled, but token + userInfo exist — auto login
          console.log('[App Init] No biometric, but session exists — auto-login to Dashboard');
          setInitialRoute('Dashboard');
          registerAndSavePushToken(token);
        }
      } catch (e) {
        console.warn('[App Init] Error:', e);
        setInitialRoute('Login');
      } finally {
        setIsLoading(false);
      }
    };
    initialize();

    // Listen for incoming notifications while app is in foreground
    let notificationListener = null;
    let responseListener = null;
    if (Constants.appOwnership !== 'expo') {
      // This fires when a notification is received while the app is foregrounded
      notificationListener = Notifications.addNotificationReceivedListener(notification => {
        const { title, body } = notification.request.content;
        // Show a Toast so the user sees it even in-app
        const Toast = require('react-native-toast-message').default;
        Toast.show({
          type: 'info',
          text1: title || 'New Notification',
          text2: body || '',
          position: 'top',
          topOffset: 60,
          visibilityTime: 4000,
        });
      });

      // This fires when user taps on a notification
      responseListener = Notifications.addNotificationResponseReceivedListener(response => {
        const data = response.notification.request.content.data;
        if (data && data.formId) {
          // If we have formId, navigate to ApplicationDetails passing the formId
          if (navigationRef.isReady()) {
            navigationRef.navigate('ApplicationDetails', { formId: data.formId });
          } else {
            // Give it a moment if app is still mounting
            setTimeout(() => {
               if (navigationRef.isReady()) {
                 navigationRef.navigate('ApplicationDetails', { formId: data.formId });
               }
            }, 500);
          }
        }
      });
    }

    return () => {
      if (notificationListener) Notifications.removeNotificationSubscription(notificationListener);
      if (responseListener) Notifications.removeNotificationSubscription(responseListener);
    };
  }, []);

  const registerAndSavePushToken = async (authToken) => {
    try {
      const pushToken = await registerForPushNotificationsAsync();
      if (pushToken) {
        await fetch(`${API_BASE}/api/notifications/save-token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({ token: pushToken }),
        });
      }
    } catch (err) {
      console.warn("Failed to register push token", err);
    }
  };

  const handleSplashFinish = () => {
    setShowSplash(false);
  };

  // Show animated splash screen
  if (showSplash || isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
        <AnimatedSplash onFinish={handleSplashFinish} />
      </View>
    );
  }

  return (
    <ThemeProvider scheme={colorScheme}>
      <StatusBar
        barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'}
        backgroundColor={colorScheme === 'dark' ? '#1a1a2e' : '#ffffff'}
      />
      <NavigationContainer theme={colorScheme === 'dark' ? DarkTheme : DefaultTheme} ref={navigationRef}>
        <Stack.Navigator initialRouteName={initialRoute}>
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Dashboard" component={DashboardScreen} options={{ headerShown: false }} />
          <Stack.Screen name="ApplyForm" component={ApplicationFormScreen} options={{ headerShown: false }} />
          <Stack.Screen name="PendingFiles" component={PendingFilesScreen} options={{ headerShown: false }} />
          <Stack.Screen name="ViewLoanApplicationScreen" component={ViewLoanApplicationScreen} options={{ headerShown: false }} />
          <Stack.Screen name="ApprovedFiles" component={ApprovedFilesScreen} options={{ headerShown: false }} />
          <Stack.Screen name="ViewApprovedApplicationScreen" component={ViewApprovedApplicationScreen} options={{ headerShown: false }} />
          <Stack.Screen name="RejectedFiles" component={RejectedFilesScreen} options={{ headerShown: false }} />
          <Stack.Screen name="ViewRejectedApplicationScreen" component={ViewRejectedApplicationScreen} options={{ headerShown: false }} />
          <Stack.Screen name="DealerProfile" component={DealerProfileScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ headerShown: false }} />
          <Stack.Screen name="ApplicationDetails" component={ApplicationDetailsScreen} options={{ headerShown: false }} />
          <Stack.Screen
            name="CibilStatus"
            component={CibilStatusScreen}
            options={{ headerShown: false, gestureEnabled: false }}
          />
        </Stack.Navigator>
      </NavigationContainer>
      <Toast />
    </ThemeProvider>
  );
}
