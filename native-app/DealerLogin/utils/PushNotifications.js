import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import Constants from "expo-constants";

const isExpoGo = Constants.appOwnership === 'expo';

// ─── CRITICAL: Create Android notification channel IMMEDIATELY at import time ───
// Android requires a notification channel to exist BEFORE a push arrives.
// If the channel doesn't exist yet when a push comes in, Android silently drops it.
// This must run before setNotificationHandler and before any push can arrive.
if (!isExpoGo && Platform.OS === "android") {
  Notifications.setNotificationChannelAsync("default", {
    name: "Default",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#FF9100",
    sound: "default",
    showBadge: true,
    enableLights: true,
    enableVibrate: true,
  }).then(() => {
    console.log("✅ Android notification channel 'default' created at startup");
  }).catch((err) => {
    console.warn("⚠️ Failed to create notification channel:", err);
  });
}

// Configure how notifications are handled when app is in foreground
// This tells the OS to actually display the notification popup even when app is open
if (!isExpoGo) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      priority: Notifications.AndroidNotificationPriority.MAX,
    }),
  });
}

/**
 * Register for push notifications and return the Expo push token.
 * Only works on real devices.
 */
export async function registerForPushNotificationsAsync() {
  let token;

  if (isExpoGo) {
    console.log("⚠️ Running in Expo Go: Push notifications are explicitly disabled by SDK 53. Test in the APK.");
    return null;
  }

  if (!Device.isDevice) {
    console.log("⚠️ Push notifications require a physical device");
    return null;
  }

  try {
    // Check existing permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    // Request permissions if not granted
    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      console.log("⚠️ Push notification permission not granted");
      return null;
    }

    // Get Expo push token
    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
    token = (await Notifications.getExpoPushTokenAsync({
      projectId: projectId || "81d090b9-d54d-4d73-8f83-8dbebfc0d4cf"
    })).data;

    console.log("🔔 Expo Push Token:", token);
  } catch (error) {
    console.error("❌ Error getting push token:", error);
    return null;
  }

  // Ensure Android notification channel exists (redundant safety, already created above)
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#FF9100",
      sound: "default",
      showBadge: true,
      enableLights: true,
      enableVibrate: true,
    });
  }

  return token;
}

export default registerForPushNotificationsAsync;
