import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { pPointsApi } from '../../api/pPoints';
import { COLORS } from '../../utils/constants';
import { Loading } from '../../components/common/Loading';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

export default function PPointsScreen() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [allTransactions, setAllTransactions] = useState<any[]>([]);
  const [totalTransactions, setTotalTransactions] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const isLoadingMoreRef = useRef(false);
  const lastPageRef = useRef(0);

  const { data: accountData, isLoading: accountLoading, error: accountError } = useQuery({
    queryKey: ['pPointsAccount'],
    queryFn: () => pPointsApi.getAccount(),
    retry: 2,
  });

  const { data: transactionsData, isLoading: transactionsLoading, isFetching, error: transactionsError } = useQuery({
    queryKey: ['pPointsTransactions', page],
    queryFn: () => pPointsApi.getTransactions({ page, limit: 20 }),
    retry: 2,
  });

  const account = accountData?.data;

  // Accumulate transactions from all pages
  useEffect(() => {
    if (transactionsData?.data && Array.isArray(transactionsData.data)) {
      // Only update if this is a new page or page 1 (reset case)
      if (page === 1 || page > lastPageRef.current) {
        setAllTransactions((prev) => {
          // Check if we're loading page 1 (reset case)
          if (page === 1) {
            return transactionsData.data;
          }
          // Merge new data, avoiding duplicates
          const existingIds = new Set(prev.map((item: any) => item._id));
          const newItems = transactionsData.data.filter((item: any) => !existingIds.has(item._id));
          return [...prev, ...newItems];
        });
        lastPageRef.current = page;
        
        // Reset loading flag when data arrives
        isLoadingMoreRef.current = false;
      }

      // Update total
      if (transactionsData.total !== undefined) {
        setTotalTransactions(transactionsData.total);
      }
    } else if (page === 1 && transactionsData && (!transactionsData.data || (Array.isArray(transactionsData.data) && transactionsData.data.length === 0))) {
      // Empty result for page 1
      setAllTransactions([]);
      isLoadingMoreRef.current = false;
    }
  }, [transactionsData, page]);

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'earn':
        return 'add-circle';
      case 'redeem':
        return 'remove-circle';
      default:
        return 'help-circle';
    }
  };

  const getTransactionColor = (type: string) => {
    switch (type) {
      case 'earn':
        return COLORS.success;
      case 'redeem':
        return COLORS.error;
      default:
        return COLORS.textSecondary;
    }
  };

  const renderTransaction = ({ item }: { item: any }) => (
    <View style={styles.transactionItem}>
      <View style={styles.transactionLeft}>
        <View
          style={[
            styles.transactionIcon,
            { backgroundColor: `${getTransactionColor(item.type)}20` },
          ]}
        >
          <Ionicons
            name={getTransactionIcon(item.type) as any}
            size={24}
            color={getTransactionColor(item.type)}
          />
        </View>
        <View style={styles.transactionInfo}>
          <Text style={styles.transactionDescription}>{item.description}</Text>
          <Text style={styles.transactionDate}>
            {new Date(item.createdAt).toLocaleString('vi-VN')}
          </Text>
        </View>
      </View>
      <Text
        style={[
          styles.transactionPoints,
          {
            color: item.type === 'earn' ? COLORS.success : COLORS.error,
          },
        ]}
      >
        {item.type === 'earn' ? '+' : '-'}
        {item.points.toLocaleString('vi-VN')} P-Xu
      </Text>
    </View>
  );

  // Reset when account changes
  useEffect(() => {
    setAllTransactions([]);
    setPage(1);
    lastPageRef.current = 0;
    isLoadingMoreRef.current = false;
  }, [account?._id]);

  // Handle refresh
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ['pPointsAccount'] });
      await queryClient.invalidateQueries({ queryKey: ['pPointsTransactions'] });
      setAllTransactions([]);
      setPage(1);
      lastPageRef.current = 0;
      isLoadingMoreRef.current = false;
    } finally {
      setRefreshing(false);
    }
  };

  if (accountLoading && !accountData) {
    return <Loading />;
  }

  // Error state
  if (accountError && !accountData) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={64} color={COLORS.error} />
          <Text style={styles.errorText}>Không thể tải thông tin tài khoản</Text>
          <Text style={styles.errorSubtext}>
            Vui lòng kiểm tra kết nối mạng và thử lại
          </Text>
        </View>
      </View>
    );
  }

  const ListHeaderComponent = () => (
    <>
      {/* Account Balance Card */}
      <LinearGradient
        colors={['#f59e0b', '#d97706']}
        style={styles.balanceCard}
      >
        <View style={styles.balanceHeader}>
          <Ionicons name="wallet" size={32} color="#fff" />
          <Text style={styles.balanceTitle}>P-Xu Vàng</Text>
        </View>
        <Text style={styles.balanceAmount}>
          {account?.balance?.toLocaleString('vi-VN') || '0'}
        </Text>
        <Text style={styles.balanceSubtext}>P-Xu</Text>
        <View style={styles.balanceStats}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>
              {account?.totalEarned?.toLocaleString('vi-VN') || '0'}
            </Text>
            <Text style={styles.statLabel}>Tổng tích lũy</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>
              {account?.totalRedeemed?.toLocaleString('vi-VN') || '0'}
            </Text>
            <Text style={styles.statLabel}>Đã sử dụng</Text>
          </View>
        </View>
      </LinearGradient>

      {/* Info Section */}
      <View style={styles.infoSection}>
        <View style={styles.infoItem}>
          <Ionicons name="information-circle-outline" size={20} color={COLORS.warning} />
          <Text style={styles.infoText}>
            1 P-Xu = 100₫ khi thanh toán
          </Text>
        </View>
        <View style={styles.infoItem}>
          <Ionicons name="gift-outline" size={20} color={COLORS.warning} />
          <Text style={styles.infoText}>
            Tích P-Xu khi mua hàng: 1% giá trị đơn hàng
          </Text>
        </View>
      </View>

      {/* Transactions History Header */}
      <View style={styles.transactionsSectionHeader}>
        <Text style={styles.sectionTitle}>Lịch sử giao dịch</Text>
      </View>
    </>
  );

  return (
    <FlatList
      style={styles.container}
      data={allTransactions}
      renderItem={renderTransaction}
      keyExtractor={(item) => item._id}
      ListHeaderComponent={ListHeaderComponent}
      ListEmptyComponent={
        transactionsLoading && allTransactions.length === 0 ? (
          <Loading />
        ) : transactionsError && allTransactions.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="alert-circle-outline" size={48} color={COLORS.error} />
            <Text style={styles.emptyText}>Không thể tải giao dịch</Text>
            <Text style={styles.errorSubtext}>
              Vui lòng kiểm tra kết nối mạng và thử lại
            </Text>
          </View>
        ) : (
          <View style={styles.emptyContainer}>
            <Ionicons name="receipt-outline" size={48} color={COLORS.textSecondary} />
            <Text style={styles.emptyText}>Chưa có giao dịch nào</Text>
          </View>
        )
      }
      ListFooterComponent={
        isFetching && allTransactions.length > 0 ? (
          <View style={styles.loadingMore}>
            <ActivityIndicator size="small" color={COLORS.primary} />
            <Text style={styles.loadingMoreText}>Đang tải thêm...</Text>
          </View>
        ) : null
      }
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={[COLORS.primary]}
          tintColor={COLORS.primary}
        />
      }
      onEndReached={() => {
        const hasMore = totalTransactions > 0 && allTransactions.length < totalTransactions;
        const isNotLoading = !isLoadingMoreRef.current && !isFetching && !transactionsLoading;

        if (hasMore && isNotLoading) {
          isLoadingMoreRef.current = true;
          setPage((prevPage) => prevPage + 1);
        }
      }}
      onEndReachedThreshold={0.5}
      contentContainerStyle={styles.listContent}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  balanceCard: {
    margin: 16,
    padding: 24,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  balanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  balanceTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginLeft: 8,
  },
  balanceAmount: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  balanceSubtext: {
    fontSize: 16,
    color: '#fff',
    opacity: 0.9,
    marginBottom: 24,
  },
  balanceStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.3)',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#fff',
    opacity: 0.9,
  },
  statDivider: {
    width: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  infoSection: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: 8,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  infoText: {
    fontSize: 14,
    color: COLORS.text,
    marginLeft: 12,
    flex: 1,
  },
  transactionsSectionHeader: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    paddingBottom: 0,
    borderRadius: 8,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  transactionsSection: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 0,
    marginBottom: 16,
    padding: 0,
    borderRadius: 8,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
  listContent: {
    paddingBottom: 16,
  },
  loadingMore: {
    padding: 20,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  loadingMoreText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 16,
  },
  transactionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: '#fff',
  },
  transactionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  transactionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  transactionInfo: {
    flex: 1,
  },
  transactionDescription: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
  },
  transactionDate: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  transactionPoints: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: COLORS.textSecondary,
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
});

