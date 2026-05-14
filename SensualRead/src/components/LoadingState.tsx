import React from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { useColors } from '../theme';

interface LoadingStateProps {
  message?: string;
  variant?: 'spinner' | 'breathing' | 'pulse';
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  message = 'Loading...',
  variant = 'breathing',
}) => {
  const colors = useColors();
  const scaleAnim = React.useRef(new Animated.Value(1)).current;
  const opacityAnim = React.useRef(new Animated.Value(0.6)).current;

  React.useEffect(() => {
    if (variant === 'breathing') {
      Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(scaleAnim, {
              toValue: 1.15,
              duration: 2000,
              useNativeDriver: true,
            }),
            Animated.timing(opacityAnim, {
              toValue: 1,
              duration: 2000,
              useNativeDriver: true,
            }),
          ]),
          Animated.parallel([
            Animated.timing(scaleAnim, {
              toValue: 1,
              duration: 2000,
              useNativeDriver: true,
            }),
            Animated.timing(opacityAnim, {
              toValue: 0.6,
              duration: 2000,
              useNativeDriver: true,
            }),
          ]),
        ])
      ).start();
    }
  }, [variant]);

  const dotAnimations = [
    React.useRef(new Animated.Value(0)).current,
    React.useRef(new Animated.Value(0.33)).current,
    React.useRef(new Animated.Value(0.66)).current,
  ];

  React.useEffect(() => {
    if (variant === 'pulse') {
      dotAnimations.forEach((anim, index) => {
        Animated.loop(
          Animated.sequence([
            Animated.timing(anim, {
              toValue: 1,
              duration: 1200,
              delay: index * 200,
              useNativeDriver: true,
            }),
            Animated.timing(anim, {
              toValue: 0,
              duration: 200,
              useNativeDriver: true,
            }),
          ])
        ).start();
      });
    }
  }, [variant]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {variant === 'breathing' && (
        <Animated.View
          style={[
            styles.orb,
            {
              backgroundColor: colors.primary,
              opacity: opacityAnim,
              transform: [{ scale: scaleAnim }],
              shadowColor: colors.primary,
            },
          ]}
        />
      )}

      {variant === 'pulse' && (
        <View style={styles.dotRow}>
          {dotAnimations.map((anim, i) => (
            <Animated.View
              key={i}
              style={[
                styles.dot,
                {
                  backgroundColor: colors.primary,
                  opacity: anim,
                },
              ]}
            />
          ))}
        </View>
      )}

      {variant === 'spinner' && (
        <View style={[styles.spinner, { borderColor: colors.border, borderTopColor: colors.primary }]} />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  orb: {
    width: 60,
    height: 60,
    borderRadius: 30,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 8,
  },
  dotRow: {
    flexDirection: 'row',
    gap: 12,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  spinner: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
});
