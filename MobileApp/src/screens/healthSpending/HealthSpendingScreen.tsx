import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { healthSpendingApi } from '../../api/healthSpending';
import { COLORS } from '../../utils/constants';
import { Loading } from '../../components/common/Loading';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { logger } from '../../utils/logger';

type DateRange = 'week' | 'month' | 'quarter' | 'year' | 'all';

export default function HealthSpendingScreen() {
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const [selectedRange, setSelectedRange] = useState<DateRange>('year');
  const [refreshing, setRefreshing] = useState(false);

  // Calculate date range based on selection
  const { startDate, endDate } = useMemo(() => {
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    
    const start = new Date();
    
    switch (selectedRange) {
      case 'week':
        start.setDate(start.getDate() - 7);
        break;
      case 'month':
        start.setMonth(start.getMonth() - 1);
        break;
      case 'quarter':
        start.setMonth(start.getMonth() - 3);
        break;
      case 'year':
        start.setFullYear(start.getFullYear() - 1);
        break;
      case 'all':
        start.setFullYear(2020, 0, 1); // Start from 2020
        break;
    }
    
    start.setHours(0, 0, 0, 0);
    
    return {
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0],
    };
  }, [selectedRange]);

  const { data: statsData, isLoading: statsLoading, error: statsError } = useQuery({
    queryKey: ['healthSpendingStats', startDate, endDate],
    queryFn: () => healthSpendingApi.getHealthSpendingStats(startDate, endDate),
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    retry: 2,
  });

  const { data: statusData, isLoading: statusLoading, error: statusError } = useQuery({
    queryKey: ['healthStatus'],
    queryFn: () => healthSpendingApi.getHealthStatus(),
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    retry: 2,
  });

  const stats = statsData?.data;
  const status = statusData?.data;

  const getStatusColor = (statusType?: string) => {
    switch (statusType) {
      case 'good':
        return COLORS.success || '#10b981';
      case 'moderate':
        return COLORS.warning || '#f59e0b';
      case 'needs_attention':
        return COLORS.error || '#ef4444';
      default:
        return COLORS.primary;
    }
  };

  const getStatusText = (statusType?: string) => {
    switch (statusType) {
      case 'good':
        return 'Tốt';
      case 'moderate':
        return 'Trung bình';
      case 'needs_attention':
        return 'Cần chú ý';
      default:
        return 'Chưa xác định';
    }
  };

  const getRangeLabel = (range: DateRange) => {
    switch (range) {
      case 'week':
        return '7 ngày';
      case 'month':
        return '1 tháng';
      case 'quarter':
        return '3 tháng';
      case 'year':
        return '1 năm';
      case 'all':
        return 'Tất cả';
    }
  };

  const dateRanges: DateRange[] = ['week', 'month', 'quarter', 'year', 'all'];

  // Calculate average order value
  const averageOrderValue = stats
    ? stats.totalOrders > 0
      ? Math.round(stats.totalSpending / stats.totalOrders)
      : 0
    : 0;

  // Get max value for chart
  const maxChartValue = stats?.chartData && stats.chartData.length > 0
    ? Math.max(...stats.chartData.map((d) => d.total))
    : 0;

  // Handle refresh
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ['healthSpendingStats'] });
      await queryClient.invalidateQueries({ queryKey: ['healthStatus'] });
    } finally {
      setRefreshing(false);
    }
  };

  if ((statsLoading || statusLoading) && !statsData && !statusData) {
    return <Loading />;
  }

  // Error state
  if ((statsError || statusError) && !statsData && !statusData) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={64} color={COLORS.error} />
          <Text style={styles.errorText}>Không thể tải dữ liệu</Text>
          <Text style={styles.errorSubtext}>
            Vui lòng kiểm tra kết nối mạng và thử lại
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView 
        style={styles.scrollView} 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[COLORS.primary]}
            tintColor={COLORS.primary}
          />
        }
      >
        {/* Health Status Card */}
        {status && (
          <LinearGradient
            colors={[getStatusColor(status.status), `${getStatusColor(status.status)}CC`]}
            style={styles.statusCard}
          >
            <View style={styles.statusHeader}>
              <Ionicons name="heart" size={32} color="#fff" />
              <Text style={styles.statusTitle}>Tình trạng sức khỏe</Text>
            </View>
            <Text style={styles.statusValue}>{getStatusText(status.status)}</Text>
            <Text style={styles.statusMessage}>{status.message}</Text>
          </LinearGradient>
        )}

        {/* Date Range Selector */}
        <View style={styles.dateRangeContainer}>
          <Text style={styles.dateRangeLabel}>Khoảng thời gian:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dateRangeScroll}>
            {dateRanges.map((range) => (
              <TouchableOpacity
                key={range}
                style={[
                  styles.dateRangeButton,
                  selectedRange === range && styles.dateRangeButtonActive,
                ]}
                onPress={() => setSelectedRange(range)}
              >
                <Text
                  style={[
                    styles.dateRangeText,
                    selectedRange === range && styles.dateRangeTextActive,
                  ]}
                >
                  {getRangeLabel(range)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Spending Stats */}
        {stats && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Thống kê chi tiêu</Text>
            
            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <Ionicons name="cash-outline" size={32} color={COLORS.primary} />
                <Text style={styles.statValue}>
                  {stats.totalSpending.toLocaleString('vi-VN')} ₫
                </Text>
                <Text style={styles.statLabel}>Tổng chi tiêu</Text>
              </View>

              <View style={styles.statCard}>
                <Ionicons name="receipt-outline" size={32} color={COLORS.warning} />
                <Text style={styles.statValue}>{String(stats.totalOrders)}</Text>
                <Text style={styles.statLabel}>Tổng đơn hàng</Text>
              </View>
            </View>

            {stats.totalOrders > 0 && (
              <View style={styles.averageCard}>
                <Text style={styles.averageLabel}>Giá trị đơn hàng trung bình:</Text>
                <Text style={styles.averageValue}>
                  {averageOrderValue.toLocaleString('vi-VN')} ₫
                </Text>
              </View>
            )}

            {/* Monthly Trend Chart */}
            {stats.chartData && Array.isArray(stats.chartData) && stats.chartData.length > 0 && (
              <View style={styles.trendSection}>
                <Text style={styles.trendTitle}>Xu hướng chi tiêu theo tháng</Text>
                {stats.chartData.map((item, index) => (
                  <View key={index} style={styles.trendItem}>
                    <Text style={styles.trendMonth}>{item.month || 'N/A'}</Text>
                    <View style={styles.trendBarContainer}>
                      <View
                        style={[
                          styles.trendBar,
                          {
                            width: maxChartValue > 0 && item.total ? `${(item.total / maxChartValue) * 100}%` : '0%',
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.trendAmount}>
                      {(item.total || 0).toLocaleString('vi-VN')} ₫
                    </Text>
                    <Text style={styles.trendCount}>({item.count || 0} đơn)</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Orders List */}
            {stats.orders && stats.orders.length > 0 && (
              <View style={styles.ordersSection}>
                <Text style={styles.ordersTitle}>Danh sách đơn hàng ({stats.orders.length})</Text>
                {stats.orders.slice(0, 10).map((order) => (
                  <TouchableOpacity
                    key={order._id}
                    style={styles.orderItem}
                    onPress={() => {
                      (navigation as any).navigate('Orders', {
                        screen: 'OrderDetail',
                        params: { orderId: order._id },
                      });
                    }}
                  >
                    <View style={styles.orderItemLeft}>
                      <Ionicons name="receipt-outline" size={24} color={COLORS.primary} />
                      <View style={styles.orderItemInfo}>
                        <Text style={styles.orderNumber}>{order.orderNumber}</Text>
                        <Text style={styles.orderDate}>
                          {new Date(order.createdAt).toLocaleDateString('vi-VN')}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.orderItemRight}>
                      <Text style={styles.orderAmount}>
                        {order.totalAmount.toLocaleString('vi-VN')} ₫
                      </Text>
                      <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
                    </View>
                  </TouchableOpacity>
                ))}
                {stats.orders.length > 10 && (
                  <TouchableOpacity
                    style={styles.viewAllButton}
                    onPress={() => {
                      (navigation as any).navigate('Orders');
                    }}
                  >
                    <Text style={styles.viewAllText}>
                      Xem tất cả {stats.orders.length} đơn hàng
                    </Text>
                    <Ionicons name="chevron-forward" size={20} color={COLORS.primary} />
                  </TouchableOpacity>
                )}
              </View>
            )}

            {(!stats.orders || stats.orders.length === 0) && (
              <View style={styles.emptyContainer}>
                <Ionicons name="receipt-outline" size={64} color={COLORS.textSecondary} />
                <Text style={styles.emptyText}>Chưa có đơn hàng trong khoảng thời gian này</Text>
              </View>
            )}
          </View>
        )}
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
  statusCard: {
    margin: 16,
    padding: 24,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginLeft: 8,
  },
  statusValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  statusMessage: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.9,
    lineHeight: 20,
  },
  dateRangeContainer: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: 8,
  },
  dateRangeLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 12,
  },
  dateRangeScroll: {
    flexDirection: 'row',
  },
  dateRangeButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.background,
    marginRight: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  dateRangeButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  dateRangeText: {
    fontSize: 12,
    color: COLORS.text,
    fontWeight: '500',
  },
  dateRangeTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  section: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  statCard: {
    width: '48%',
    backgroundColor: COLORS.background,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    marginTop: 8,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  averageCard: {
    backgroundColor: COLORS.background,
    padding: 16,
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  averageLabel: {
    fontSize: 14,
    color: COLORS.text,
  },
  averageValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  trendSection: {
    marginTop: 16,
  },
  trendTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 12,
  },
  trendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  trendMonth: {
    width: 70,
    fontSize: 12,
    color: COLORS.text,
  },
  trendBarContainer: {
    flex: 1,
    height: 20,
    backgroundColor: COLORS.border,
    borderRadius: 10,
    overflow: 'hidden',
    marginHorizontal: 8,
  },
  trendBar: {
    height: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 10,
  },
  trendAmount: {
    width: 90,
    fontSize: 12,
    color: COLORS.text,
    textAlign: 'right',
    fontWeight: '600',
  },
  trendCount: {
    width: 50,
    fontSize: 10,
    color: COLORS.textSecondary,
    textAlign: 'right',
    marginLeft: 4,
  },
  ordersSection: {
    marginTop: 16,
  },
  ordersTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 12,
  },
  orderItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: COLORS.background,
    borderRadius: 8,
    marginBottom: 8,
  },
  orderItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  orderItemInfo: {
    marginLeft: 12,
    flex: 1,
  },
  orderNumber: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
  },
  orderDate: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  orderItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  orderAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
    marginRight: 8,
  },
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginTop: 8,
  },
  viewAllText: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '600',
    marginRight: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 16,
    textAlign: 'center',
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
});
