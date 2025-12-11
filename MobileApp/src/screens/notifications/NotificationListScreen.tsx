import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigation, useRoute } from '@react-navigation/native';
import { notificationsApi } from '../../api/notifications';
import { COLORS } from '../../utils/constants';
import { Loading } from '../../components/common/Loading';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { useSocket } from '../../contexts/SocketContext';
import { logger } from '../../utils/logger';
import { formatRelativeTime } from '../../utils/dateFormat';

export default function NotificationListScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const queryClient = useQueryClient();
  const { socket, isConnected } = useSocket();
  const [page, setPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);
  const [allNotifications, setAllNotifications] = useState<any[]>([]);
  const [totalNotifications, setTotalNotifications] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const lastPageRef = useRef(0);
  const isLoadingMoreRef = useRef(false);

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ['notifications', page],
    queryFn: async () => {
      try {
        return await notificationsApi.getNotifications({ page, limit: 20 });
      } catch (err: any) {
        logger.error('Error fetching notifications:', err);
        throw err;
      }
    },
    retry: 2,
    retryDelay: 1000,
    refetchInterval: isConnected ? false : 60000, // Disable polling if socket is connected, otherwise poll every 60s
    refetchOnWindowFocus: true,
    staleTime: isConnected ? 5 * 60 * 1000 : 2 * 60 * 1000, // Cache longer if socket is connected
  });

  const { data: unreadCountData, error: unreadCountError } = useQuery({
    queryKey: ['unreadCount'],
    queryFn: async () => {
      try {
        return await notificationsApi.getUnreadCount();
      } catch (err: any) {
        logger.error('Error fetching unread count:', err);
        // Don't throw for unread count - it's not critical
        return { success: false, data: { count: 0 } };
      }
    },
    retry: 2,
    retryDelay: 1000,
    refetchInterval: isConnected ? false : 60000, // Disable polling if socket is connected
    refetchOnWindowFocus: true,
    staleTime: isConnected ? 5 * 60 * 1000 : 2 * 60 * 1000, // Cache longer if socket is connected
  });

  // Listen to real-time socket events
  useEffect(() => {
    if (!socket || !isConnected) return;

    const handleNewNotification = (data: any) => {
      logger.log('NotificationListScreen: New notification event', data);
      // Invalidate queries to refetch notifications
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['unreadCount'] });
      
      Toast.show({
        type: 'info',
        text1: data.notification?.title || 'Thông báo mới',
        text2: data.notification?.content || data.message,
      });
    };

    socket.on('notification:new', handleNewNotification);

    return () => {
      socket.off('notification:new', handleNewNotification);
    };
  }, [socket, isConnected, queryClient]);

  const markAsReadMutation = useMutation({
    mutationFn: (notificationId: string) => notificationsApi.markAsRead(notificationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['unreadCount'] });
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: () => notificationsApi.markAllAsRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['unreadCount'] });
      Toast.show({
        type: 'success',
        text1: 'Thành công',
        text2: 'Đã đánh dấu tất cả là đã đọc',
      });
    },
  });

  // Reset when refreshing
  useEffect(() => {
    if (refreshing) {
      setAllNotifications([]);
      setPage(1);
      lastPageRef.current = 0;
      isLoadingMoreRef.current = false;
    }
  }, [refreshing]);

  // Accumulate notifications from all pages
  useEffect(() => {
    if (data?.data && Array.isArray(data.data)) {
      // Only update if this is a new page or page 1 (reset case)
      if (page === 1 || page > lastPageRef.current) {
        setAllNotifications((prev) => {
          // Check if we're loading page 1 (reset case)
          if (page === 1) {
            return data.data;
          }
          // Merge new data, avoiding duplicates
          const existingIds = new Set(prev.map((item: any) => item._id));
          const newItems = data.data.filter((item: any) => !existingIds.has(item._id));
          return [...prev, ...newItems];
        });
        lastPageRef.current = page;
        
        // Reset loading flag when data arrives
        isLoadingMoreRef.current = false;
        setIsLoadingMore(false);
      }

      // Update total
      if (data.total !== undefined) {
        setTotalNotifications(data.total);
      }
    } else if (page === 1 && data && (!data.data || (Array.isArray(data.data) && data.data.length === 0))) {
      // Empty result for page 1
      setAllNotifications([]);
      isLoadingMoreRef.current = false;
      setIsLoadingMore(false);
    }
  }, [data, page]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ['notifications'] });
      await queryClient.invalidateQueries({ queryKey: ['unreadCount'] });
    } catch (error) {
      logger.error('Error refreshing notifications:', error);
      Toast.show({
        type: 'error',
        text1: 'Lỗi',
        text2: 'Không thể làm mới thông báo',
      });
    } finally {
      setRefreshing(false);
    }
  };

  const handleLoadMore = () => {
    const hasMore = totalNotifications > 0 && allNotifications.length < totalNotifications;
    const isNotLoading = !isLoadingMoreRef.current && !isFetching && !isLoading;

    if (hasMore && isNotLoading) {
      isLoadingMoreRef.current = true;
      setIsLoadingMore(true);
      setPage((prev) => prev + 1);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'order':
        return 'receipt-outline';
      case 'promotion':
        return 'pricetag-outline';
      case 'brand':
        return 'storefront-outline';
      case 'news':
        return 'newspaper-outline';
      case 'health':
        return 'medical-outline';
      case 'system':
        return 'settings-outline';
      default:
        return 'notifications-outline';
    }
  };

  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'order':
        return COLORS.primary;
      case 'promotion':
        return COLORS.warning;
      case 'brand':
        return '#9C27B0'; // Purple
      case 'news':
        return '#2196F3'; // Blue
      case 'health':
        return '#4CAF50'; // Green
      case 'system':
        return COLORS.textSecondary;
      default:
        return COLORS.textSecondary;
    }
  };

  // Handle deep linking navigation
  const handleNotificationPress = (item: any) => {
    // Mark as read if unread
    if (!item.isRead) {
      markAsReadMutation.mutate(item._id);
    }

    // Navigate based on link
    if (item.link) {
      try {
        const link = item.link;
        logger.log('NotificationListScreen: Navigating to link', link);

        // Parse link patterns
        // /account/chi-tiet-don-hang/{orderId}
        const orderDetailMatch = link.match(/\/account\/chi-tiet-don-hang\/([^\/]+)/);
        if (orderDetailMatch) {
          const orderId = orderDetailMatch[1];
          (navigation as any).navigate('Orders', {
            screen: 'OrderDetail',
            params: { orderId },
          });
          return;
        }

        // /promotions
        if (link === '/promotions' || link.startsWith('/promotions')) {
          (navigation as any).navigate('Profile', {
            screen: 'Promotions',
          });
          return;
        }

        // /medicines/{medicineId}
        const medicineDetailMatch = link.match(/\/medicines\/([^\/]+)/);
        if (medicineDetailMatch) {
          const medicineId = medicineDetailMatch[1];
          (navigation as any).navigate('Medicines', {
            screen: 'MedicineDetail',
            params: { id: medicineId },
          });
          return;
        }

        // /account/prescriptions/{prescriptionId}
        const prescriptionDetailMatch = link.match(/\/account\/prescriptions\/([^\/]+)/);
        if (prescriptionDetailMatch) {
          const prescriptionId = prescriptionDetailMatch[1];
          (navigation as any).navigate('Profile', {
            screen: 'Prescriptions',
            params: {
              screen: 'PrescriptionDetail',
              params: { id: prescriptionId },
            },
          });
          return;
        }

        // Default: navigate to home or do nothing
        logger.log('NotificationListScreen: Unknown link pattern', link);
      } catch (error) {
        logger.error('NotificationListScreen: Navigation error', error);
      }
    }
  };

  const renderItem = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={[styles.item, !item.isRead && styles.itemUnread]}
      onPress={() => handleNotificationPress(item)}
    >
      <View style={styles.itemContent}>
        <View
          style={[
            styles.iconContainer,
            { backgroundColor: `${getNotificationColor(item.type)}20` },
          ]}
        >
          <Ionicons
            name={getNotificationIcon(item.type) as any}
            size={24}
            color={getNotificationColor(item.type)}
          />
        </View>
        <View style={styles.itemText}>
          <Text style={[styles.title, !item.isRead && styles.titleUnread]}>
            {item.title}
          </Text>
          <Text style={styles.message} numberOfLines={2}>
            {item.message || item.content || ''}
          </Text>
          <Text style={styles.date}>
            {formatRelativeTime(item.createdAt)}
          </Text>
        </View>
        {!item.isRead && <View style={styles.unreadDot} />}
      </View>
    </TouchableOpacity>
  );

  const unreadCount = unreadCountData?.data?.count || 0;

  // Get route params to determine where to navigate back
  const fromScreen = (route.params as any)?.fromScreen;

  // Set up custom header back button based on where user came from
  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => {
        const handleGoBack = () => {
          if (fromScreen === 'Home') {
            // Navigate back to Home tab
            (navigation as any).navigate('Home');
          } else {
            // Default: navigate back to Profile (normal back behavior)
            if (navigation.canGoBack()) {
              navigation.goBack();
            } else {
              // Fallback: navigate to Profile tab
              (navigation as any).navigate('Profile', { screen: 'ProfileMain' });
            }
          }
        };

        return (
          <TouchableOpacity
            onPress={handleGoBack}
            style={{ marginLeft: 16, padding: 8 }}
          >
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
        );
      },
    });
  }, [navigation, fromScreen]);

  // Error state
  if (error && !data && !isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={64} color={COLORS.error} />
          <Text style={styles.errorText}>Không thể tải thông báo</Text>
          <Text style={styles.errorSubtext}>
            Vui lòng kiểm tra kết nối mạng và thử lại
          </Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => {
              queryClient.invalidateQueries({ queryKey: ['notifications'] });
            }}
          >
            <Text style={styles.retryButtonText}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Loading state (initial load only)
  if (isLoading && !data && allNotifications.length === 0) {
    return <Loading />;
  }

  return (
    <View style={styles.container}>
      {/* Header with unread count and mark all as read */}
      {allNotifications.length > 0 && (
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>Thông báo</Text>
            {unreadCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
              </View>
            )}
          </View>
          {unreadCount > 0 && (
            <TouchableOpacity
              onPress={() => markAllAsReadMutation.mutate()}
              disabled={markAllAsReadMutation.isPending}
            >
              <Text style={styles.markAllText}>Đánh dấu tất cả đã đọc</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {allNotifications.length === 0 && !isLoading ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="notifications-outline" size={64} color={COLORS.textSecondary} />
          <Text style={styles.emptyText}>Chưa có thông báo nào</Text>
        </View>
      ) : (
        <FlatList
          data={allNotifications}
          renderItem={renderItem}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          windowSize={10}
          initialNumToRender={10}
          ListFooterComponent={() => {
            if (isLoadingMore || isFetching) {
              return (
                <View style={styles.loadingMoreContainer}>
                  <ActivityIndicator size="small" color={COLORS.primary} />
                  <Text style={styles.loadingMoreText}>Đang tải thêm...</Text>
                </View>
              );
            }
            if (totalNotifications > 0 && allNotifications.length >= totalNotifications) {
              return (
                <View style={styles.endContainer}>
                  <Text style={styles.endText}>Đã hiển thị tất cả thông báo</Text>
                </View>
              );
            }
            return null;
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
    marginRight: 8,
  },
  badge: {
    backgroundColor: COLORS.error,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    minWidth: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  markAllText: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '600',
  },
  list: {
    padding: 16,
  },
  item: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  itemUnread: {
    backgroundColor: '#f0f7ff',
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
  },
  itemContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  itemText: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
  },
  titleUnread: {
    fontWeight: 'bold',
  },
  message: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  date: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
    marginLeft: 8,
    marginTop: 4,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 18,
    color: COLORS.text,
    fontWeight: '600',
    marginTop: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  errorText: {
    fontSize: 18,
    color: COLORS.text,
    fontWeight: '600',
    marginTop: 16,
    textAlign: 'center',
  },
  errorSubtext: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 8,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: COLORS.primary,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingMoreContainer: {
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingMoreText: {
    marginLeft: 8,
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  endContainer: {
    padding: 16,
    alignItems: 'center',
  },
  endText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
});

