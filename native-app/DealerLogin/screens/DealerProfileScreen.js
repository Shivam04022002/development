import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE } from "../config";

// ─── Palette ────────────────────────────────────────────────
const ORANGE = "#FF9100";
const ORANGE_DARK = "#E07C00";
const AMBER_LIGHT = "#FFF8EF";
const AMBER_BG = "#FFF2E0";
const CARD_BG = "#FFFFFF";
const TEXT_PRIMARY = "#1A1A1A";
const TEXT_SECONDARY = "#6B6B6B";
const TEXT_MUTED = "#999999";
const RED = "#EF4444";
const GREEN = "#22C55E";
const BORDER = "#F0E4D7";
const INPUT_BG = "#FAFAFA";

export default function DealerProfileScreen({ navigation }) {
  // ─── State ──────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profileImage, setProfileImage] = useState(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [branch, setBranch] = useState("");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // ─── Animations ─────────────────────────────────────────
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const cardScale = useRef(new Animated.Value(0.95)).current;

  useEffect(() => {
    loadUserData();
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.spring(cardScale, {
        toValue: 1,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // validate passwords on change
  useEffect(() => {
    if (confirmPassword.length > 0 && newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match");
    } else {
      setPasswordError("");
    }
  }, [newPassword, confirmPassword]);

  // ─── Load ───────────────────────────────────────────────
  const loadUserData = async () => {
    try {
      const token = await AsyncStorage.getItem("userToken");
      const baseUrl = (await AsyncStorage.getItem("baseUrl")) || API_BASE;

      if (token) {
        // Fetch from the backend API
        const response = await fetch(`${baseUrl}/api/profile`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          }
        });

        if (response.ok) {
          const data = await response.json();
          console.log("PROFILE DATA:", data);

          const parts = (data.name || "").trim().split(" ");
          setFirstName(parts[0] || "");
          setLastName(parts.slice(1).join(" ") || "");
          setEmail(data.email || "");
          setPhone(data.phone || data.mobileNumber || "");
          setBranch(data.branch || data.branchName || "");
          setProfileImage(data.profilePic || null);

          // Update local cache sync
          const existingJson = await AsyncStorage.getItem("userInfo");
          const existing = existingJson ? JSON.parse(existingJson) : {};
          await AsyncStorage.setItem("userInfo", JSON.stringify({
            ...existing,
            name: data.name,
            email: data.email,
            Contact: data.phone,
            Branch: data.branch,
            image: data.profilePic
          }));
        } else {
          // Fallback to local storage if API fails
          const json = await AsyncStorage.getItem("userInfo");
          if (json) {
            const user = JSON.parse(json);
            const parts = (user.name || "").trim().split(" ");
            setFirstName(parts[0] || "");
            setLastName(parts.slice(1).join(" ") || "");
            setEmail(user.email || "");
            setPhone(user.Contact || user.phone || user.mobileNumber || "");
            setBranch(user.Branch || user.branch || user.branchName || "");
            setProfileImage(user.image || null);
          }
        }
      }
    } catch (e) {
      console.warn("Failed to load user data:", e);
    } finally {
      setLoading(false);
    }
  };

  // ─── Image Picker ───────────────────────────────────────
  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Please grant camera roll access to change your photo.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      setProfileImage(result.assets[0].uri);
    }
  };

  // ─── Save ───────────────────────────────────────────────
  const handleSave = async () => {
    // password validation
    if (newPassword || confirmPassword) {
      if (newPassword !== confirmPassword) {
        setPasswordError("Passwords do not match");
        return;
      }
      if (newPassword.length < 6) {
        setPasswordError("Password must be at least 6 characters");
        return;
      }
    }

    setSaving(true);
    setSuccessMessage("");
    try {
      const token = await AsyncStorage.getItem("userToken");
      const baseUrl = (await AsyncStorage.getItem("baseUrl")) || API_BASE;
      const headers = {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();

      // 1. Upload profile image if it is a local picked image
      let finalProfilePic = profileImage;
      if (profileImage && !profileImage.startsWith('http')) {
        const formData = new FormData();
        formData.append("image", {
          uri: profileImage,
          type: "image/jpeg",
          name: `profile-${Date.now()}.jpg`
        });
        const uploadRes = await fetch(`${baseUrl}/api/applications/upload-image`, {
          method: "POST",
          body: formData,
          headers: { "Content-Type": "multipart/form-data" }
        });
        if (uploadRes.ok) {
          const uploadData = await uploadRes.json();
          finalProfilePic = uploadData.url;
          setProfileImage(finalProfilePic); // Update local state with permanent URL
        } else {
          throw new Error("Failed to upload profile picture");
        }
      }

      // 2. Update profile
      const profileRes = await fetch(`${baseUrl}/api/profile`, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          name: fullName,
          email: email.trim(),
          phone: phone.trim(),
          branch: branch.trim(),
          profilePic: finalProfilePic
        }),
      });

      if (!profileRes.ok) {
        const errText = await profileRes.text().catch(() => "");
        console.error("Profile update failed:", profileRes.status, errText);
        let errMsg = "Failed to update profile";
        try {
          const errJson = JSON.parse(errText);
          if (errJson.message) errMsg = errJson.message;
        } catch (_) {}
        Alert.alert("Error", errMsg);
        setSaving(false);
        return;
      }

      // 2. Change password (if filled)
      if (newPassword) {
        const passRes = await fetch(`${baseUrl}/api/profile/password`, {
          method: "PUT",
          headers,
          body: JSON.stringify({
            newPassword,
            confirmPassword,
          }),
        });
        if (!passRes.ok) {
          const err = await passRes.json().catch(() => ({}));
          Alert.alert("Error", err.message || "Failed to change password");
          setSaving(false);
          return;
        }
      }

      // 4. Update local storage
      const existingJson = await AsyncStorage.getItem("userInfo");
      const existing = existingJson ? JSON.parse(existingJson) : {};
      
      let updatedUser = { ...existing };
      // Try to use the returned normalized user data
      try {
        const resData = await profileRes.json();
        if (resData && resData.user) {
           updatedUser = {
             ...existing,
             name: resData.user.name,
             email: resData.user.email,
             Contact: resData.user.phone,
             Branch: resData.user.branch,
             image: resData.user.profilePic,
           };
        }
      } catch (err) {
         // Fallback if parsing fails
         updatedUser = {
           ...existing,
           name: fullName,
           email: email.trim(),
           Contact: phone.trim(),
           Branch: branch.trim(),
           image: finalProfilePic,
         };
      }
      await AsyncStorage.setItem("userInfo", JSON.stringify(updatedUser));

      setNewPassword("");
      setConfirmPassword("");
      setPasswordError("");
      setSuccessMessage("Profile updated successfully!");
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (e) {
      console.error("Save error:", e);
      Alert.alert("Error", "Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // ─── Render helpers ─────────────────────────────────────
  const userInitial =
    (firstName?.charAt(0) || "").toUpperCase() +
    (lastName?.charAt(0) || "").toUpperCase() || "?";

  const fullName = `${firstName} ${lastName}`.trim() || "Dealer";

  const renderInput = (label, value, onChangeText, opts = {}) => {
    const { icon, keyboardType, placeholder, secure, showToggle, toggleFn, showState } = opts;
    return (
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>{label}</Text>
        <View style={styles.inputWrapper}>
          {icon && (
            <MaterialIcons
              name={icon}
              size={20}
              color={TEXT_MUTED}
              style={styles.inputIcon}
            />
          )}
          <TextInput
            style={[styles.input, icon && { paddingLeft: 40 }]}
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder || label}
            placeholderTextColor={TEXT_MUTED}
            keyboardType={keyboardType || "default"}
            secureTextEntry={secure && !showState}
            autoCapitalize={secure ? "none" : "words"}
          />
          {showToggle && (
            <TouchableOpacity
              style={styles.eyeBtn}
              onPress={toggleFn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <MaterialIcons
                name={showState ? "visibility" : "visibility-off"}
                size={22}
                color={TEXT_MUTED}
              />
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={ORANGE} />
      </SafeAreaView>
    );
  }

  // ─── UI ─────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Header ─────────────────────────────── */}
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => navigation.goBack()}
            >
              <MaterialIcons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Dealer Profile</Text>
            <View style={{ width: 40 }} />
          </View>

          {/* ── Profile Card ───────────────────────── */}
          <Animated.View
            style={[
              styles.profileCard,
              {
                opacity: fadeAnim,
                transform: [{ scale: cardScale }],
              },
            ]}
          >
            {/* Decorative top strip */}
            <View style={styles.cardTopStrip} />

            <View style={styles.avatarSection}>
              <TouchableOpacity
                style={styles.avatarContainer}
                onPress={pickImage}
                activeOpacity={0.8}
              >
                {profileImage ? (
                  <Image
                    source={{ uri: profileImage }}
                    style={styles.avatarImage}
                  />
                ) : (
                  <View style={styles.avatarFallback}>
                    <Text style={styles.avatarInitials}>{userInitial}</Text>
                  </View>
                )}
                {/* Camera overlay */}
                <View style={styles.cameraOverlay}>
                  <MaterialIcons name="camera-alt" size={16} color="#fff" />
                </View>
              </TouchableOpacity>

              <Text style={styles.profileName}>{fullName}</Text>
              <View style={styles.branchBadge}>
                <MaterialIcons name="business" size={14} color={ORANGE_DARK} />
                <Text style={styles.branchBadgeText}>
                  {branch || "No Branch"}
                </Text>
              </View>
            </View>
          </Animated.View>

          {/* ── Success Message ─────────────────────── */}
          {successMessage !== "" && (
            <View style={styles.successBanner}>
              <MaterialIcons name="check-circle" size={18} color={GREEN} />
              <Text style={styles.successText}>{successMessage}</Text>
            </View>
          )}

          {/* ── Form Section ───────────────────────── */}
          <Animated.View
            style={[
              styles.formSection,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            <View style={styles.sectionHeader}>
              <MaterialIcons name="person" size={20} color={ORANGE} />
              <Text style={styles.sectionTitle}>Personal Information</Text>
            </View>

            {renderInput("First Name", firstName, setFirstName, {
              icon: "badge",
              placeholder: "Enter first name",
            })}
            {renderInput("Last Name", lastName, setLastName, {
              icon: "badge",
              placeholder: "Enter last name",
            })}
            {renderInput("Phone Number", phone, setPhone, {
              icon: "phone",
              keyboardType: "phone-pad",
              placeholder: "Enter phone number",
            })}
            {renderInput("Email Address", email, setEmail, {
              icon: "email",
              keyboardType: "email-address",
              placeholder: "Enter email address",
            })}
            {renderInput("Branch Name", branch, setBranch, {
              icon: "business",
              placeholder: "Enter branch name",
            })}
          </Animated.View>

          {/* ── Password Section ───────────────────── */}
          <Animated.View
            style={[
              styles.formSection,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            <View style={styles.sectionHeader}>
              <MaterialIcons name="lock" size={20} color={ORANGE} />
              <Text style={styles.sectionTitle}>Change Password</Text>
            </View>

            {renderInput("New Password", newPassword, setNewPassword, {
              icon: "lock-outline",
              placeholder: "Enter new password",
              secure: true,
              showToggle: true,
              toggleFn: () => setShowNewPass(!showNewPass),
              showState: showNewPass,
            })}
            {renderInput(
              "Confirm Password",
              confirmPassword,
              setConfirmPassword,
              {
                icon: "lock-outline",
                placeholder: "Confirm new password",
                secure: true,
                showToggle: true,
                toggleFn: () => setShowConfirmPass(!showConfirmPass),
                showState: showConfirmPass,
              }
            )}

            {passwordError !== "" && (
              <View style={styles.errorRow}>
                <MaterialIcons name="error-outline" size={16} color={RED} />
                <Text style={styles.errorText}>{passwordError}</Text>
              </View>
            )}
          </Animated.View>

          {/* ── Action Buttons ─────────────────────── */}
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => navigation.goBack()}
              activeOpacity={0.7}
            >
              <MaterialIcons name="close" size={20} color={ORANGE_DARK} />
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              onPress={handleSave}
              activeOpacity={0.8}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <MaterialIcons name="save" size={20} color="#fff" />
                  <Text style={styles.saveBtnText}>Save Changes</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ─────────────────────────────────────────────────
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: AMBER_LIGHT,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: AMBER_LIGHT,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },

  /* ── Header ───────────────────────── */
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: ORANGE,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: 0.5,
  },

  /* ── Profile Card ─────────────────── */
  profileCard: {
    backgroundColor: CARD_BG,
    marginHorizontal: 16,
    marginTop: -1,
    borderRadius: 20,
    overflow: "hidden",
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
  },
  cardTopStrip: {
    height: 80,
    backgroundColor: ORANGE,
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
  },
  avatarSection: {
    alignItems: "center",
    marginTop: -45,
    paddingBottom: 22,
  },
  avatarContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 4,
    borderColor: "#fff",
    elevation: 4,
    shadowColor: ORANGE,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  avatarImage: {
    width: "100%",
    height: "100%",
    borderRadius: 44,
  },
  avatarFallback: {
    width: "100%",
    height: "100%",
    borderRadius: 44,
    backgroundColor: ORANGE,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarInitials: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#fff",
    letterSpacing: 1,
  },
  cameraOverlay: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: ORANGE_DARK,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2.5,
    borderColor: "#fff",
  },
  profileName: {
    fontSize: 22,
    fontWeight: "bold",
    color: TEXT_PRIMARY,
    marginTop: 12,
    letterSpacing: 0.3,
  },
  branchBadge: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    backgroundColor: AMBER_BG,
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 5,
  },
  branchBadgeText: {
    fontSize: 13,
    color: ORANGE_DARK,
    fontWeight: "600",
  },

  /* ── Success Banner ───────────────── */
  successBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0FFF4",
    marginHorizontal: 16,
    marginTop: 14,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#C6F6D5",
    gap: 8,
  },
  successText: {
    color: "#276749",
    fontWeight: "600",
    fontSize: 14,
  },

  /* ── Form Section ─────────────────── */
  formSection: {
    backgroundColor: CARD_BG,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    padding: 20,
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 18,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: TEXT_PRIMARY,
    letterSpacing: 0.2,
  },

  /* ── Input ────────────────────────── */
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: TEXT_SECONDARY,
    marginBottom: 6,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  inputWrapper: {
    position: "relative",
  },
  inputIcon: {
    position: "absolute",
    left: 12,
    top: 14,
    zIndex: 1,
  },
  input: {
    backgroundColor: INPUT_BG,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 15,
    color: TEXT_PRIMARY,
    borderWidth: 1.5,
    borderColor: BORDER,
    fontWeight: "500",
  },
  eyeBtn: {
    position: "absolute",
    right: 12,
    top: 12,
    padding: 2,
  },

  /* ── Error ────────────────────────── */
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    gap: 6,
  },
  errorText: {
    color: RED,
    fontSize: 13,
    fontWeight: "600",
  },

  /* ── Buttons ──────────────────────── */
  buttonRow: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginTop: 22,
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 15,
    borderRadius: 14,
    backgroundColor: AMBER_BG,
    borderWidth: 1.5,
    borderColor: ORANGE,
    gap: 6,
  },
  cancelBtnText: {
    color: ORANGE_DARK,
    fontWeight: "700",
    fontSize: 15,
    letterSpacing: 0.3,
  },
  saveBtn: {
    flex: 1.5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 15,
    borderRadius: 14,
    backgroundColor: ORANGE,
    elevation: 4,
    shadowColor: ORANGE,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    gap: 8,
  },
  saveBtnDisabled: {
    opacity: 0.7,
  },
  saveBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
    letterSpacing: 0.3,
  },
});
