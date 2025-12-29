import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { prescriptionsApi } from '../../api/prescriptions';
import { COLORS } from '../../utils/constants';
import { Loading } from '../../components/common/Loading';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { logger } from '../../utils/logger';

export default function PrescriptionListScreen() {
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const [selectedStatus, setSelectedStatus] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [allPrescriptions, setAllPrescriptions] = useState<any[]>([]);
  const [totalPrescriptions, setTotalPrescriptions] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const lastPageRef = useRef(0);
  const isLoadingMoreRef = useRef(false);
  const currentStatusRef = useRef<string | undefined>(undefined);

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ['prescriptions', selectedStatus, page],
    queryFn: async () => {
      try {
        return await prescriptionsApi.getUserPrescriptions({ page, limit: 20, status: selectedStatus });
      } catch (err: any) {
        logger.error('Error fetching prescriptions:', err);
        throw err;
      }
    },
    retry: 2,
    retryDelay: 1000,
    staleTime: 2 * 60 * 1000, // Cache for 2 minutes
    refetchOnWindowFocus: false,
  });

  const { data: statsData, error: statsError } = useQuery({
    queryKey: ['prescriptionStats'],
    queryFn: async () => {
      try {
        return await prescriptionsApi.getPrescriptionStats();
      } catch (err: any) {
        logger.error('Error fetching prescription stats:', err);
        // Don't throw for stats - it's not critical
        return { success: false, data: null };
      }
    },
    retry: 2,
    retryDelay: 1000,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Reset when status changes
  useEffect(() => {
    // Only reset if status actually changed
    if (currentStatusRef.current !== selectedStatus) {
      logger.log('PrescriptionListScreen: Status changed, resetting data', {
        oldStatus: currentStatusRef.current,
        newStatus: selectedStatus,
      });
      
      // Update ref FIRST to prevent race conditions
      currentStatusRef.current = selectedStatus;
      
      // Reset all state
      setAllPrescriptions([]);
      setPage(1);
      lastPageRef.current = 0;
      setTotalPrescriptions(0);
      setIsLoadingMore(false);
      isLoadingMoreRef.current = false;
      
      // Invalidate queries for old status to clear cache
      queryClient.invalidateQueries({ queryKey: ['prescriptions'] });
    }
  }, [selectedStatus, queryClient]);

  // Accumulate prescriptions from all pages
  useEffect(() => {
    // Only process data if it matches current filter
    if (data && currentStatusRef.current === selectedStatus) {
      if (data.data && data.data.length > 0) {
        // Only update if this is a new page
        if (page > lastPageRef.current) {
          setAllPrescriptions((prev) => {
            // Check if we're loading page 1 (reset case)
            if (page === 1) {
              logger.log('PrescriptionListScreen: Loading page 1, replacing data', {
                status: selectedStatus,
                count: data.data.length,
              });
              return data.data;
            }
            // Merge new data, avoiding duplicates
            const existingIds = new Set(prev.map((item) => item._id));
            const newItems = data.data.filter((item: any) => !existingIds.has(item._id));
            logger.log('PrescriptionListScreen: Loading page', page, {
              status: selectedStatus,
              newItems: newItems.length,
              totalItems: prev.length + newItems.length,
            });
            return [...prev, ...newItems];
          });
          lastPageRef.current = page;
        }
        
        // Update total
        if (data.total !== undefined) {
          setTotalPrescriptions(data.total);
        }
      } else if (page === 1 && data.data && data.data.length === 0) {
        // Empty result for page 1
        logger.log('PrescriptionListScreen: Empty result for page 1', {
          status: selectedStatus,
        });
        setAllPrescriptions([]);
        setTotalPrescriptions(0);
      }
      
      // Reset loading more state
      setIsLoadingMore(false);
      isLoadingMoreRef.current = false;
    } else if (data && currentStatusRef.current !== selectedStatus) {
      // Data doesn't match current filter, ignore it
      logger.log('PrescriptionListScreen: Ignoring data from different filter', {
        dataStatus: currentStatusRef.current,
        currentStatus: selectedStatus,
      });
    }
  }, [data, page, selectedStatus]);

  const stats = statsData?.data || null;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return COLORS.success;
      case 'cancelled':
        return COLORS.error;
      case 'processing':
        return COLORS.warning;
      default:
        return COLORS.primary;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending':
        return 'Chờ xử lý';
      case 'processing':
        return 'Đang xử lý';
      case 'completed':
        return 'Hoàn thành';
      case 'cancelled':
        return 'Đã hủy';
      default:
        return status;
    }
  };

  const renderItem = ({ item }: { item: any }) => {
    if (!item || !item._id) {
      return null;
    }
    
    return (
      <TouchableOpacity
        style={styles.item}
        onPress={() => {
          try {
            (navigation as any).navigate('Prescriptions', {
              screen: 'PrescriptionDetail',
              params: { prescriptionId: item._id },
            });
          } catch (err) {
            logger.error('Error navigating to prescription detail:', err);
          }
        }}
      >
      <View style={styles.itemHeader}>
        <View style={styles.itemLeft}>
          <View
            style={[
              styles.iconContainer,
              { backgroundColor: `${getStatusColor(item.status)}20` },
            ]}
          >
            <Ionicons
              name="document-text-outline"
              size={24}
              color={getStatusColor(item.status)}
            />
          </View>
          <View style={styles.itemInfo}>
            <Text style={styles.itemTitle} numberOfLines={1}>
              {item.hospitalName || 'Không xác định'}
            </Text>
            {item.doctorName && (
              <Text style={styles.itemSubtitle}>BS. {item.doctorName}</Text>
            )}
            <Text style={styles.itemDate}>
              {new Date(item.createdAt).toLocaleDateString('vi-VN')}
            </Text>
          </View>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
          <Text style={styles.statusText}>{getStatusText(item.status)}</Text>
        </View>
      </View>
      </TouchableOpacity>
    );
  };

  const statusFilters = [
    { label: 'Tất cả', value: undefined },
    { label: 'Chờ xử lý', value: 'pending' },
    { label: 'Đang xử lý', value: 'processing' },
    { label: 'Hoàn thành', value: 'completed' },
    { label: 'Đã hủy', value: 'cancelled' },
  ];

  if (isLoading && !data) {
    return <Loading />;
  }

  if (error || statsError) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={64} color={COLORS.error} />
          <Text style={styles.errorText}>
            {error ? 'Không thể tải danh sách đơn thuốc' : 'Không thể tải thống kê'}
          </Text>
          <Text style={styles.errorSubtext}>
            Vui lòng thử lại sau
          </Text>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Stats Section */}
      {stats && (
        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{String(stats.total || 0)}</Text>
            <Text style={styles.statLabel}>Tổng đơn</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{String(stats.pending || 0)}</Text>
            <Text style={styles.statLabel}>Chờ xử lý</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{String(stats.completed || 0)}</Text>
            <Text style={styles.statLabel}>Hoàn thành</Text>
          </View>
        </View>
      )}

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
              setSelectedStatus(filter.value);
              setPage(1);
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

      {/* Prescriptions List */}
      {allPrescriptions.length === 0 && !isLoading ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="document-text-outline" size={64} color={COLORS.textSecondary} />
          <Text style={styles.emptyText}>Chưa có đơn thuốc nào</Text>
        </View>
      ) : (
        <FlatList
          data={allPrescriptions}
          renderItem={renderItem}
          keyExtractor={(item, index) => item?._id || `prescription-${index}`}
          contentContainerStyle={styles.list}
          onEndReached={() => {
            const hasMore = totalPrescriptions > 0 && allPrescriptions.length < totalPrescriptions;
            const isNotLoading = !isLoadingMoreRef.current && !isFetching && !isLoading;
            
            // Prevent multiple simultaneous requests
            if (hasMore && isNotLoading) {
              isLoadingMoreRef.current = true;
              setIsLoadingMore(true);
              setPage((prevPage) => prevPage + 1);
            }
          }}
          onEndReachedThreshold={0.5}
          ListFooterComponent={() => {
            if (isLoadingMore || isFetching) {
              return (
                <View style={styles.loadingMore}>
                  <ActivityIndicator size="small" color={COLORS.primary} />
                  <Text style={styles.loadingMoreText}>Đang tải thêm...</Text>
                </View>
              );
            }
            if (totalPrescriptions > 0 && allPrescriptions.length >= totalPrescriptions) {
              return (
                <View style={styles.endOfList}>
                  <Text style={styles.endOfListText}>Đã hiển thị tất cả đơn thuốc</Text>
                </View>
              );
            }
            return null;
          }}
          ListEmptyComponent={
            isLoading ? null : (
              <View style={styles.emptyContainer}>
                <Ionicons name="document-text-outline" size={64} color={COLORS.textSecondary} />
                <Text style={styles.emptyText}>Chưa có đơn thuốc nào</Text>
              </View>
            )
          }
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          windowSize={10}
          initialNumToRender={10}
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
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  itemInfo: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
  },
  itemSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  itemDate: {
    fontSize: 12,
    color: COLORS.textSecondary,
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
    color: COLORS.error,
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
  loadingMore: {
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  loadingMoreText: {
    marginLeft: 8,
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  endOfList: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  endOfListText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
});
