import React from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import { COLORS } from '../../utils/constants';

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: any;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  width = '100%',
  height = 20,
  borderRadius = 4,
  style,
}) => {
  const animatedValue = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(animatedValue, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(animatedValue, {
          toValue: 0,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [animatedValue]);

  const opacity = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.7],
  });

  return (
    <Animated.View
      style={[
        styles.skeleton,
        {
          width,
          height,
          borderRadius,
          opacity,
        },
        style,
      ]}
    />
  );
};

interface SkeletonProductCardProps {
  style?: any;
}

export const SkeletonProductCard: React.FC<SkeletonProductCardProps> = ({ style }) => {
  return (
    <View style={[styles.productCard, style]}>
      <Skeleton width="100%" height={150} borderRadius={8} />
      <View style={styles.productContent}>
        <Skeleton width="80%" height={16} borderRadius={4} style={styles.marginBottom} />
        <Skeleton width="60%" height={16} borderRadius={4} style={styles.marginBottom} />
        <Skeleton width="40%" height={20} borderRadius={4} />
      </View>
    </View>
  );
};

interface SkeletonListProps {
  count?: number;
  itemHeight?: number;
}

export const SkeletonList: React.FC<SkeletonListProps> = ({ count = 5, itemHeight = 80 }) => {
  return (
    <View>
      {Array.from({ length: count }).map((_, index) => (
        <View key={index} style={[styles.listItem, { height: itemHeight }]}>
          <Skeleton width={60} height={60} borderRadius={8} />
          <View style={styles.listItemContent}>
            <Skeleton width="70%" height={16} borderRadius={4} style={styles.marginBottom} />
            <Skeleton width="50%" height={14} borderRadius={4} />
          </View>
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: COLORS.border,
  },
  productCard: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 8,
    marginBottom: 16,
    overflow: 'hidden',
    padding: 8,
  },
  productContent: {
    paddingTop: 12,
  },
  marginBottom: {
    marginBottom: 8,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 12,
    marginBottom: 8,
    borderRadius: 8,
  },
  listItemContent: {
    flex: 1,
    marginLeft: 12,
  },
});

