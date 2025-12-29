import React, { useState, useMemo, useEffect, useLayoutEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { useQuery } from '@tanstack/react-query';
import { medicinesApi } from '../../api/medicines';
import { COLORS } from '../../utils/constants';
import { Loading } from '../../components/common/Loading';
import { API_BASE_URL } from '../../utils/constants';
import { useCart } from '../../contexts/CartContext';
import { Button } from '../../components/common/Button';
import { Ionicons } from '@expo/vector-icons';
import { getImageUrlWithFallback, DEFAULT_PLACEHOLDER_IMAGE } from '../../utils/imageHelper';
import Toast from 'react-native-toast-message';

export default function MedicineDetailScreen({ route, navigation }: any) {
  // Set header with back button
  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      title: 'Chi tiết sản phẩm',
      headerStyle: {
        backgroundColor: COLORS.primary,
      },
      headerTintColor: '#fff',
      headerTitleStyle: {
        fontWeight: 'bold',
      },
      headerBackTitleVisible: false,
      headerLeft: () => {
        const handleGoBack = () => {
          // Always navigate back to MedicineList screen explicitly
          // This ensures we go back to MedicineList instead of Home
          (navigation as any).navigate('Medicines', {
            screen: 'MedicineList',
          });
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
  }, [navigation]);
  const { medicineId } = route.params || {};
  const { addToCart } = useCart();
  const [quantity, setQuantity] = useState(1);
  const [imageError, setImageError] = useState(false);
  const [fallbackError, setFallbackError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);

  const { data, isLoading, error } = useQuery({
    queryKey: ['medicine', medicineId],
    queryFn: () => {
      if (!medicineId) {
        throw new Error('Medicine ID is required');
      }
      return medicinesApi.getMedicineById(medicineId);
    },
    enabled: !!medicineId,
  });

  // Removed debug logging for production

  const medicine = data?.data;

  // Reset image error when medicine changes
  useEffect(() => {
    setImageError(false);
    setFallbackError(false);
    setImageLoading(true);
  }, [medicineId]);

  // Memoize image URLs - must be called before early returns (Rules of Hooks)
  const primaryImageUrl = useMemo(() => {
    if (!medicine) return null;
    return getImageUrlWithFallback(medicine, false, false);
  }, [medicine?._id, medicine?.imageUrl]);
  
  const currentImageUrl = useMemo(() => 
    getImageUrlWithFallback(medicine, imageError, fallbackError),
    [medicine, imageError, fallbackError]
  );
  
  // Check if we should show local placeholder (all images failed or no image URL)
  const shouldShowLocalPlaceholder = currentImageUrl === null;

  if (!medicineId) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Không có ID sản phẩm</Text>
      </View>
    );
  }

  if (isLoading) {
    return <Loading />;
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>
          Lỗi: {error instanceof Error ? error.message : 'Không thể tải sản phẩm'}
        </Text>
      </View>
    );
  }

  if (!medicine) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Không tìm thấy sản phẩm</Text>
        <Text style={styles.errorSubtext}>ID: {medicineId}</Text>
      </View>
    );
  }

  // Ensure price is a number
  const price = typeof medicine.price === 'number' 
    ? medicine.price 
    : typeof medicine.price === 'string' 
    ? parseFloat(medicine.price) || 0
    : medicine.salePrice || 0;

  const originalPrice = medicine.originalPrice 
    ? (typeof medicine.originalPrice === 'number' 
        ? medicine.originalPrice 
        : parseFloat(medicine.originalPrice) || 0)
    : null;

  const hasDiscount = originalPrice && originalPrice > price;
  const discountPercentage = hasDiscount 
    ? Math.round(((originalPrice - price) / originalPrice) * 100)
    : 0;

  const stock = medicine.stock || medicine.stockQuantity || 0;
  const inStock = medicine.inStock !== false && stock > 0;
  const maxQuantity = inStock ? Math.min(stock, 999) : 0;

  const handleAddToCart = async () => {
    if (!inStock) {
      Toast.show({
        type: 'error',
        text1: 'Hết hàng',
        text2: 'Sản phẩm này hiện không còn hàng',
      });
      return;
    }

    if (quantity > maxQuantity) {
      Toast.show({
        type: 'error',
        text1: 'Số lượng không hợp lệ',
        text2: `Chỉ còn ${maxQuantity} sản phẩm trong kho`,
      });
      setQuantity(maxQuantity);
      return;
    }

    await addToCart(medicine._id, quantity);
    Toast.show({
      type: 'success',
      text1: 'Thành công',
      text2: 'Đã thêm sản phẩm vào giỏ hàng',
    });
  };

  return (
    <ScrollView style={styles.container}>
      {/* Image Section */}
      <View style={styles.imageContainer}>
        {shouldShowLocalPlaceholder ? (
          <View style={styles.localPlaceholder}>
            <Ionicons name="medical-outline" size={80} color={COLORS.textSecondary} />
          </View>
        ) : (
          <>
            <Image
              key={currentImageUrl}
              source={{ uri: currentImageUrl! }}
              style={styles.image}
              contentFit="cover"
              transition={200}
              onLoadStart={() => setImageLoading(true)}
              onLoadEnd={() => setImageLoading(false)}
              onError={(error: any) => {
                // Check if error is a 400 or 404 (common for missing images)
                const errorMessage = error?.message || String(error || '');
                const is400Error = errorMessage.includes('400') || errorMessage.includes('status code: 400');
                const is404Error = errorMessage.includes('404') || errorMessage.includes('Not Found') || errorMessage.includes('status code: 404');
                
                // Only log non-404/400 errors (these are expected for missing images)
                // Note: MedicineDetailScreen doesn't have logger imported, so we skip logging
                
                // Try fallback chain: primary -> fallback -> local placeholder
                if (!imageError && primaryImageUrl) {
                  setImageError(true);
                } else if (!fallbackError) {
                  setFallbackError(true);
                }
                setImageLoading(false);
              }}
            />
            {imageLoading && (
              <View style={styles.imageLoadingOverlay}>
                <ActivityIndicator size="large" color={COLORS.primary} />
              </View>
            )}
          </>
        )}
        {/* Badges */}
        <View style={styles.badgesContainer}>
          {medicine.isHot && (
            <View style={[styles.badge, styles.hotBadge]}>
              <Ionicons name="flame" size={14} color="#fff" />
              <Text style={styles.badgeText}>Hot</Text>
            </View>
          )}
          {medicine.isNew && (
            <View style={[styles.badge, styles.newBadge]}>
              <Text style={styles.badgeText}>Mới</Text>
            </View>
          )}
          {hasDiscount && (
            <View style={[styles.badge, styles.discountBadge]}>
              <Text style={styles.badgeText}>-{discountPercentage}%</Text>
            </View>
          )}
        </View>
      </View>
      
      {/* Content Section */}
      <View style={styles.content}>
        {/* Product Name */}
        <Text style={styles.name}>{medicine.name}</Text>

        {/* Strength (Hàm lượng) */}
        {medicine.strength && (
          <View style={styles.strengthContainer}>
            <Ionicons name="medical-outline" size={18} color={COLORS.primary} />
            <Text style={styles.strength}>{medicine.strength}</Text>
          </View>
        )}

        {/* Price Section */}
        <View style={styles.priceSection}>
          <View style={styles.priceRow}>
            <View style={styles.priceContainer}>
              <Text style={styles.price}>
                {price.toLocaleString('vi-VN')} ₫
              </Text>
              {medicine.unit && (
                <Text style={styles.priceUnit}>/{medicine.unit}</Text>
              )}
            </View>
            {hasDiscount && originalPrice && (
              <View style={styles.originalPriceContainer}>
                <Text style={styles.originalPrice}>
                  {originalPrice.toLocaleString('vi-VN')} ₫
                </Text>
                {medicine.unit && (
                  <Text style={styles.originalPriceUnit}>/{medicine.unit}</Text>
                )}
              </View>
            )}
          </View>
          {hasDiscount && (
            <Text style={styles.discountText}>
              Tiết kiệm {((originalPrice! - price)).toLocaleString('vi-VN')} ₫
            </Text>
          )}
        </View>

        {/* Stock Status */}
        <View style={styles.stockSection}>
          <View style={[styles.stockBadge, inStock ? styles.inStockBadge : styles.outOfStockBadge]}>
            <Ionicons 
              name={inStock ? "checkmark-circle" : "close-circle"} 
              size={16} 
              color={inStock ? COLORS.success : COLORS.error} 
            />
            <Text style={[styles.stockText, inStock ? styles.inStockText : styles.outOfStockText, { marginLeft: 6 }]}>
              {inStock ? `Còn hàng (${stock} ${medicine.unit || 'sản phẩm'})` : 'Hết hàng'}
            </Text>
          </View>
        </View>

        {/* Product Details */}
        <View style={styles.detailsSection}>
          <View style={styles.detailRow}>
            <Ionicons name="pricetag-outline" size={20} color={COLORS.textSecondary} />
            <Text style={styles.detailLabel}>Danh mục:</Text>
            <Text style={styles.detailValue}>{medicine.category || 'Chưa phân loại'}</Text>
          </View>
          {medicine.manufacturerId && (
            <View style={styles.detailRow}>
              <Ionicons name="business-outline" size={20} color={COLORS.textSecondary} />
              <Text style={styles.detailLabel}>Nhà sản xuất:</Text>
              <Text style={styles.detailValue}>{medicine.manufacturerId}</Text>
            </View>
          )}
          {medicine.unit && (
            <View style={styles.detailRow}>
              <Ionicons name="cube-outline" size={20} color={COLORS.textSecondary} />
              <Text style={styles.detailLabel}>Đơn vị:</Text>
              <Text style={styles.detailValue}>{medicine.unit || 'Chưa có'}</Text>
            </View>
          )}
        </View>

        {/* Description */}
        {(medicine.description || medicine.strength) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Mô tả sản phẩm</Text>
            <Text style={styles.description}>
              {medicine.description || medicine.strength || 'Chưa có mô tả'}
            </Text>
          </View>
        )}

        {/* Quantity Section */}
        <View style={styles.quantitySection}>
          <Text style={styles.sectionTitle}>Số lượng</Text>
          <View style={styles.quantityControl}>
            <TouchableOpacity
              style={[styles.quantityButton, quantity <= 1 && styles.quantityButtonDisabled]}
              onPress={() => setQuantity(Math.max(1, quantity - 1))}
              disabled={quantity <= 1}
            >
              <Text style={[styles.quantityButtonText, quantity <= 1 && styles.quantityButtonTextDisabled]}>-</Text>
            </TouchableOpacity>
            <Text style={styles.quantity}>{quantity}</Text>
            <TouchableOpacity
              style={[styles.quantityButton, quantity >= maxQuantity && styles.quantityButtonDisabled]}
              onPress={() => setQuantity(Math.min(maxQuantity, quantity + 1))}
              disabled={quantity >= maxQuantity || !inStock}
            >
              <Text style={[styles.quantityButtonText, quantity >= maxQuantity && styles.quantityButtonTextDisabled]}>+</Text>
            </TouchableOpacity>
          </View>
          {inStock && (
            <Text style={styles.quantityHint}>
              Tối đa {maxQuantity} sản phẩm
            </Text>
          )}
        </View>

        {/* Add to Cart Button */}
        <Button
          title={inStock ? "Thêm vào giỏ hàng" : "Hết hàng"}
          onPress={handleAddToCart}
          style={styles.addButton}
          disabled={!inStock}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
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
    zIndex: 1,
  },
  imageContainer: {
    position: 'relative',
    width: '100%',
    height: 350,
    backgroundColor: COLORS.border,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  localPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgesContainer: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    marginLeft: 8,
    marginBottom: 4,
  },
  hotBadge: {
    backgroundColor: '#ef4444',
  },
  newBadge: {
    backgroundColor: COLORS.primary,
  },
  discountBadge: {
    backgroundColor: COLORS.success,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  content: {
    padding: 16,
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 8,
    lineHeight: 32,
  },
  strengthContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: `${COLORS.primary}15`,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  strength: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.primary,
    marginLeft: 6,
  },
  priceSection: {
    marginBottom: 16,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  price: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  priceUnit: {
    fontSize: 16,
    fontWeight: '500',
    color: COLORS.textSecondary,
    marginLeft: 4,
  },
  originalPriceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginLeft: 12,
  },
  originalPrice: {
    fontSize: 18,
    color: COLORS.textSecondary,
    textDecorationLine: 'line-through',
  },
  originalPriceUnit: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textDecorationLine: 'line-through',
    marginLeft: 4,
  },
  discountText: {
    fontSize: 14,
    color: COLORS.success,
    fontWeight: '500',
  },
  stockSection: {
    marginBottom: 20,
  },
  stockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  inStockBadge: {
    backgroundColor: `${COLORS.success}15`,
  },
  outOfStockBadge: {
    backgroundColor: `${COLORS.error}15`,
  },
  stockText: {
    fontSize: 14,
    fontWeight: '500',
  },
  inStockText: {
    color: COLORS.success,
  },
  outOfStockText: {
    color: COLORS.error,
  },
  detailsSection: {
    backgroundColor: '#f9fafb',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  detailLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontWeight: '500',
    marginRight: 8,
  },
  detailValue: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '600',
    flex: 1,
  },
  section: {
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 12,
  },
  description: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 22,
  },
  quantitySection: {
    marginBottom: 24,
  },
  quantityControl: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  quantityButton: {
    padding: 12,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f9fafb',
  },
  quantityButtonDisabled: {
    opacity: 0.5,
  },
  quantityButtonText: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.text,
  },
  quantityButtonTextDisabled: {
    color: COLORS.textSecondary,
  },
  quantity: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    paddingHorizontal: 24,
    minWidth: 60,
    textAlign: 'center',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: COLORS.border,
  },
  quantityHint: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  addButton: {
    marginTop: 8,
    marginBottom: 20,
  },
  errorText: {
    fontSize: 16,
    color: COLORS.error,
    textAlign: 'center',
    marginTop: 40,
    padding: 16,
  },
  errorSubtext: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    padding: 16,
  },
});

