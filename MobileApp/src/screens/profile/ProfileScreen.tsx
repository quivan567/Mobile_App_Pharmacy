import React, { useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { COLORS, API_BASE_URL } from '../../utils/constants';
import { Button } from '../../components/common/Button';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { notificationsApi } from '../../api/notifications';
import { loyaltyApi } from '../../api/loyalty';
import { logger } from '../../utils/logger';

export default function ProfileScreen() {
  const navigation = useNavigation();
  const { user, logout, isAuthenticated, refreshUser } = useAuth();
  
  // Track last refresh time to avoid too frequent refreshes
  const lastRefreshRef = useRef<number>(0);
  const REFRESH_COOLDOWN = 5000; // 5 seconds cooldown between refreshes

  const { data: unreadCountData } = useQuery({
    queryKey: ['unreadCount'],
    queryFn: () => notificationsApi.getUnreadCount(),
    enabled: isAuthenticated,
  });

  const { data: accountData } = useQuery({
    queryKey: ['loyaltyAccount'],
    queryFn: () => loyaltyApi.getAccount(),
    enabled: isAuthenticated,
  });

  const unreadCount = unreadCountData?.data?.count || 0;
  const account = accountData?.data;

  // Refresh user data when screen comes into focus (with debouncing)
  useFocusEffect(
    useCallback(() => {
      if (isAuthenticated) {
        const now = Date.now();
        // Only refresh if enough time has passed since last refresh
        if (now - lastRefreshRef.current > REFRESH_COOLDOWN) {
          lastRefreshRef.current = now;
          refreshUser().catch((error) => {
            // Silently handle rate limit errors - don't spam user
            if (error.response?.status !== 429) {
              logger.error('Error refreshing user:', error);
            }
          });
        }
      }
    }, [isAuthenticated, refreshUser])
  );

  // Get avatar URL
  const getAvatarUrl = () => {
    if (user?.avatar) {
      // If avatar is a full URL, use it directly
      if (user.avatar.startsWith('http://') || user.avatar.startsWith('https://')) {
        return user.avatar;
      }
      // Otherwise, construct URL from API base
      return `${API_BASE_URL}/${user.avatar}`;
    }
    return null;
  };

  const handleLogout = async () => {
    await logout();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView style={styles.scrollView}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          {getAvatarUrl() ? (
            <Image
              source={{ uri: getAvatarUrl()! }}
              style={styles.avatarImage}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>
                {user?.firstName?.[0]?.toUpperCase() || ''}{user?.lastName?.[0]?.toUpperCase() || ''}
              </Text>
            </View>
          )}
        </View>
        <Text style={styles.name}>
          {user?.firstName} {user?.lastName}
        </Text>
        {user?.email && (
          <Text style={styles.email}>{user.email}</Text>
        )}
        {user?.phone && (
          <Text style={styles.phone}>{user.phone}</Text>
        )}
      </View>

      <View style={styles.section}>
        <TouchableOpacity 
          style={styles.menuItem}
          onPress={() => {
            (navigation as any).navigate('Notifications');
          }}
        >
          <Ionicons name="notifications-outline" size={24} color={COLORS.text} />
          <Text style={styles.menuText}>Thông báo</Text>
          {unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
            </View>
          )}
          <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.menuItem}
          onPress={() => {
            (navigation as any).navigate('Promotions');
          }}
        >
          <Ionicons name="pricetag-outline" size={24} color={COLORS.text} />
          <Text style={styles.menuText}>Khuyến mãi</Text>
          <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.menuItem}
          onPress={() => {
            (navigation as any).navigate('Loyalty');
          }}
        >
          <Ionicons name="star-outline" size={24} color={COLORS.text} />
          <Text style={styles.menuText}>Điểm tích lũy</Text>
          {account?.pointsBalance && account.pointsBalance > 0 && (
            <Text style={styles.pointsText}>
              {account.pointsBalance.toLocaleString('vi-VN')} điểm
            </Text>
          )}
          <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.menuItem}
          onPress={() => {
            (navigation as any).navigate('PersonalInfo');
          }}
        >
          <Ionicons name="person-outline" size={24} color={COLORS.text} />
          <Text style={styles.menuText}>Thông tin cá nhân</Text>
          <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.menuItem}
          onPress={() => {
            (navigation as any).navigate('Prescriptions');
          }}
        >
          <Ionicons name="document-text-outline" size={24} color={COLORS.text} />
          <Text style={styles.menuText}>Đơn thuốc</Text>
          <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.menuItem}
          onPress={() => {
            (navigation as any).navigate('Consultation');
          }}
        >
          <Ionicons name="medical-outline" size={24} color={COLORS.text} />
          <Text style={styles.menuText}>Tư vấn đơn thuốc</Text>
          <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.menuItem}
          onPress={() => {
            (navigation as any).navigate('PPoints');
          }}
        >
          <Ionicons name="wallet-outline" size={24} color={COLORS.text} />
          <Text style={styles.menuText}>P-Xu</Text>
          <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.menuItem}
          onPress={() => {
            (navigation as any).navigate('HealthSpending');
          }}
        >
          <Ionicons name="stats-chart-outline" size={24} color={COLORS.text} />
          <Text style={styles.menuText}>Chi tiêu sức khỏe</Text>
          <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.menuItem}
          onPress={() => {
            (navigation as any).navigate('AddressList');
          }}
        >
          <Ionicons name="location-outline" size={24} color={COLORS.text} />
          <Text style={styles.menuText}>Địa chỉ</Text>
          <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuItem}>
          <Ionicons name="settings-outline" size={24} color={COLORS.text} />
          <Text style={styles.menuText}>Cài đặt</Text>
          <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Button
          title="Đăng xuất"
          onPress={handleLogout}
          variant="outline"
          style={styles.logoutButton}
        />
      </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollView: {
    flex: 1,
  },
  header: {
    backgroundColor: COLORS.primary,
    padding: 32,
    alignItems: 'center',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    overflow: 'hidden',
    marginBottom: 16,
    backgroundColor: '#fff',
  },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: COLORS.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  email: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.9,
    marginBottom: 4,
  },
  phone: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.9,
  },
  section: {
    backgroundColor: '#fff',
    marginTop: 12,
    paddingVertical: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  menuText: {
    flex: 1,
    fontSize: 16,
    color: COLORS.text,
    marginLeft: 12,
  },
  badge: {
    backgroundColor: COLORS.error,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    minWidth: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  pointsText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
    marginRight: 8,
  },
  logoutButton: {
    margin: 16,
  },
});

