import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  RefreshControl,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { promotionsApi } from '../../api/promotions';
import { COLORS } from '../../utils/constants';
import { Loading } from '../../components/common/Loading';
import { Ionicons } from '@expo/vector-icons';
import { getMedicineImageUrl } from '../../utils/imageHelper';
import { LinearGradient } from 'expo-linear-gradient';
import Toast from 'react-native-toast-message';
import { savedPromotionsStorage } from '../../utils/storage';
import { logger } from '../../utils/logger';

export default function PromotionListScreen() {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = React.useState(false);
  const [savedPromotionIds, setSavedPromotionIds] = React.useState<Set<string>>(new Set());
  
  const { data, isLoading, error, isError, refetch } = useQuery({
    queryKey: ['promotions', 'all'],
    queryFn: async () => {
      try {
        const response = await promotionsApi.getAllPromotions({ activeOnly: false });
        return response;
      } catch (err: any) {
        logger.error('Promotions API Error:', err);
        throw err;
      }
    },
    retry: 1,
    refetchInterval: 180000, // Poll every 3 minutes for realtime promotion status updates
    refetchOnWindowFocus: true,
    staleTime: 120000, // Cache for 2 minutes
  });

  const allPromotions = data?.data || [];

  // Load saved promotions on mount and when promotions change
  React.useEffect(() => {
    const loadSavedPromotions = async () => {
      const saved = await savedPromotionsStorage.getSavedPromotions();
      setSavedPromotionIds(new Set(saved));
    };
    loadSavedPromotions();
  }, [allPromotions]);

  // Sort promotions: saved ones first, then by date
  const promotions = React.useMemo(() => {
    return [...allPromotions].sort((a: any, b: any) => {
      const aSaved = savedPromotionIds.has(a._id);
      const bSaved = savedPromotionIds.has(b._id);
      if (aSaved && !bSaved) return -1;
      if (!aSaved && bSaved) return 1;
      return new Date(b.startDate).getTime() - new Date(a.startDate).getTime();
    });
  }, [allPromotions, savedPromotionIds]);

  const handleSavePromotion = async (promotionId: string) => {
    try {
      const isSaved = savedPromotionIds.has(promotionId);
      if (isSaved) {
        await savedPromotionsStorage.unsavePromotion(promotionId);
        const newSet = new Set(savedPromotionIds);
        newSet.delete(promotionId);
        setSavedPromotionIds(newSet);
        Toast.show({
          type: 'success',
          text1: 'Đã bỏ lưu',
          text2: 'Khuyến mãi đã được bỏ lưu',
        });
      } else {
        await savedPromotionsStorage.savePromotion(promotionId);
        const newSet = new Set(savedPromotionIds);
        newSet.add(promotionId);
        setSavedPromotionIds(newSet);
        Toast.show({
          type: 'success',
          text1: 'Đã lưu',
          text2: 'Khuyến mãi đã được lưu. Bạn có thể sử dụng khi thanh toán.',
        });
      }
    } catch (error) {
      Toast.show({
        type: 'error',
        text1: 'Lỗi',
        text2: 'Không thể lưu khuyến mãi',
      });
    }
  };

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
      const saved = await savedPromotionsStorage.getSavedPromotions();
      setSavedPromotionIds(new Set(saved));
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  const getPromotionTypeText = (promotion: any) => {
    switch (promotion.type) {
      case 'order_threshold':
        if (promotion.discountPercent) {
          return `Giảm ${promotion.discountPercent}%`;
        }
        return 'Khuyến mãi đơn hàng';
      case 'combo':
        return 'Combo khuyến mãi';
      case 'flash_sale':
        return 'Flash Sale';
      case 'category_bundle':
        return 'Khuyến mãi danh mục';
      default:
        return 'Khuyến mãi';
    }
  };

  const getPromotionBadgeColor = (type: string) => {
    switch (type) {
      case 'flash_sale':
        return COLORS.error;
      case 'combo':
        return COLORS.success;
      case 'order_threshold':
        return COLORS.warning;
      case 'category_bundle':
        return COLORS.primary;
      default:
        return COLORS.secondary;
    }
  };

  const renderItem = ({ item }: { item: any }) => {
    const fullImageUrl = getMedicineImageUrl(item);
    const badgeColor = getPromotionBadgeColor(item.type);
    const isActive = item.isActive && 
      new Date() >= new Date(item.startDate) && 
      new Date() <= new Date(item.endDate);
    const isExpired = new Date() > new Date(item.endDate);
    const isUpcoming = new Date() < new Date(item.startDate);

    const isSaved = savedPromotionIds.has(item._id);

    return (
      <TouchableOpacity 
        style={[
          styles.item,
          isSaved && styles.itemSaved
        ]} 
        activeOpacity={0.8}
      >
        <View style={styles.imageContainer}>
          <Image
            source={{ uri: fullImageUrl }}
            style={styles.image}
            resizeMode="cover"
          />
          {!isActive && (
            <View style={styles.overlay}>
              <View style={[styles.statusBadge, isExpired && styles.statusBadgeExpired]}>
                <Text style={styles.statusBadgeText}>
                  {isExpired ? 'Đã hết hạn' : isUpcoming ? 'Sắp diễn ra' : 'Tạm dừng'}
                </Text>
              </View>
            </View>
          )}
          {item.type === 'flash_sale' && isActive && (
            <View style={styles.flashSaleBadge}>
              <Ionicons name="flash" size={16} color="#fff" />
              <Text style={styles.flashSaleText}>FLASH SALE</Text>
            </View>
          )}
          {/* Save button */}
          <TouchableOpacity
            style={styles.saveButton}
            onPress={() => handleSavePromotion(item._id)}
          >
            <Ionicons
              name={savedPromotionIds.has(item._id) ? 'bookmark' : 'bookmark-outline'}
              size={24}
              color={savedPromotionIds.has(item._id) ? COLORS.primary : COLORS.textSecondary}
            />
          </TouchableOpacity>
        </View>
        <View style={styles.content}>
          <View style={styles.header}>
            <View style={styles.titleContainer}>
              <Text style={styles.title} numberOfLines={2}>{item.name}</Text>
              {isSaved && (
                <View style={styles.savedBadge}>
                  <Ionicons name="bookmark" size={12} color={COLORS.primary} />
                  <Text style={styles.savedBadgeText}>Đã lưu</Text>
                </View>
              )}
            </View>
            <View style={[styles.badge, { backgroundColor: badgeColor }]}>
              <Text style={styles.badgeText}>
                {getPromotionTypeText(item)}
              </Text>
            </View>
          </View>
          {item.description && (
            <Text style={styles.description} numberOfLines={2}>
              {item.description}
            </Text>
          )}
          {item.code && (
            <TouchableOpacity 
              style={styles.codeContainer}
              onPress={async () => {
                try {
                  // Use expo-clipboard if available, otherwise show code
                  const { setStringAsync } = await import('expo-clipboard');
                  await setStringAsync(item.code);
                  Toast.show({
                    type: 'success',
                    text1: 'Đã sao chép',
                    text2: `Mã ${item.code} đã được sao chép`,
                  });
                } catch (error) {
                  // Fallback: just show the code
                  Toast.show({
                    type: 'info',
                    text1: 'Mã khuyến mãi',
                    text2: item.code,
                  });
                }
              }}
            >
              <Ionicons name="pricetag-outline" size={16} color={COLORS.primary} />
              <Text style={styles.code}>Mã: {item.code}</Text>
              <Ionicons name="copy-outline" size={14} color={COLORS.primary} style={styles.copyIcon} />
            </TouchableOpacity>
          )}
          <View style={styles.dates}>
            <Ionicons name="calendar-outline" size={14} color={COLORS.textSecondary} />
            <Text style={styles.dateText}>
              {new Date(item.startDate).toLocaleDateString('vi-VN')} -{' '}
              {new Date(item.endDate).toLocaleDateString('vi-VN')}
            </Text>
          </View>
          {item.minOrderValue && (
            <View style={styles.conditionRow}>
              <Ionicons name="receipt-outline" size={14} color={COLORS.textSecondary} />
              <Text style={styles.condition}>
                Áp dụng cho đơn hàng từ {item.minOrderValue.toLocaleString('vi-VN')} ₫
              </Text>
            </View>
          )}
          {item.discountPercent && (
            <View style={styles.discountContainer}>
              <LinearGradient
                colors={[COLORS.success, '#10b981']}
                style={styles.discountBadge}
              >
                <Text style={styles.discountText}>
                  Giảm {item.discountPercent}%
                </Text>
              </LinearGradient>
              {item.maxDiscountAmount && (
                <Text style={styles.maxDiscount}>
                  Tối đa {item.maxDiscountAmount.toLocaleString('vi-VN')} ₫
                </Text>
              )}
            </View>
          )}
          {item.type === 'flash_sale' && item.dailyStartTime && item.dailyEndTime && (
            <View style={styles.conditionRow}>
              <Ionicons name="time-outline" size={14} color={COLORS.warning} />
              <Text style={[styles.condition, styles.flashSaleTime]}>
                Thời gian: {item.dailyStartTime} - {item.dailyEndTime}
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  if (isLoading) {
    return <Loading />;
  }

  if (isError) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyContainer}>
          <Ionicons name="alert-circle-outline" size={64} color={COLORS.error} />
          <Text style={styles.emptyText}>Lỗi khi tải khuyến mãi</Text>
          <Text style={styles.errorText}>
            {error instanceof Error ? error.message : 'Không thể tải danh sách khuyến mãi'}
          </Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => {
              // Refetch data
              queryClient.invalidateQueries({ queryKey: ['promotions', 'all'] });
              refetch();
            }}
          >
            <Text style={styles.retryButtonText}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {promotions.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="pricetag-outline" size={64} color={COLORS.textSecondary} />
          <Text style={styles.emptyText}>
            Không có khuyến mãi nào
          </Text>
          <Text style={styles.emptySubtext}>
            Vui lòng quay lại sau để xem các khuyến mãi mới
          </Text>
        </View>
      ) : (
        <FlatList
            data={promotions}
            renderItem={renderItem}
            keyExtractor={(item) => item._id || item.id || Math.random().toString()}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={[COLORS.primary]}
                tintColor={COLORS.primary}
              />
            }
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="pricetag-outline" size={64} color={COLORS.textSecondary} />
                <Text style={styles.emptyText}>
                  Không có khuyến mãi nào
                </Text>
              </View>
            }
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
  list: {
    padding: 16,
  },
  item: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  itemSaved: {
    borderColor: COLORS.primary,
    borderWidth: 2,
    backgroundColor: '#f0f7ff',
  },
  imageContainer: {
    position: 'relative',
    width: '100%',
    height: 150,
  },
  image: {
    width: '100%',
    height: 150,
    backgroundColor: COLORS.border,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusBadge: {
    backgroundColor: COLORS.warning,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  statusBadgeExpired: {
    backgroundColor: COLORS.error,
  },
  statusBadgeText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  flashSaleBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.error,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  flashSaleText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 4,
  },
  content: {
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  titleContainer: {
    flex: 1,
    marginRight: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    flex: 1,
    marginRight: 8,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  description: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 12,
  },
  codeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f9ff',
    padding: 12,
    borderRadius: 10,
    marginTop: 8,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    borderStyle: 'dashed',
  },
  code: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
    marginLeft: 6,
    flex: 1,
  },
  copyIcon: {
    marginLeft: 8,
  },
  dates: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  dateText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginLeft: 4,
  },
  conditionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  condition: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginLeft: 4,
    flex: 1,
  },
  flashSaleTime: {
    color: COLORS.warning,
    fontWeight: '600',
  },
  saveButton: {
    position: 'absolute',
    top: 8,
    left: 8,
    padding: 10,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 6,
    zIndex: 10,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.05)',
  },
  discountContainer: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  discountBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
  },
  discountText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  maxDiscount: {
    fontSize: 12,
    color: COLORS.textSecondary,
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
  emptySubtext: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 8,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 14,
    color: COLORS.error,
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  retryButton: {
    marginTop: 16,
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
  headerActions: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 8,
  },
  filterButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filterButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  filterButtonTextActive: {
    color: '#fff',
  },
  savedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  savedBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.primary,
    marginLeft: 4,
  },
  toggleButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: COLORS.primary,
    borderRadius: 8,
  },
  toggleButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

