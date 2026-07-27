// components/StepIndicator.js
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function StepIndicator({ currentStep = 1, totalSteps = 3, labels = ['Application Submitted', 'Under Review', 'Approved'] }) {
  // Clamp currentStep between 1 and totalSteps
  const activeStep = Math.max(1, Math.min(currentStep, totalSteps));

  return (
    <View style={styles.container}>
      {[...Array(totalSteps)].map((_, idx) => {
        const stepNum = idx + 1;
        const isActive = stepNum === activeStep;
        const isCompleted = stepNum < activeStep;
        return (
          <React.Fragment key={idx}>
            <View style={styles.stepItem}>
              <View style={[
                styles.circle,
                isCompleted && styles.completedCircle,
                isActive && styles.activeCircle
              ]}>
                <Text style={[
                  styles.stepText,
                  (isActive || isCompleted) && styles.activeStepText
                ]}>{stepNum}</Text>
              </View>
              <Text style={[styles.label, isActive && styles.activeLabel]}>
                {labels[idx] || `Step ${stepNum}`}
              </Text>
            </View>
            {idx !== totalSteps - 1 && (
              <View style={[
                styles.line,
                isCompleted && styles.completedLine
              ]} />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

const ORANGE = '#FF7300';

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 10,
    justifyContent: 'center',
  },
  stepItem: {
    alignItems: 'center',
    width: 70,
  },
  circle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#EEE',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#EEE',
    marginBottom: 3,
  },
  completedCircle: {
    backgroundColor: '#FFD7B2',
    borderColor: ORANGE,
  },
  activeCircle: {
    backgroundColor: ORANGE,
    borderColor: ORANGE,
  },
  stepText: {
    color: '#777',
    fontWeight: 'bold',
  },
  activeStepText: {
    color: '#fff',
  },
  label: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
    textAlign: 'center',
  },
  activeLabel: {
    color: ORANGE,
    fontWeight: 'bold',
  },
  line: {
    height: 2.5,
    backgroundColor: '#EEE',
    width: 26,
    marginHorizontal: 1,
    marginTop: -16,
  },
  completedLine: {
    backgroundColor: ORANGE,
  },
});
