import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useAppStore } from '../store/useAppStore';

export const ConnectionStatus: React.FC = () => {
  const isConnected = useAppStore((state) => state.connection.isConnected);

  const dotColor = isConnected ? '#10B981' : '#EF4444';

  return (
    <View style={styles.container}>
      <View style={[styles.dot, { backgroundColor: dotColor }]} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
