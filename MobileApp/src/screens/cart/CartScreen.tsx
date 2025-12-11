import React, { useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCart } from '../../contexts/CartContext';
import { CartItem } from '../../components/cart/CartItem';
import { Button } from '../../components/common/Button';
import { COLORS } from '../../utils/constants';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../contexts/AuthContext';
import Toast from 'react-native-toast-message';

export default function CartScreen() {
  const navigation = useNavigation();
  const { isAuthenticated } = useAuth();
  const {
    items,
    isLoading,
    subtotal,
    itemCount,
    updateQuantity,
    removeFromCart,
    refreshCart,
  } = useCart();

  // Track if we've already refreshed on this focus
  const hasRefreshedRef = useRef(false);
  const isInitialLoadRef = useRef(true);

  // Refresh cart when screen is focused (only once per focus, in background)
  useFocusEffect(
    useCallback(() => {
      if (isAuthenticated && !hasRefreshedRef.current) {
        hasRefreshedRef.current = true;
        // Refresh in background without blocking UI
        refreshCart().finally(() => {
          isInitialLoadRef.current = false;
        });
      }
      
      // Reset flag when screen loses focus
      return () => {
        hasRefreshedRef.current = false;
      };
    }, [isAuthenticated]) // Remove refreshCart from dependencies
  );

  const safeSubtotal = subtotal || 0;
  const shippingFee = safeSubtotal > 200000 ? 0 : 30000;
  const total = safeSubtotal + shippingFee;

  // Only show loading on initial load (when no items yet)
  if (isLoading && isInitialLoadRef.current && items.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <SafeAreaView style={styles.emptyContainer} edges={['top']}>
        <Text style={styles.emptyText}>Giỏ hàng trống</Text>
        <Button
          title="Tiếp tục mua sắm"
          onPress={() => {
            (navigation as any).navigate('Medicines');
          }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView style={styles.scrollView}>
        <View style={styles.header}>
          <Text style={styles.title}>Giỏ hàng ({itemCount} sản phẩm)</Text>
        </View>

        {items.map((item) => (
          <CartItem
            key={item._id}
            item={item}
            onUpdateQuantity={updateQuantity}
            onRemove={removeFromCart}
          />
        ))}

        <View style={styles.summary}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Tạm tính:</Text>
            <Text style={styles.summaryValue}>
              {safeSubtotal.toLocaleString('vi-VN')} ₫
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Phí vận chuyển:</Text>
            <Text style={styles.summaryValue}>
              {shippingFee === 0 ? 'Miễn phí' : `${shippingFee.toLocaleString('vi-VN')} ₫`}
            </Text>
          </View>
          <View style={[styles.summaryRow, styles.totalRow]}>
            <Text style={styles.totalLabel}>Tổng cộng:</Text>
            <Text style={styles.totalValue}>
              {(total || 0).toLocaleString('vi-VN')} ₫
            </Text>
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.footerSummary}>
          <Text style={styles.footerLabel}>Tổng tiền:</Text>
          <Text style={styles.footerTotal}>
            {(total || 0).toLocaleString('vi-VN')} ₫
          </Text>
        </View>
        <Button
          title="Thanh toán"
          onPress={() => {
            if (!isAuthenticated) {
              Toast.show({
                type: 'info',
                text1: 'Vui lòng đăng nhập',
                text2: 'Bạn cần đăng nhập để thanh toán',
              });
              return;
            }
            (navigation as any).navigate('Checkout');
          }}
          style={styles.checkoutButton}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    fontSize: 18,
    color: COLORS.textSecondary,
    marginBottom: 20,
  },
  scrollView: {
    flex: 1,
  },
  header: {
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  summary: {
    backgroundColor: '#fff',
    padding: 16,
    marginTop: 12,
    marginHorizontal: 16,
    borderRadius: 8,
    marginBottom: 100,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  summaryLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  summaryValue: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '600',
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 12,
    marginTop: 8,
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  totalValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  footerSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  footerLabel: {
    fontSize: 16,
    color: COLORS.textSecondary,
  },
  footerTotal: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  checkoutButton: {
    width: '100%',
  },
});

