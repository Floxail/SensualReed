import React from 'react';
import {
  TouchableOpacity,
  StyleSheet,
  Text,
  View,
  Animated,
  GestureResponderEvent,
} from 'react-native';
import { useColors } from '../theme';

interface PremiumButtonProps {
  onPress: (event: GestureResponderEvent) => void;
  label: string;
  icon?: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  loading?: boolean;
}

export const PremiumButton: React.FC<PremiumButtonProps> = ({
  onPress,
  label,
  icon,
  variant = 'primary',
  size = 'medium',
  disabled = false,
  loading = false,
}) => {
  const colors = useColors();
  const scaleAnim = React.useRef(new Animated.Value(1)).current;
  const opacityAnim = React.useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 0.95,
        speed: 12,
        bounciness: 8,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0.8,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handlePressOut = () => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        speed: 12,
        bounciness: 8,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const sizeStyles = {
    small: {
      paddingVertical: 8,
      paddingHorizontal: 16,
      fontSize: 12,
    },
    medium: {
      paddingVertical: 12,
      paddingHorizontal: 24,
      fontSize: 14,
    },
    large: {
      paddingVertical: 16,
      paddingHorizontal: 32,
      fontSize: 16,
    },
  };

  const variantStyles = {
    primary: {
      backgroundColor: colors.primary,
      textColor: colors.textOnPrimary,
      borderColor: colors.primary,
    },
    secondary: {
      backgroundColor: colors.surface,
      textColor: colors.text,
      borderColor: colors.border,
    },
    ghost: {
      backgroundColor: 'transparent',
      textColor: colors.primary,
      borderColor: colors.primary,
    },
  };

  const currentSize = sizeStyles[size];
  const currentVariant = variantStyles[variant];

  return (
    <Animated.View
      style={[
        {
          transform: [{ scale: scaleAnim }],
          opacity: opacityAnim,
        },
      ]}
    >
      <TouchableOpacity
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled || loading}
        activeOpacity={0.9}
        style={[
          styles.button,
          {
            backgroundColor: currentVariant.backgroundColor,
            borderColor: currentVariant.borderColor,
            paddingVertical: currentSize.paddingVertical,
            paddingHorizontal: currentSize.paddingHorizontal,
            opacity: disabled ? 0.5 : 1,
            shadowColor: variant === 'primary' ? colors.primary : '#000',
            shadowOpacity: variant === 'primary' ? 0.25 : 0.1,
          },
        ]}
      >
        <View style={styles.content}>
          {icon && (
            <Text style={[styles.icon, { fontSize: currentSize.fontSize + 4 }]}>
              {icon}
            </Text>
          )}
          <Text
            style={[
              styles.label,
              {
                color: currentVariant.textColor,
                fontSize: currentSize.fontSize,
              },
            ]}
          >
            {loading ? '...' : label}
          </Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  button: {
    borderRadius: 12,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 3,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  icon: {
    fontWeight: '600',
  },
  label: {
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});
