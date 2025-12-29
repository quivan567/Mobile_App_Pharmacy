import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ScrollView, TextInput, Modal, ActivityIndicator, RefreshControl } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, keepPreviousData, useQueryClient } from '@tanstack/react-query';
import { medicinesApi } from '../../api/medicines';
import { categoriesApi } from '../../api/categories';
import { COLORS } from '../../utils/constants';
import { Loading } from '../../components/common/Loading';
import { SkeletonProductCard } from '../../components/common/Skeleton';
import { API_BASE_URL } from '../../utils/constants';
import { useCart } from '../../contexts/CartContext';
import Toast from 'react-native-toast-message';
import { Ionicons } from '@expo/vector-icons';
import { getImageUrlWithFallback } from '../../utils/imageHelper';
import { logger } from '../../utils/logger';
import { Button } from '../../components/common/Button';
import { highlightText } from '../../utils/textHighlight';

export default function MedicineListScreen({ navigation, route }: any) {
  const insets = useSafeAreaInsets();
  const { addToCart } = useCart();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState<string | undefined>(
    route?.params?.search || undefined
  );
  const [allMedicines, setAllMedicines] = useState<any[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const [minPrice, setMinPrice] = useState<string>('');
  const [maxPrice, setMaxPrice] = useState<string>('');
  const [inStockOnly, setInStockOnly] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState(false);
  const isLoadingMoreRef = useRef(false);
  const lastPageRef = useRef(0);

  // Update search query when route params change
  useEffect(() => {
    if (route?.params?.search !== undefined) {
      setSearchQuery(route.params.search);
      setPage(1);
      setSelectedCategory(undefined);
      setAllMedicines([]);
      lastPageRef.current = 0;
      isLoadingMoreRef.current = false;
    }
  }, [route?.params?.search]);

  // Reset when filters change
  useEffect(() => {
    setAllMedicines([]);
    setPage(1);
    lastPageRef.current = 0;
    isLoadingMoreRef.current = false;
  }, [selectedCategory, searchQuery, minPrice, maxPrice, inStockOnly]);

  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: () => categoriesApi.getCategories(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });

  const LIMIT_PER_PAGE = 25;

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['medicines', page, selectedCategory, searchQuery, minPrice, maxPrice, inStockOnly],
    queryFn: () => medicinesApi.getMedicines({ 
      page, 
      limit: LIMIT_PER_PAGE, 
      category: selectedCategory,
      search: searchQuery,
      minPrice: minPrice ? Number(minPrice) : undefined,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
      inStock: inStockOnly || undefined,
      fuzzy: true, // Enable fuzzy search
    }),
    staleTime: 2 * 60 * 1000, // 2 minutes
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData, // Keep previous data while fetching new page
  });

  // Accumulate medicines from all pages
  useEffect(() => {
    if (data?.data) {
      // Only update if this is a new page or page 1 (reset case)
      if (page === 1 || page > lastPageRef.current) {
        setAllMedicines((prev) => {
          // Check if we're loading page 1 (reset case)
          if (page === 1) {
            return data.data;
          }
          // Merge new data, avoiding duplicates
          const existingIds = new Set(prev.map((item) => item._id));
          const newItems = data.data.filter((item: any) => !existingIds.has(item._id));
          return [...prev, ...newItems];
        });
        lastPageRef.current = page;
        
        // Reset loading flag when data arrives
        isLoadingMoreRef.current = false;
      }
      
      // Update total pages
      if (data.pagination?.totalPages) {
        setTotalPages(data.pagination.totalPages);
      } else if (data.pagination?.total) {
        const calculatedPages = Math.ceil(data.pagination.total / LIMIT_PER_PAGE);
        setTotalPages(calculatedPages);
      }
    } else if (page === 1 && data && (!data.data || data.data.length === 0)) {
      // Empty result for page 1
      setAllMedicines([]);
      isLoadingMoreRef.current = false;
    }
  }, [data, page]);

  const handleAddToCart = useCallback(async (medicine: any) => {
    await addToCart(medicine._id, 1);
  }, [addToCart]);

  // Medicine Item Component with image error handling and search highlighting
  const MedicineItem = React.memo(({ item, onPress, onAddToCart, searchQuery }: any) => {
    const [imageError, setImageError] = useState(false);
    const [fallbackError, setFallbackError] = useState(false);
    const [imageLoading, setImageLoading] = useState(true);
    
    // Reset error states when item changes
    useEffect(() => {
      setImageError(false);
      setFallbackError(false);
      setImageLoading(true);
    }, [item._id, item.imageUrl]);
    
    const primaryImageUrl = useMemo(() => {
      const url = getImageUrlWithFallback(item, false, false);
      return url; // Can be string or null
    }, [item._id, item.imageUrl]);
    
    const currentImageUrl = useMemo(() => 
      getImageUrlWithFallback(item, imageError, fallbackError),
      [item._id, item.imageUrl, item.name, imageError, fallbackError]
    );
    
    // Check if we should show local placeholder (all images failed or no image URL)
    const shouldShowLocalPlaceholder = currentImageUrl === null;

    // Memoize callbacks to prevent re-renders
    const handleLoadStart = useCallback(() => {
      setImageLoading(true);
    }, []);

    const handleLoadEnd = useCallback(() => {
      setImageLoading(false);
    }, []);

    const handleError = useCallback((error: any) => {
      // Only log errors in development to reduce noise
      // Check if error is a 400 or 404 (common for missing images)
      const errorMessage = error?.message || String(error || '');
      const is400Error = errorMessage.includes('400') || errorMessage.includes('status code: 400');
      const is404Error = errorMessage.includes('404') || errorMessage.includes('Not Found') || errorMessage.includes('status code: 404');
      
      // Only log non-404/400 errors (these are expected for missing images)
      if (!is400Error && !is404Error) {
        logger.error('[MedicineListScreen] Image load error:', {
          medicineId: item._id,
          medicineName: item.name,
          imageUrl: item.imageUrl,
          currentImageUrl,
          error: errorMessage
        });
      }
      
      // Try fallback chain: primary -> fallback -> local placeholder
      if (!imageError && primaryImageUrl) {
        // Primary image failed, try fallback
        setImageError(true);
      } else if (!fallbackError) {
        // Fallback also failed, show placeholder
        setFallbackError(true);
      }
      // After both fail, we'll show local placeholder (no more retries)
      setImageLoading(false);
    }, [imageError, fallbackError, primaryImageUrl, item._id, item.name, item.imageUrl, currentImageUrl]);

    // Ensure price is a number
    const price = typeof item.price === 'number' 
      ? item.price 
      : typeof item.price === 'string' 
      ? parseFloat(item.price) || 0
      : item.salePrice || 0;

    // Highlight search terms in name
    const shouldHighlight = searchQuery && searchQuery.length >= 2;
    const highlightedName = shouldHighlight
      ? highlightText(item.name, searchQuery, styles.highlightText, styles.name)
      : null;

    return (
      <View style={styles.item}>
        <TouchableOpacity onPress={onPress}>
          <View style={styles.imageContainer}>
            {shouldShowLocalPlaceholder ? (
              <View style={styles.localPlaceholder}>
                <Ionicons name="medical-outline" size={48} color={COLORS.textSecondary} />
              </View>
            ) : (
              <>
                <Image
                  key={currentImageUrl}
                  source={{ uri: currentImageUrl! }}
                  style={styles.image}
                  contentFit="cover"
                  transition={200}
                  onLoadStart={handleLoadStart}
                  onLoadEnd={handleLoadEnd}
                  onError={handleError}
                  cachePolicy="memory-disk"
                />
                {imageLoading && (
                  <View style={styles.imageLoadingOverlay}>
                    <ActivityIndicator size="small" color={COLORS.primary} />
                  </View>
                )}
              </>
            )}
          </View>
          <View style={styles.content}>
            {shouldHighlight && highlightedName ? (
              <View style={styles.nameContainer}>
                {highlightedName}
              </View>
            ) : (
              <Text style={styles.name} numberOfLines={2}>
                {item.name}
              </Text>
            )}
            <Text style={styles.price}>
              {price.toLocaleString('vi-VN')} ₫
            </Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.addButton}
          onPress={onAddToCart}
        >
          <Text style={styles.addButtonText}>Thêm vào giỏ</Text>
        </TouchableOpacity>
      </View>
    );
  }, (prevProps, nextProps) => {
    // Return true if props are equal (no re-render needed)
    // Only re-render if item ID, image URL, name, price, or search query changes
    return (
      prevProps.item._id === nextProps.item._id &&
      prevProps.item.imageUrl === nextProps.item.imageUrl &&
      prevProps.item.name === nextProps.item.name &&
      prevProps.item.price === nextProps.item.price &&
      prevProps.searchQuery === nextProps.searchQuery
    );
  });

  const handleItemPress = useCallback((medicineId: string) => {
    navigation.navigate('MedicineDetail', { medicineId });
  }, [navigation]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setPage(1);
    setAllMedicines([]);
    lastPageRef.current = 0;
    isLoadingMoreRef.current = false;
    
    // Force refetch
    try {
      await queryClient.refetchQueries({ 
        queryKey: ['medicines', 1, selectedCategory, searchQuery, minPrice, maxPrice, inStockOnly] 
      });
    } finally {
      setRefreshing(false);
    }
  }, [selectedCategory, searchQuery, minPrice, maxPrice, inStockOnly, queryClient]);

  const renderItem = useCallback(({ item }: { item: any }) => {
    const itemPressHandler = () => handleItemPress(item._id);
    const addToCartHandler = () => handleAddToCart(item);
    
    return (
      <MedicineItem
        item={item}
        searchQuery={searchQuery}
        onPress={itemPressHandler}
        onAddToCart={addToCartHandler}
      />
    );
  }, [searchQuery, handleItemPress, handleAddToCart]);

  if (isLoading && !data) {
    return <Loading />;
  }

  const categories = categoriesData?.data || [];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Filters and Categories Header */}
      <View style={styles.filtersHeader}>
        {categories.length > 0 && (
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            style={styles.categoriesContainer}
            contentContainerStyle={styles.categoriesContent}
          >
          <TouchableOpacity
            style={[
              styles.categoryButton,
              !selectedCategory && styles.categoryButtonActive,
            ]}
              onPress={() => {
                setSelectedCategory(undefined);
                setSearchQuery(undefined);
                setPage(1);
                setAllMedicines([]);
                isLoadingMoreRef.current = false;
                lastPageRef.current = 0;
              }}
          >
            <Ionicons 
              name="grid-outline" 
              size={20} 
              color={!selectedCategory ? '#fff' : COLORS.text} 
            />
            <Text
              style={[
                styles.categoryText,
                !selectedCategory && styles.categoryTextActive,
              ]}
            >
              Tất cả
            </Text>
          </TouchableOpacity>
          {categories.map((category) => (
            <TouchableOpacity
              key={category._id}
              style={[
                styles.categoryButton,
                selectedCategory === category._id && styles.categoryButtonActive,
              ]}
              onPress={() => {
                setSelectedCategory(category._id);
                setSearchQuery(undefined);
                setPage(1);
                setAllMedicines([]);
                isLoadingMoreRef.current = false;
                lastPageRef.current = 0;
              }}
            >
              <Text
                style={[
                  styles.categoryText,
                  selectedCategory === category._id && styles.categoryTextActive,
                ]}
              >
                {category.name}
              </Text>
            </TouchableOpacity>
          ))}
          </ScrollView>
        )}
        <TouchableOpacity
          style={[
            styles.filterButton,
            (minPrice || maxPrice || inStockOnly) && styles.filterButtonActive,
          ]}
          onPress={() => setShowFilters(true)}
        >
          <Ionicons 
            name="options-outline" 
            size={20} 
            color={(minPrice || maxPrice || inStockOnly) ? '#fff' : COLORS.text} 
          />
          <Text
            style={[
              styles.filterButtonText,
              (minPrice || maxPrice || inStockOnly) && styles.filterButtonTextActive,
            ]}
          >
            Lọc
          </Text>
          {(minPrice || maxPrice || inStockOnly) && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>
                {[minPrice && '1', maxPrice && '2', inStockOnly && '3'].filter(Boolean).length}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Filters Modal */}
      <Modal
        visible={showFilters}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowFilters(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={[styles.modalHeader, { paddingTop: Math.max(insets.top, 20) }]}>
              <Text style={styles.modalTitle}>Bộ lọc</Text>
              <TouchableOpacity onPress={() => setShowFilters(false)}>
                <Ionicons name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {/* Price Range */}
              <View style={styles.filterSection}>
                <Text style={styles.filterSectionTitle}>Khoảng giá</Text>
                <View style={styles.priceInputs}>
                  <View style={styles.priceInputContainer}>
                    <Text style={styles.priceLabel}>Từ (₫)</Text>
                    <TextInput
                      style={styles.priceInput}
                      placeholder="0"
                      value={minPrice}
                      onChangeText={setMinPrice}
                      keyboardType="numeric"
                      placeholderTextColor={COLORS.textSecondary}
                    />
                  </View>
                  <View style={styles.priceInputContainer}>
                    <Text style={styles.priceLabel}>Đến (₫)</Text>
                    <TextInput
                      style={styles.priceInput}
                      placeholder="Không giới hạn"
                      value={maxPrice}
                      onChangeText={setMaxPrice}
                      keyboardType="numeric"
                      placeholderTextColor={COLORS.textSecondary}
                    />
                  </View>
                </View>
              </View>

              {/* Stock Status */}
              <View style={styles.filterSection}>
                <TouchableOpacity
                  style={styles.checkboxRow}
                  onPress={() => setInStockOnly(!inStockOnly)}
                >
                  <View style={[styles.checkbox, inStockOnly && styles.checkboxChecked]}>
                    {inStockOnly && (
                      <Ionicons name="checkmark" size={16} color="#fff" />
                    )}
                  </View>
                  <Text style={styles.checkboxLabel}>Chỉ hiển thị sản phẩm còn hàng</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <Button
                title="Xóa bộ lọc"
                variant="outline"
                onPress={() => {
                  setMinPrice('');
                  setMaxPrice('');
                  setInStockOnly(false);
                }}
                style={styles.resetButton}
              />
              <Button
                title="Áp dụng"
                onPress={() => {
                  setShowFilters(false);
                  setPage(1);
                  setAllMedicines([]);
                  lastPageRef.current = 0;
                  isLoadingMoreRef.current = false;
                }}
                style={styles.applyButton}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Products List */}
      {isLoading && allMedicines.length === 0 ? (
        <View style={styles.list}>
          <View style={styles.row}>
            <SkeletonProductCard />
            <SkeletonProductCard />
          </View>
          <View style={styles.row}>
            <SkeletonProductCard />
            <SkeletonProductCard />
          </View>
          <View style={styles.row}>
            <SkeletonProductCard />
            <SkeletonProductCard />
          </View>
        </View>
      ) : (
        <FlatList
          data={allMedicines}
          renderItem={renderItem}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.list}
          numColumns={2}
          columnWrapperStyle={styles.row}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={[COLORS.primary]}
              tintColor={COLORS.primary}
            />
          }
          onEndReached={() => {
            const hasMore = totalPages > 0 && page < totalPages;
            const isNotLoading = !isLoadingMoreRef.current && !isFetching && !isLoading;
            
            // Prevent multiple calls while loading
            if (hasMore && isNotLoading) {
              isLoadingMoreRef.current = true;
              setPage((prevPage) => {
                const nextPage = prevPage + 1;
                return nextPage;
              });
            }
          }}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            isFetching && allMedicines.length > 0 ? (
              <View style={styles.loadingMore}>
                <Text style={styles.loadingMoreText}>Đang tải thêm...</Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            !isLoading ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="medical-outline" size={64} color={COLORS.textSecondary} />
                <Text style={styles.emptyText}>Không tìm thấy sản phẩm</Text>
                {searchQuery && (
                  <Text style={styles.emptySubtext}>
                    Không có kết quả cho "{searchQuery}"
                  </Text>
                )}
                {selectedCategory && !searchQuery && (
                  <Text style={styles.emptySubtext}>
                    Không có sản phẩm trong danh mục này
                  </Text>
                )}
              </View>
            ) : null
          }
          removeClippedSubviews={true}
          maxToRenderPerBatch={5}
          updateCellsBatchingPeriod={100}
          windowSize={5}
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
  filtersHeader: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    alignItems: 'center',
  },
  categoriesContainer: {
    flex: 1,
  },
  categoriesContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  categoryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: COLORS.background,
    marginRight: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    height: 40,
    minWidth: 120,
    justifyContent: 'center',
  },
  categoryButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  categoryText: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '500',
    marginLeft: 4,
    textAlign: 'center',
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  categoryTextActive: {
    color: '#fff',
    fontWeight: '500', // Giữ fontWeight giống nhau để không thay đổi kích thước
  },
  list: {
    padding: 8,
  },
  row: {
    justifyContent: 'space-between',
  },
  item: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 8,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    flex: 1,
  },
  imageContainer: {
    width: '100%',
    height: 150,
    position: 'relative',
    backgroundColor: COLORS.border,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
    backgroundColor: COLORS.border,
  },
  imageLoadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  localPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: 12,
  },
  name: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
    minHeight: 40,
  },
  price: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.primary,
    marginBottom: 8,
  },
  addButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  addButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    width: '100%',
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
  loadingMore: {
    padding: 20,
    alignItems: 'center',
  },
  loadingMoreText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.background,
    borderLeftWidth: 1,
    borderLeftColor: COLORS.border,
    position: 'relative',
  },
  filterButtonActive: {
    backgroundColor: COLORS.primary,
  },
  filterButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.text,
    marginLeft: 6,
  },
  filterButtonTextActive: {
    color: '#fff',
  },
  filterBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#fff',
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  modalBody: {
    padding: 20,
  },
  filterSection: {
    marginBottom: 24,
  },
  filterSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 12,
  },
  priceInputs: {
    flexDirection: 'row',
    gap: 12,
  },
  priceInputContainer: {
    flex: 1,
  },
  priceLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  priceInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: COLORS.text,
    backgroundColor: COLORS.background,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: 4,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  checkboxLabel: {
    fontSize: 16,
    color: COLORS.text,
    flex: 1,
  },
  modalFooter: {
    flexDirection: 'row',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: 12,
  },
  resetButton: {
    flex: 1,
  },
  applyButton: {
    flex: 1,
  },
  nameContainer: {
    minHeight: 40, // Ensure consistent height
  },
  highlightText: {
    backgroundColor: COLORS.warning + '40',
    fontWeight: '600',
    color: COLORS.primary,
  },
});

