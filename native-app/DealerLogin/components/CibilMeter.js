/**
 * CibilMeter.js — circular 300–900 CIBIL gauge with an animated needle.
 *
 * Pure React Native (no SVG dependency): the arc is a ring of rotated tick
 * marks and the needle is a rotated View driven by Animated.
 *
 * Colour ranges mirror the Admin CIBIL meter exactly
 * (admin-frontend/src/pages/ApplicationView.jsx + PendingCibilView.jsx):
 *   score >= 750 → green · score >= 650 → orange · below → red · no score → grey
 *
 * Props:
 *   score      — number | null. The real score once the backend responded.
 *   processing — true while waiting for the backend: the needle sweeps
 *                300 → 900 continuously and no score is shown.
 *   size       — diameter in px (default 240).
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { View, Text, Animated, Easing, StyleSheet } from 'react-native';

export const MIN_SCORE = 300;
export const MAX_SCORE = 900;

// Admin colour ranges — do not diverge from the Admin panel.
export const CIBIL_COLORS = {
  good: '#16A34A',
  fair: '#F59E0B',
  poor: '#EF4444',
  none: '#CBD5E1',
};

export const hasCibilScore = (score) =>
  typeof score === 'number' && !Number.isNaN(score);

export const cibilColor = (score) => {
  if (!hasCibilScore(score)) return CIBIL_COLORS.none;
  if (score >= 750) return CIBIL_COLORS.good;
  if (score >= 650) return CIBIL_COLORS.fair;
  return CIBIL_COLORS.poor;
};

const SWEEP = 240;                 // degrees of arc covered by 300 → 900
const START_ANGLE = -SWEEP / 2;    // 300 at -120°, 900 at +120° (gap at bottom)
const TICKS = 60;                  // one tick every 10 points
const SWEEP_DURATION = 1300;       // ms for one 300 → 900 pass
const SETTLE_DURATION = 900;       // ms to move onto the real score

const clampScore = (s) => Math.max(MIN_SCORE, Math.min(MAX_SCORE, s));
const toFraction = (s) => (clampScore(s) - MIN_SCORE) / (MAX_SCORE - MIN_SCORE);

export default function CibilMeter({ score = null, processing = false, size = 240 }) {
  const anim = useRef(new Animated.Value(0)).current;
  const loopRef = useRef(null);
  const showScore = !processing && hasCibilScore(score);
  const activeColor = processing ? '#64748B' : cibilColor(score);

  useEffect(() => {
    // ── Waiting for the backend: sweep the needle low → high, forever ──
    if (processing) {
      anim.setValue(0);
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(anim, {
            toValue: 1,
            duration: SWEEP_DURATION,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0,
            duration: SWEEP_DURATION,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      loopRef.current = loop;
      loop.start();
      return () => {
        loop.stop();
        loopRef.current = null;
      };
    }

    // ── Result arrived: stop sweeping, settle on the actual score, stay static ──
    if (loopRef.current) {
      loopRef.current.stop();
      loopRef.current = null;
    }
    anim.stopAnimation(() => {
      Animated.timing(anim, {
        toValue: hasCibilScore(score) ? toFraction(score) : 0,
        duration: SETTLE_DURATION,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    });
  }, [processing, score, anim]);

  const rotate = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [`${START_ANGLE}deg`, `${START_ANGLE + SWEEP}deg`],
  });

  const ticks = useMemo(
    () =>
      Array.from({ length: TICKS + 1 }, (_, i) => {
        const tickScore = MIN_SCORE + (i / TICKS) * (MAX_SCORE - MIN_SCORE);
        return {
          angle: START_ANGLE + (i / TICKS) * SWEEP,
          color: cibilColor(tickScore),
          major: tickScore % 100 === 0,
        };
      }),
    []
  );

  const needleInset = size * 0.14;

  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{ width: size, height: size }}>
        {/* Arc — coloured by the Admin score ranges */}
        {ticks.map((t, i) => (
          <View
            key={i}
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              { alignItems: 'center', transform: [{ rotate: `${t.angle}deg` }] },
            ]}
          >
            <View
              style={{
                marginTop: t.major ? size * 0.025 : size * 0.045,
                width: t.major ? 4 : 2,
                height: t.major ? size * 0.085 : size * 0.045,
                borderRadius: 2,
                backgroundColor: t.color,
              }}
            />
          </View>
        ))}

        {/* Needle */}
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { alignItems: 'center', transform: [{ rotate }] },
          ]}
        >
          <View
            style={{
              marginTop: needleInset,
              width: 4,
              height: size / 2 - needleInset,
              borderRadius: 2,
              backgroundColor: activeColor,
            }}
          />
        </Animated.View>

        {/* Hub */}
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}
        >
          <View
            style={{
              width: 18,
              height: 18,
              borderRadius: 9,
              backgroundColor: activeColor,
              borderWidth: 3,
              borderColor: '#FFFFFF',
            }}
          />
        </View>

        {/* Readout — never shows a score while processing */}
        <View style={[styles.readout, { bottom: size * 0.08 }]}>
          {showScore ? (
            <Text style={[styles.score, { color: cibilColor(score) }]}>{score}</Text>
          ) : (
            <Text style={styles.scorePlaceholder}>—</Text>
          )}
          <Text style={styles.readoutLabel}>CIBIL Score</Text>
        </View>
      </View>

      {/* 300 ———— 900 */}
      <View style={[styles.rangeRow, { width: size }]}>
        <Text style={styles.rangeText}>{MIN_SCORE}</Text>
        <View style={styles.rangeLine} />
        <Text style={styles.rangeText}>{MAX_SCORE}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  readout: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  score: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: 1,
  },
  scorePlaceholder: {
    fontSize: 30,
    fontWeight: '800',
    color: '#94A3B8',
  },
  readoutLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  rangeRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rangeLine: {
    flex: 1,
    height: 1,
    marginHorizontal: 8,
    backgroundColor: '#E2E8F0',
  },
  rangeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8',
  },
});
