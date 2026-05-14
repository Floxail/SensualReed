import React from 'react';
import {
  View,
  StyleSheet,
  Text,
  Animated,
  TouchableOpacity,
  GestureResponderEvent,
} from 'react-native';
import { useColors } from '../theme';

interface PremiumCardProps {
  onPress?: (event: GestureResponderEvent) => void;
  title: string;
  subtitle?: string;
  icon?: string;
  progress?: number;
  children?: React.ReactNode;
  elevated?: boolean;
}

export const PremiumCard: React.FC<PremiumCardProps> = ({
  onPress,
  title,
  subtitle,
  icon,
  progress,
  children,
  elevated = false,
}) => {
  const colors = useColors();
  const scaleAnim = React.useRef(new Animated.Value(1)).current;
  const elevationAnim = React.useRef(new Animated.Value(0)).current;

  const handlePressIn = () => {
    if (onPress) {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 0.98,
          speed: 10,
          bounciness: 6,
          useNativeDriver: true,
        }),
        Animated.timing(elevationAnim, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    }
  };

  const handlePressOut = () => {
    if (onPress) {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          speed: 10,
          bounciness: 6,
          useNativeDriver: true,
        }),
        Animated.timing(elevationAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    }
  };

  const shadowOpacity = elevationAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.08, 0.2],
  });

  const shadowRadius = elevationAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [8, 16],
  });

  const content = (
    <Animated.View
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          transform: [{ scale: scaleAnim }],
          shadowColor: '#000',
          shadowOpacity: shadowOpacity,
          shadowRadius: shadowRadius,
          shadowOffset: { width: 0, height: elevated ? 12 : 4 },
        },
      ]}
    >
      {/* Header */}
      <View style={styles.header}>
        {icon && <Text style={styles.cardIcon}>{icon}</Text>}
        <View style={styles.titleSection}>
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          {subtitle && (
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              {subtitle}
            </Text>
          )}
        </View>
      </View>

      {/* Progress bar */}
      {progress !== undefined && (
        <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
          <View
            style={[
              styles.progressFill,
              {
                backgroundColor: colors.primary,
                width: `${Math.min(progress, 100)}%`,
              },
            ]}
          />
        </View>
      )}

      {/* Content */}
      {children && <View style={styles.content}>{children}</View>}
    </Animated.View>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={1}
      >
        {content}
      </TouchableOpacity>
    );
  }

  return content;
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 16,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },
  cardIcon: {
    fontSize: 28,
  },
  titleSection: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 12,
  },
  progressBar: {
    height: 4,
    borderRadius: 2,
    marginBottom: 12,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  content: {
    marginTop: 8,
  },
});
