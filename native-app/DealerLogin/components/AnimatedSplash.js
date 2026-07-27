import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Image,
  StyleSheet,
  Animated,
  Dimensions,
} from 'react-native';

const { width, height } = Dimensions.get('window');

/**
 * AnimatedSplash – Clean, minimal fintech-style splash screen
 *
 * Flow:
 *   Step 1 (0–400ms):   logo-icon fades in + zooms from 0.5
 *   Step 2 (400–1000ms): logo-icon bounces 0.5 → 1.2 → 1
 *   Step 3 (1000–1400ms): icon smoothly morphs into full logo (cross-fade)
 *   Step 4 (1400–1800ms): whole screen fades out → onFinish()
 */
const AnimatedSplash = ({ onFinish }) => {
  // ── Step 1 & 2: logo-icon animations ──
  const iconOpacity = useRef(new Animated.Value(0)).current;
  const iconScale = useRef(new Animated.Value(0.5)).current;

  // ── Step 3: splash-logo fade in ──
  const logoOpacity = useRef(new Animated.Value(0)).current;  
  const logoScale = useRef(new Animated.Value(0.95)).current;

  // ── Step 3: text animations ──
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textTranslateY = useRef(new Animated.Value(10)).current;

  // ── Step 4: screen fade out ──
  const screenOpacity = useRef(new Animated.Value(1)).current;

  // Pre-render both but control with opacity (avoids layout jump)
  const [showFullLogo, setShowFullLogo] = useState(false);

  useEffect(() => {
    // Pre-mount the full logo immediately (hidden via opacity 0)
    setShowFullLogo(true);

    Animated.sequence([
      // ── STEP 1: Fade in + slight zoom (400ms) ──
      Animated.parallel([
        Animated.timing(iconOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(iconScale, {
          toValue: 0.85,
          duration: 400,
          useNativeDriver: true,
        }),
      ]),

      // ── STEP 2: Soft bounce zoom (600ms) ──
      Animated.sequence([
        Animated.spring(iconScale, {
          toValue: 1.15,
          friction: 4,
          tension: 70,
          useNativeDriver: true,
        }),
        Animated.spring(iconScale, {
          toValue: 1,
          friction: 6,
          tension: 50,
          useNativeDriver: true,
        }),
      ]),

      // ── STEP 3: Smooth cross-fade – icon out, full logo in (400ms) ──
      Animated.parallel([
        // Fade out icon smoothly
        Animated.timing(iconOpacity, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
        // Fade in full logo (starts just as icon begins to fade)
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 350,
          delay: 50,
          useNativeDriver: true,
        }),
        Animated.timing(logoScale, {
          toValue: 1,
          duration: 350,
          delay: 50,
          useNativeDriver: true,
        }),
        // Fade in tagline text
        Animated.timing(textOpacity, {
          toValue: 1,
          duration: 350,
          delay: 100,
          useNativeDriver: true,
        }),
        Animated.timing(textTranslateY, {
          toValue: 0,
          duration: 350,
          delay: 100,
          useNativeDriver: true,
        }),
      ]),

      // Hold the full logo briefly
      Animated.delay(250),

      // ── STEP 4: Smooth screen fade out (300ms) ──
      Animated.timing(screenOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onFinish();
    });
  }, []);

  return (
    <Animated.View style={[styles.container, { opacity: screenOpacity }]}>

      {/* Step 1 & 2: Icon Animation */}
      <Animated.View
        style={[
          styles.iconWrapper,
          {
            opacity: iconOpacity,
            transform: [{ scale: iconScale }],
          },
        ]}
      >
        <Image
          source={require('../assets/icon.png')}
          style={styles.iconImage}
          resizeMode="contain"
        />
      </Animated.View>

      {/* Step 3: Full Logo Reveal (pre-mounted, hidden via opacity) */}
      {showFullLogo && (
        <Animated.View
          style={[
            styles.fullLogoWrapper,
            {
              opacity: logoOpacity,
              transform: [{ scale: logoScale }],
            },
          ]}
        >
          <Image
            source={require('../assets/logo-surjit.png')}
            style={styles.fullLogoImage}
            resizeMode="contain"
          />
        </Animated.View>
      )}



      {/* Subtle bottom accent */}
      <Animated.View
        style={[
          styles.bottomAccent,
          { opacity: logoOpacity },
        ]}
      />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },

  // Icon (Step 1 & 2)
  iconWrapper: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconImage: {
    width: width * 0.22,
    height: width * 0.22,
  },

  // Full logo (Step 3) — centered in same spot
  fullLogoWrapper: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullLogoImage: {
    width: width * 0.72,
    height: width * 0.22,
  },



  // Bottom accent line
  bottomAccent: {
    position: 'absolute',
    bottom: 50,
    width: 36,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#D4AF37',
  },
});

export default AnimatedSplash;
