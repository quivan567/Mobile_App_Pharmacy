import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { CartItem as CartItemType } from '../../api/cart';
import { COLORS } from '../../utils/constants';
import { API_BASE_URL } from '../../utils/constants';
import { getImageUrlWithFallback, DEFAULT_PLACEHOLDER_IMAGE } from '../../utils/imageHelper';

interface CartItemProps {
  item: CartItemType;
  onUpdateQuantity: (itemId: string, quantity: number) => void;
  onRemove: (itemId: string) => void;
}

export const CartItem: React.FC<CartItemProps> = ({
  item,
  onUpdateQuantity,
  onRemove,
}) => {
  // Backend returns productId (populated) instead of product
  const product = typeof item.product === 'object' ? item.product : 
                  (typeof item.productId === 'object' ? item.productId : null);
  const productName = product?.name || 'Sản phẩm';
  // Get price from item, product, or productId, fallback to 0
  const productPrice = item.price || product?.price || 0;
  const total = productPrice * (item.quantity || 1);

  // Image handling with fallback
  const [imageError, setImageError] = useState(false);
  const [fallbackError, setFallbackError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);
  
  const primaryImageUrl = useMemo(() => {
    if (!product) return null;
    return getImageUrlWithFallback(product, false, false);
  }, [product?._id, product?.imageUrl]);
  
  const currentImageUrl = useMemo(() => {
    if (!product) return null;
    return getImageUrlWithFallback(product, imageError, fallbackError);
  }, [product, imageError, fallbackError]);
  
  // Check if we should show local placeholder (all images failed or no image URL)
  const shouldShowLocalPlaceholder = currentImageUrl === null;

  return (
    <View style={styles.container}>
      <View style={styles.imageContainer}>
        {shouldShowLocalPlaceholder ? (
          <View style={styles.localPlaceholder}>
            <Ionicons name="medical-outline" size={32} color={COLORS.textSecondary} />
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
              onError={() => {
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
                <ActivityIndicator size="small" color={COLORS.primary} />
              </View>
            )}
          </>
        )}
      </View>

      <View style={styles.content}>
        <Text style={styles.name} numberOfLines={2}>
          {productName}
        </Text>
        <Text style={styles.price}>
          {productPrice?.toLocaleString('vi-VN') || '0'} ₫
        </Text>

        <View style={styles.actions}>
          <View style={styles.quantityControl}>
            <TouchableOpacity
              style={styles.quantityButton}
              onPress={() => onUpdateQuantity(item._id, item.quantity - 1)}
            >
              <Ionicons name="remove" size={18} color={COLORS.text} />
            </TouchableOpacity>
            <Text style={styles.quantity}>{item.quantity}</Text>
            <TouchableOpacity
              style={styles.quantityButton}
              onPress={() => onUpdateQuantity(item._id, item.quantity + 1)}
            >
              <Ionicons name="add" size={18} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.removeButton}
            onPress={() => onRemove(item._id)}
          >
            <Ionicons name="trash-outline" size={20} color={COLORS.error} />
          </TouchableOpacity>
        </View>

        <Text style={styles.total}>
          Tổng: {total?.toLocaleString('vi-VN') || '0'} ₫
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    padding: 12,
    marginBottom: 12,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  imageContainer: {
    width: 80,
    height: 80,
    borderRadius: 8,
    marginRight: 12,
    position: 'relative',
    overflow: 'hidden',
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
  content: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
  },
  price: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '600',
    marginBottom: 8,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  quantityControl: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
  },
  quantityButton: {
    padding: 6,
    minWidth: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quantity: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    paddingHorizontal: 12,
    minWidth: 40,
    textAlign: 'center',
  },
  removeButton: {
    padding: 8,
  },
  total: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    textAlign: 'right',
  },
});

