import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ordersApi } from '../../api/orders';
import { COLORS } from '../../utils/constants';
import { Loading } from '../../components/common/Loading';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../contexts/AuthContext';
import { useSocket } from '../../contexts/SocketContext';
import { logger } from '../../utils/logger';
import Toast from 'react-native-toast-message';

export default function OrderListScreen() {
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const { user, isAuthenticated } = useAuth();
  const { socket, isConnected } = useSocket();
  const [selectedStatus, setSelectedStatus] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [allOrders, setAllOrders] = useState<any[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const isLoadingMoreRef = useRef(false);
  const lastPageRef = useRef(0);
  
  // Track shown notifications to prevent duplicates
  const shownOrderCreatedRef = useRef<Set<string>>(new Set()); // Track by orderNumber or orderId
  const shownOrderUpdatedRef = useRef<Set<string>>(new Set()); // Track by orderNumber + status

  // Debug: Log user info
  useEffect(() => {
    logger.log('OrderListScreen - User info:', {
      isAuthenticated,
      userId: user?._id || user?.id,
      userEmail: user?.email,
      userPhone: user?.phone,
    });
  }, [isAuthenticated, user]);

  // Listen to real-time socket events
  useEffect(() => {
    if (!socket || !isConnected) return;

    const handleOrderCreated = (data: any) => {
      logger.log('OrderListScreen: Order created event', data);
      
      // Track by orderNumber or orderId to prevent duplicate notifications
      const orderKey = data.orderNumber || data.orderId || data._id || '';
      if (!orderKey || shownOrderCreatedRef.current.has(orderKey)) {
        // Already shown or invalid key, skip notification but still invalidate queries
        queryClient.invalidateQueries({ queryKey: ['orders'] });
        queryClient.invalidateQueries({ queryKey: ['orderStats'] });
        return;
      }
      
      // Mark as shown
      shownOrderCreatedRef.current.add(orderKey);
      
      // Invalidate queries to refetch orders
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['orderStats'] });
      
      Toast.show({
        type: 'success',
        text1: 'Đơn hàng mới',
        text2: data.message || 'Đơn hàng của bạn đã được tạo thành công',
      });
      
      // Clean up old entries after 5 minutes to prevent memory leak
      setTimeout(() => {
        shownOrderCreatedRef.current.delete(orderKey);
      }, 5 * 60 * 1000);
    };

    const handleOrderStatusUpdated = (data: any) => {
      logger.log('OrderListScreen: Order status updated event', data);
      
      // Track by orderNumber + status to prevent duplicate notifications for same status update
      const orderKey = data.orderNumber || data.orderId || data._id || '';
      const status = data.status || '';
      const updateKey = `${orderKey}_${status}`;
      
      if (!orderKey || shownOrderUpdatedRef.current.has(updateKey)) {
        // Already shown or invalid key, skip notification but still invalidate queries
        queryClient.invalidateQueries({ queryKey: ['orders'] });
        queryClient.invalidateQueries({ queryKey: ['orderStats'] });
        return;
      }
      
      // Mark as shown
      shownOrderUpdatedRef.current.add(updateKey);
      
      // Invalidate queries to refetch orders
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['orderStats'] });
      
      Toast.show({
        type: 'info',
        text1: 'Cập nhật đơn hàng',
        text2: data.message || `Đơn hàng ${data.orderNumber} đã được cập nhật`,
      });
      
      // Clean up old entries after 5 minutes to prevent memory leak
      setTimeout(() => {
        shownOrderUpdatedRef.current.delete(updateKey);
      }, 5 * 60 * 1000);
    };

    socket.on('order:created', handleOrderCreated);
    socket.on('order:status:updated', handleOrderStatusUpdated);

    return () => {
      socket.off('order:created', handleOrderCreated);
      socket.off('order:status:updated', handleOrderStatusUpdated);
    };
  }, [socket, isConnected, queryClient]);

  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ['orders', selectedStatus, page],
    queryFn: async () => {
      logger.log('OrderListScreen - Fetching orders:', { page, status: selectedStatus, isAuthenticated });
      try {
        const result = await ordersApi.getOrders({ page, limit: 20, status: selectedStatus });
        logger.log('OrderListScreen - Orders fetched successfully:', result);
        return result;
      } catch (err: any) {
        logger.error('OrderListScreen - Error fetching orders:', err);
        throw err;
      }
    },
    enabled: isAuthenticated, // Only fetch if authenticated
    refetchInterval: isConnected ? false : 120000, // Disable polling if socket is connected
    refetchOnWindowFocus: true,
    staleTime: isConnected ? 5 * 60 * 1000 : 60000, // Cache longer if socket is connected
    retry: 2, // Retry 2 times on failure
  });

  const { data: statsData, isLoading: isLoadingStats, error: statsError, refetch: refetchStats } = useQuery({
    queryKey: ['orderStats', user?._id || user?.id],
    refetchInterval: isConnected ? false : 120000, // Disable polling if socket is connected
    refetchOnWindowFocus: true,
    staleTime: isConnected ? 5 * 60 * 1000 : 60000, // Cache longer if socket is connected
    queryFn: async () => {
      try {
        if (!isAuthenticated) {
          logger.warn('Order Stats - User not authenticated');
          return {
            success: true,
            data: {
              totalOrders: 0,
              totalSpent: 0,
              pendingOrders: 0,
              completedOrders: 0,
              cancelledOrders: 0,
            },
          };
        }
        const response = await ordersApi.getOrderStats();
        logger.log('Order Stats API Response:', JSON.stringify(response, null, 2));
        logger.log('Order Stats - Response data:', response.data);
        logger.log('Order Stats - Total orders:', response.data?.totalOrders);
        logger.log('Order Stats - Total spent:', response.data?.totalSpent);
        logger.log('Order Stats - Pending orders:', response.data?.pendingOrders);
        logger.log('Order Stats - Completed orders:', response.data?.completedOrders);
        return response;
      } catch (err: any) {
        logger.error('Order Stats API Error:', err);
        logger.error('Error details:', {
          message: err?.message,
          response: err?.response?.data,
          status: err?.response?.status,
        });
        throw err;
      }
    },
    enabled: isAuthenticated, // Only fetch if authenticated
    staleTime: 2 * 60 * 1000, // 2 minutes
    retry: 1,
  });

  // Debug logging
  useEffect(() => {
    logger.log('Order Stats State:', {
      isLoadingStats,
      statsError: statsError?.message,
      statsData,
      stats: statsData?.data,
    });
  }, [isLoadingStats, statsError, statsData]);

  // Reset when status filter changes
  useEffect(() => {
    setAllOrders([]);
    setPage(1);
    lastPageRef.current = 0;
    isLoadingMoreRef.current = false;
  }, [selectedStatus]);

  // Accumulate orders from all pages
  useEffect(() => {
    if (data?.data && Array.isArray(data.data)) {
      // Only update if this is a new page or page 1 (reset case)
      if (page === 1 || page > lastPageRef.current) {
        setAllOrders((prev) => {
          const prevArray = Array.isArray(prev) ? prev : [];
          // Check if we're loading page 1 (reset case)
          if (page === 1) {
            return data.data;
          }
          // Merge new data, avoiding duplicates
          const existingIds = new Set(prevArray.map((item: any) => item._id));
          const newItems = data.data.filter((item: any) => !existingIds.has(item._id));
          return [...prevArray, ...newItems];
        });
        lastPageRef.current = page;
        
        // Reset loading flag when data arrives
        isLoadingMoreRef.current = false;
      }

      // Update total pages
      if (data.pagination?.totalPages) {
        setTotalPages(data.pagination.totalPages);
      } else if (data.pagination?.total) {
        const calculatedPages = Math.ceil(data.pagination.total / 20);
        setTotalPages(calculatedPages);
      }
    } else if (page === 1 && data && (!data.data || (Array.isArray(data.data) && data.data.length === 0))) {
      // Empty result for page 1
      setAllOrders([]);
      isLoadingMoreRef.current = false;
    }
  }, [data, page]);

  const stats = statsData?.data;
  const orders = allOrders || [];

  // Refresh data when screen is focused (but don't reset state)
  useFocusEffect(
    useCallback(() => {
      // Only refetch if data is stale, don't reset state
      // This prevents data loss when screen is focused
      if (!isLoading && !isFetching) {
        refetchStats();
        // Only refetch orders if we don't have data or data is stale
        if (allOrders.length === 0 || !data) {
          refetch();
        }
      }
    }, [refetch, refetchStats, isLoading, isFetching, allOrders.length, data])
  );
  
  // Always show stats section, even if loading or empty
  const shouldShowStats = true; // Always show, even if stats is empty/loading

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'delivered':
        return COLORS.success;
      case 'cancelled':
        return COLORS.error;
      case 'pending':
        return COLORS.warning;
      default:
        return COLORS.primary;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending':
        return 'Chờ xử lý';
      case 'confirmed':
        return 'Đã xác nhận';
      case 'processing':
        return 'Đang xử lý';
      case 'shipping':
        return 'Đang giao';
      case 'delivered':
        return 'Đã giao';
      case 'cancelled':
        return 'Đã hủy';
      default:
        return status;
    }
  };

  const renderItem = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.item}
      onPress={() => {
        (navigation as any).navigate('Orders', {
          screen: 'OrderDetail',
          params: { orderId: item._id },
        });
      }}
    >
      <View style={styles.itemHeader}>
        <Text style={styles.orderNumber}>{item.orderNumber}</Text>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
          <Text style={styles.statusText}>{getStatusText(item.status)}</Text>
        </View>
      </View>
      <Text style={styles.date}>
        {new Date(item.createdAt).toLocaleDateString('vi-VN')}
      </Text>
      <Text style={styles.total}>
        Tổng tiền: {item.totalAmount?.toLocaleString('vi-VN')} ₫
      </Text>
    </TouchableOpacity>
  );

  const statusFilters = [
    { label: 'Tất cả', value: undefined },
    { label: 'Chờ xử lý', value: 'pending' },
    { label: 'Đã xác nhận', value: 'confirmed' },
    { label: 'Đang xử lý', value: 'processing' },
    { label: 'Đang giao', value: 'shipping' },
    { label: 'Đã giao', value: 'delivered' },
    { label: 'Đã hủy', value: 'cancelled' },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Stats Section - Always show, even if loading or empty */}
      <View style={styles.statsContainer}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>
            {isLoadingStats ? '...' : String(stats?.totalOrders ?? 0)}
          </Text>
          <Text style={styles.statLabel}>Tổng đơn</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>
            {isLoadingStats ? '...' : String(stats?.pendingOrders ?? 0)}
          </Text>
          <Text style={styles.statLabel}>Chờ xử lý</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>
            {isLoadingStats ? '...' : String(stats?.completedOrders ?? 0)}
          </Text>
          <Text style={styles.statLabel}>Hoàn thành</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, styles.statValueAmount]}>
            {isLoadingStats ? '...' : `${(stats?.totalSpent ?? 0).toLocaleString('vi-VN')} ₫`}
          </Text>
          <Text style={styles.statLabel}>Tổng chi tiêu</Text>
        </View>
      </View>

      {/* Status Filters */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        style={styles.filtersContainer}
        contentContainerStyle={styles.filtersContent}
      >
        {statusFilters.map((filter) => (
          <TouchableOpacity
            key={filter.value || 'all'}
            style={[
              styles.filterButton,
              selectedStatus === filter.value && styles.filterButtonActive,
            ]}
            onPress={() => {
              const newStatus = filter.value;
              if (selectedStatus !== newStatus) {
                setSelectedStatus(newStatus);
                setPage(1);
                setAllOrders([]);
                lastPageRef.current = 0;
                isLoadingMoreRef.current = false;
              }
            }}
          >
            <Text
              style={[
                styles.filterText,
                selectedStatus === filter.value && styles.filterTextActive,
              ]}
            >
              {filter.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Orders List */}
      {isLoading && orders.length === 0 ? (
        <Loading />
      ) : error ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="alert-circle-outline" size={64} color={COLORS.error} />
          <Text style={styles.emptyText}>Không thể tải danh sách đơn hàng</Text>
          <Text style={styles.emptySubtext}>
            {error instanceof Error ? error.message : 'Lỗi kết nối. Vui lòng thử lại.'}
          </Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => {
              refetch();
            }}
          >
            <Ionicons name="refresh" size={20} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.retryButtonText}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      ) : orders.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="receipt-outline" size={64} color={COLORS.textSecondary} />
          <Text style={styles.emptyText}>Chưa có đơn hàng nào</Text>
          {selectedStatus && (
            <Text style={styles.emptySubtext}>
              Không có đơn hàng với trạng thái "{statusFilters.find(f => f.value === selectedStatus)?.label}"
            </Text>
          )}
        </View>
      ) : (
        <FlatList
          data={orders}
          renderItem={renderItem}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.list}
          onEndReached={() => {
            const hasMore = totalPages > 0 && page < totalPages;
            const isNotLoading = !isLoadingMoreRef.current && !isFetching && !isLoading;

            // Prevent multiple calls while loading
            if (hasMore && isNotLoading) {
              isLoadingMoreRef.current = true;
              setPage((prevPage) => prevPage + 1);
            }
          }}
          onEndReachedThreshold={0.5}
          refreshing={isFetching && page === 1}
          onRefresh={() => {
            // Don't reset allOrders immediately - let useEffect handle it after data is fetched
            setPage(1);
            lastPageRef.current = 0;
            isLoadingMoreRef.current = false;
            // Invalidate and refetch
            queryClient.invalidateQueries({ queryKey: ['orders', selectedStatus] });
            refetch();
          }}
          ListFooterComponent={
            isFetching && orders.length > 0 ? (
              <View style={styles.loadingMore}>
                <Text style={styles.loadingMoreText}>Đang tải thêm...</Text>
              </View>
            ) : null
          }
          removeClippedSubviews={false}
          maxToRenderPerBatch={10}
          updateCellsBatchingPeriod={50}
          windowSize={10}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  statsContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    padding: 16,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.primary,
    marginBottom: 4,
  },
  statValueAmount: {
    fontSize: 14,
  },
  statLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  filtersContainer: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  filtersContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: COLORS.background,
    marginRight: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    height: 40,
    width: 110,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterText: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '500',
    textAlign: 'center',
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  filterTextActive: {
    color: '#fff',
    fontWeight: '500', // Giữ fontWeight giống nhau để không thay đổi kích thước
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
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  orderNumber: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  date: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  total: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.primary,
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
  emptySubtext: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 8,
    textAlign: 'center',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 16,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingMore: {
    padding: 16,
    alignItems: 'center',
  },
  loadingMoreText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
});

