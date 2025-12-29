import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { useCart } from '../../contexts/CartContext';
import { useAuth } from '../../contexts/AuthContext';
import { ordersApi } from '../../api/orders';
import { paymentApi } from '../../api/payment';
import { promotionsApi } from '../../api/promotions';
import { AddressForm } from '../../components/checkout/AddressForm';
import { PaymentMethodSelector } from '../../components/checkout/PaymentMethodSelector';
import { CouponSelector } from '../../components/checkout/CouponSelector';
import { Button } from '../../components/common/Button';
import { Address, LegacyAddress, addressesApi } from '../../api/addresses';
import { COLORS } from '../../utils/constants';
import Toast from 'react-native-toast-message';
import { useNavigation } from '@react-navigation/native';
import { openMomoPayment } from '../../utils/momoHelper';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { TouchableOpacity, Modal, FlatList } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { logger } from '../../utils/logger';
import { retryWithBackoffAndFeedback, parseError } from '../../utils/errorHandler';

export default function CheckoutScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { items, subtotal, clearCart } = useCart();
  const { user } = useAuth();
  const [isProcessing, setIsProcessing] = useState(false);
  const [shippingAddress, setShippingAddress] = useState<LegacyAddress>({
    fullName: user?.firstName && user?.lastName 
      ? `${user.firstName} ${user.lastName}` 
      : '',
    phone: user?.phone || '',
    address: '',
    ward: '',
    district: '',
    province: '',
  });
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [appliedCoupon, setAppliedCoupon] = useState<any>(null);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [addressErrors, setAddressErrors] = useState<Partial<Record<keyof LegacyAddress, string>>>({});
  const [showAddressPicker, setShowAddressPicker] = useState(false);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);

  // Load saved addresses
  const { data: addressesData } = useQuery({
    queryKey: ['addresses'],
    queryFn: () => addressesApi.getAddresses(),
  });

  const savedAddresses = addressesData?.data || [];
  
  // Pricing state - includes automatic promotions
  const [pricing, setPricing] = useState<{
    subtotal: number;
    discountAmount: number;
    finalTotal: number;
    appliedRules: Array<{ id: string; name: string; type: string; discount: number }>;
  } | null>(null);
  const [isLoadingPricing, setIsLoadingPricing] = useState(false);

  // Calculate effective subtotal (after automatic promotions) or fallback to original subtotal
  // pricing.finalTotal = pricing.subtotal - pricing.discountAmount (sau automatic promotions)
  const effectiveSubtotal = pricing?.finalTotal || subtotal;
  const automaticDiscount = pricing?.discountAmount || 0;
  const originalSubtotal = pricing?.subtotal || subtotal;
  
  // Calculate final amount after all discounts (same logic as backend)
  // Backend: finalAmount = pricing.subtotal - finalDiscountAmount (after automatic + coupon)
  const finalAmountAfterDiscounts = Math.max(0, effectiveSubtotal - discountAmount);
  
  // Shipping fee based on final amount after all discounts (same logic as backend)
  // Backend: shippingFee = finalAmount >= 200000 ? 0 : 30000
  const shippingFee = finalAmountAfterDiscounts >= 200000 ? 0 : 30000;
  
  // Final total = finalAmountAfterDiscounts + shippingFee (same logic as backend)
  const finalTotal = finalAmountAfterDiscounts + shippingFee;

  // Debug: Log state changes
  useEffect(() => {
    logger.log('=== CheckoutScreen: State changed ===', {
      appliedCoupon,
      discountAmount,
      finalTotal,
      effectiveSubtotal,
      automaticDiscount,
    });
  }, [appliedCoupon, discountAmount, finalTotal, effectiveSubtotal, automaticDiscount]);

  // Calculate pricing with automatic promotions when items change
  useEffect(() => {
    const calculatePricing = async () => {
      if (items.length === 0) {
        setPricing(null);
        return;
      }

      setIsLoadingPricing(true);
      try {
        // Prepare items for pricing calculation
        const orderItems = items.map(item => {
          const product = typeof item.product === 'object' ? item.product : 
                          (typeof item.productId === 'object' ? item.productId : null);
          const price = item.price || product?.price || 0;
          
          return {
            productId: typeof item.productId === 'string' ? item.productId : 
                      (item.productId?._id ? String(item.productId._id) : 
                      (product?._id ? String(product._id) : '')),
            quantity: item.quantity || 1,
            price: Number(price),
            categoryId: product?.categoryId ? String(product.categoryId) : undefined,
          };
        }).filter(item => item.productId); // Filter out invalid items

        if (orderItems.length === 0) {
          setPricing(null);
          return;
        }

        const response = await promotionsApi.applyToCart({ items: orderItems });
        if (response.success && response.data) {
          setPricing({
            subtotal: response.data.subtotal,
            discountAmount: response.data.discountAmount,
            finalTotal: response.data.finalTotal,
            appliedRules: response.data.appliedRules || [],
          });
        } else {
          // Fallback to original subtotal if API fails
          setPricing(null);
        }
      } catch (error: any) {
        logger.error('Error calculating pricing:', error);
        // Fallback to original subtotal if API fails
        setPricing(null);
      } finally {
        setIsLoadingPricing(false);
      }
    };

    calculatePricing();
  }, [items]);

  // Convert saved Address to LegacyAddress format
  const convertAddressToLegacy = (address: Address): LegacyAddress => {
    return {
      _id: address._id,
      fullName: address.receiverName,
      phone: address.receiverPhone,
      address: address.address,
      ward: address.wardName || address.ward,
      district: address.districtName || address.district,
      province: address.provinceName || address.province,
      isDefault: address.isDefault,
    };
  };

  // Handle address selection
  const handleSelectAddress = (address: Address) => {
    const legacyAddress = convertAddressToLegacy(address);
    setShippingAddress(legacyAddress);
    setSelectedAddressId(address._id || null);
    setShowAddressPicker(false);
    setAddressErrors({});
  };

  // Load default address on mount
  useEffect(() => {
    if (savedAddresses.length > 0 && !selectedAddressId) {
      const defaultAddress = savedAddresses.find(addr => addr.isDefault) || savedAddresses[0];
      if (defaultAddress) {
        handleSelectAddress(defaultAddress);
      }
    }
  }, [savedAddresses]);

  const validateAddress = (): boolean => {
    const errors: Partial<Record<keyof LegacyAddress, string>> = {};
    
    if (!shippingAddress.fullName.trim()) {
      errors.fullName = 'Vui lòng nhập họ và tên';
    }
    if (!shippingAddress.phone.trim()) {
      errors.phone = 'Vui lòng nhập số điện thoại';
    } else if (!/^[0-9]{10,11}$/.test(shippingAddress.phone)) {
      errors.phone = 'Số điện thoại không hợp lệ';
    }
    if (!shippingAddress.province.trim()) {
      errors.province = 'Vui lòng chọn tỉnh/thành phố';
    }
    if (!shippingAddress.district.trim()) {
      errors.district = 'Vui lòng chọn quận/huyện';
    }
    if (!shippingAddress.ward.trim()) {
      errors.ward = 'Vui lòng chọn phường/xã';
    }
    if (!shippingAddress.address.trim()) {
      errors.address = 'Vui lòng nhập địa chỉ chi tiết';
    }

    setAddressErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCheckout = async () => {
    if (!validateAddress()) {
      Toast.show({
        type: 'error',
        text1: 'Lỗi',
        text2: 'Vui lòng điền đầy đủ thông tin địa chỉ',
      });
      return;
    }

    if (items.length === 0) {
      Toast.show({
        type: 'error',
        text1: 'Lỗi',
        text2: 'Giỏ hàng trống',
      });
      return;
    }

    setIsProcessing(true);

    try {
      // Prepare order data
      const orderItems = items.map(item => {
        // Backend returns productId (populated) instead of product
        const product = typeof item.product === 'object' ? item.product : 
                        (typeof item.productId === 'object' ? item.productId : null);
        
        // Get productId as string
        let productId: string;
        if (product?._id) {
          productId = String(product._id);
        } else if (product?.id) {
          productId = String(product.id);
        } else if (typeof item.productId === 'string') {
          productId = item.productId;
        } else if (item.productId?._id) {
          productId = String(item.productId._id);
        } else if (item.product) {
          productId = String(item.product);
        } else {
          throw new Error(`Không tìm thấy productId cho sản phẩm: ${item._id}`);
        }
        
        // Get price from item or product
        const price = item.price || product?.price || 0;
        
        if (!productId) {
          throw new Error(`ProductId không hợp lệ cho sản phẩm: ${item._id}`);
        }
        
        return {
          productId: String(productId), // Ensure it's a string
          quantity: item.quantity || 1,
          price: Number(price), // Ensure it's a number
        };
      });

      const fullAddress = `${shippingAddress.address}, ${shippingAddress.ward}, ${shippingAddress.district}, ${shippingAddress.province}`;

      const orderData = {
        items: orderItems,
        shippingAddress: fullAddress,
        shippingPhone: shippingAddress.phone,
        paymentMethod,
        notes: `Người nhận: ${shippingAddress.fullName}`,
        couponCode: appliedCoupon?.code || undefined, // Ensure it's undefined if null
        // Note: discountAmount is calculated by backend from couponCode
        // Backend will calculate discount from coupon code automatically
      };

      logger.log('=== CheckoutScreen: Creating order ===', {
        hasAppliedCoupon: !!appliedCoupon,
        couponCode: appliedCoupon?.code,
        couponCodeInOrderData: orderData.couponCode,
        discountAmount,
        finalTotal,
        itemsCount: orderItems.length,
      });

      // Create order with retry logic for network/server errors
      const orderResponse = await retryWithBackoffAndFeedback(
        async () => {
          const response = await ordersApi.createOrder(orderData);
          if (!response.success) {
            const errorMessage = response.message || 'Không thể tạo đơn hàng';
            throw new Error(errorMessage);
          }
          return response;
        },
        (attempt, maxRetries) => {
          Toast.show({
            type: 'info',
            text1: 'Đang thử lại...',
            text2: `Lần thử ${attempt}/${maxRetries}`,
            visibilityTime: 2000,
          });
        },
        3, // max 3 retries
        1000 // base delay 1s
      );

      if (!orderResponse.success) {
        const errorMessage = orderResponse.message || 'Không thể tạo đơn hàng';
        throw new Error(errorMessage);
      }

      const order = orderResponse.data;

      // Debug: Log order data and payment amount calculation
      logger.log('=== CheckoutScreen: Order created ===', {
        orderId: order._id,
        orderNumber: order.orderNumber,
        orderTotalAmount: order.totalAmount,
        frontendFinalTotal: finalTotal,
        discountAmount: order.discountAmount,
        shippingFee: order.shippingFee,
        couponCode: order.couponCode,
        paymentMethod,
      });

      // Handle payment based on method
      // Note: Cart will be cleared only after payment is confirmed (for MoMo/VNPay) or immediately (for cash)
      if (paymentMethod === 'momo') {
        // Always use order.totalAmount from backend (it's the source of truth)
        // Backend calculates totalAmount = finalAmount + shippingFee (after all discounts)
        const paymentAmount = order.totalAmount;
        
        if (!paymentAmount || paymentAmount <= 0) {
          throw new Error('Số tiền thanh toán không hợp lệ');
        }

        logger.log('=== CheckoutScreen: Creating MoMo payment ===', {
          orderId: order._id,
          paymentAmount,
          orderTotalAmount: order.totalAmount,
        });
        
        // Create MoMo payment
        try {
          const paymentResponse = await paymentApi.createMomoPayment({
            orderId: order._id,
            amount: paymentAmount,
            orderInfo: `Thanh toán đơn hàng ${order.orderNumber}`,
          });

          if (!paymentResponse.success) {
            throw new Error(paymentResponse.message || 'Không thể tạo yêu cầu thanh toán MoMo');
          }

          if (!paymentResponse.data?.payUrl && !paymentResponse.data?.deeplink) {
            throw new Error('MoMo không trả về URL thanh toán');
          }

          // Open MoMo payment - try UAT app first, then fallback to web
          const payUrl = paymentResponse.data.payUrl || '';
          const deeplink = paymentResponse.data.deeplink;
          
          logger.log('=== CheckoutScreen: Opening MoMo payment ===', {
            payUrl,
            deeplink,
            hasPayUrl: !!payUrl,
            hasDeeplink: !!deeplink,
          });
          
          const opened = await openMomoPayment(payUrl, deeplink);
          
          if (!opened) {
            // If deeplink is available but couldn't open, it might be app not installed
            if (deeplink) {
              throw new Error('Không thể mở ứng dụng MoMo. Vui lòng cài đặt ứng dụng MoMo UAT để thanh toán.');
            } else {
              throw new Error('Không thể mở trang thanh toán MoMo. Vui lòng kiểm tra ứng dụng MoMo UAT đã được cài đặt chưa.');
            }
          }
          
          Toast.show({
            type: 'success',
            text1: 'Đặt hàng thành công',
            text2: `Mã đơn hàng: ${order.orderNumber}. Vui lòng hoàn tất thanh toán trong ứng dụng MoMo`,
          });

          // Don't clear cart yet - wait for payment confirmation
          // Cart will be cleared when payment status is confirmed in OrderDetailScreen

          // Navigate to order detail after a delay
          setTimeout(() => {
            (navigation as any).navigate('Orders', {
              screen: 'OrderDetail',
              params: { orderId: order._id },
            });
          }, 2000);
        } catch (paymentError: any) {
          // If MoMo payment creation fails, show error
          // Cart is already cleared, but order is created
          const paymentErrorMessage = paymentError.response?.data?.message || 
                                     paymentError.message || 
                                     'Không thể tạo yêu cầu thanh toán MoMo';
          
          Toast.show({
            type: 'error',
            text1: 'Lỗi thanh toán MoMo',
            text2: paymentErrorMessage,
          });
          
          // Navigate to order detail anyway since order is created
          (navigation as any).navigate('Orders', {
            screen: 'OrderDetail',
            params: { orderId: order._id },
          });
          
          throw paymentError;
        }
      } else if (paymentMethod === 'vnpay') {
        const paymentAmount = order.totalAmount;
        if (!paymentAmount || paymentAmount <= 0) {
          throw new Error('Số tiền thanh toán không hợp lệ');
        }

        logger.log('=== CheckoutScreen: Creating VNPay payment ===', {
          orderId: order._id,
          paymentAmount,
          orderTotalAmount: order.totalAmount,
        });

        try {
          const paymentResponse = await paymentApi.createVnpayPayment({
            orderId: order._id,
            amount: paymentAmount,
            orderInfo: `Thanh toán đơn hàng ${order.orderNumber}`,
            returnUrl: 'pharmacyapp://payment-success',
          });

          if (!paymentResponse.success || !paymentResponse.data?.payUrl) {
            throw new Error(paymentResponse.message || 'Không thể tạo yêu cầu thanh toán VNPay');
          }

          const payUrl = paymentResponse.data.payUrl;
          const opened = await Linking.openURL(payUrl);

          if (!opened) {
            throw new Error('Không thể mở trang thanh toán VNPay');
          }

          Toast.show({
            type: 'success',
            text1: 'Đặt hàng thành công',
            text2: `Mã đơn hàng: ${order.orderNumber}. Vui lòng hoàn tất thanh toán VNPay.`,
          });

          // Điều hướng tới chi tiết đơn để theo dõi trạng thái
          setTimeout(() => {
            (navigation as any).navigate('Orders', {
              screen: 'OrderDetail',
              params: { orderId: order._id },
            });
          }, 2000);
        } catch (paymentError: any) {
          const paymentErrorMessage = paymentError.response?.data?.message ||
                                     paymentError.message ||
                                     'Không thể tạo yêu cầu thanh toán VNPay';

          Toast.show({
            type: 'error',
            text1: 'Lỗi thanh toán VNPay',
            text2: paymentErrorMessage,
          });

          (navigation as any).navigate('Orders', {
            screen: 'OrderDetail',
            params: { orderId: order._id },
          });

          throw paymentError;
        }
      } else {
        // Cash payment - order created successfully
        // For cash payment, clear cart immediately since admin will confirm payment manually
        clearCart();
        
        Toast.show({
          type: 'success',
          text1: 'Đặt hàng thành công',
          text2: `Mã đơn hàng: ${order.orderNumber}`,
          visibilityTime: 3000,
        });
        
        // Navigate to order detail (stay on order detail screen)
        setTimeout(() => {
          (navigation as any).navigate('Orders', {
            screen: 'OrderDetail',
            params: { orderId: order._id },
          });
        }, 1500);
      }
    } catch (error: any) {
      // Extract detailed error message
      let errorMessage = 'Không thể đặt hàng. Vui lòng thử lại.';
      
      if (error.response?.data) {
        const errorData = error.response.data;
        if (errorData.message) {
          errorMessage = errorData.message;
        } else if (errorData.errors && Array.isArray(errorData.errors) && errorData.errors.length > 0) {
          errorMessage = errorData.errors[0].msg || errorData.errors[0].message || errorMessage;
        }
      } else if (error.message) {
        errorMessage = error.message;
      }

      Toast.show({
        type: 'error',
        text1: 'Lỗi đặt hàng',
        text2: errorMessage,
        visibilityTime: 5000,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <View style={styles.header}>
          <Text style={styles.title}>Thanh toán</Text>
        </View>

        {/* Address Form */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Thông tin giao hàng</Text>
            {savedAddresses.length > 0 && (
              <TouchableOpacity
                style={styles.selectAddressButton}
                onPress={() => setShowAddressPicker(true)}
              >
                <Ionicons name="location" size={18} color={COLORS.primary} />
                <Text style={styles.selectAddressText}>Chọn địa chỉ đã lưu</Text>
              </TouchableOpacity>
            )}
          </View>
          {selectedAddressId && (
            <View style={styles.selectedAddressBadge}>
              <Ionicons name="checkmark-circle" size={16} color={COLORS.success} />
              <Text style={styles.selectedAddressText}>Đang sử dụng địa chỉ đã lưu</Text>
              <TouchableOpacity
                onPress={() => {
                  setSelectedAddressId(null);
                  setShippingAddress({
                    fullName: user?.firstName && user?.lastName 
                      ? `${user.firstName} ${user.lastName}` 
                      : '',
                    phone: user?.phone || '',
                    address: '',
                    ward: '',
                    district: '',
                    province: '',
                  });
                }}
              >
                <Text style={styles.changeAddressText}>Thay đổi</Text>
              </TouchableOpacity>
            </View>
          )}
          <AddressForm
            address={shippingAddress}
            onChange={(newAddress) => {
              setShippingAddress(newAddress);
              // Clear selected address ID if user manually edits
              if (selectedAddressId) {
                setSelectedAddressId(null);
              }
            }}
            errors={addressErrors}
            disabled={!!selectedAddressId}
          />
        </View>

        {/* Address Picker Modal */}
        <Modal
          visible={showAddressPicker}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setShowAddressPicker(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={[styles.modalHeader, { paddingTop: Math.max(insets.top, 16) }]}>
                <Text style={styles.modalTitle}>Chọn địa chỉ</Text>
                <TouchableOpacity
                  onPress={() => setShowAddressPicker(false)}
                  style={styles.modalCloseButton}
                >
                  <Ionicons name="close" size={24} color={COLORS.text} />
                </TouchableOpacity>
              </View>
              <FlatList
                data={savedAddresses}
                keyExtractor={(item) => item._id || Math.random().toString()}
                renderItem={({ item }) => {
                  const formatAddress = () => {
                    const parts = [
                      item.address,
                      item.wardName || item.ward,
                      item.districtName || item.district,
                      item.provinceName || item.province,
                    ].filter(Boolean);
                    return parts.join(', ');
                  };

                  return (
                    <TouchableOpacity
                      style={[
                        styles.addressOption,
                        selectedAddressId === item._id && styles.addressOptionSelected,
                      ]}
                      onPress={() => handleSelectAddress(item)}
                    >
                      <View style={styles.addressOptionContent}>
                        <View style={styles.addressOptionHeader}>
                          <Text style={styles.addressOptionName}>{item.receiverName}</Text>
                          {item.isDefault && (
                            <View style={styles.defaultBadge}>
                              <Text style={styles.defaultBadgeText}>Mặc định</Text>
                            </View>
                          )}
                        </View>
                        {item.receiverPhone && (
                          <Text style={styles.addressOptionPhone}>{item.receiverPhone}</Text>
                        )}
                        {(() => {
                          const addressText = formatAddress();
                          return addressText ? (
                            <Text style={styles.addressOptionAddress}>{addressText}</Text>
                          ) : null;
                        })()}
                        {item.addressType && (
                          <Text style={styles.addressOptionType}>
                            {item.addressType === 'home' ? '🏠 Nhà riêng' : '🏢 Công ty'}
                          </Text>
                        )}
                      </View>
                      {selectedAddressId === item._id && (
                        <Ionicons name="checkmark-circle" size={24} color={COLORS.primary} />
                      )}
                    </TouchableOpacity>
                  );
                }}
                ListEmptyComponent={
                  <View style={styles.emptyAddressList}>
                    <Text style={styles.emptyAddressText}>Chưa có địa chỉ nào</Text>
                    <TouchableOpacity
                      style={styles.addAddressButton}
                      onPress={() => {
                        setShowAddressPicker(false);
                        (navigation as any).navigate('AddressList');
                      }}
                    >
                      <Text style={styles.addAddressButtonText}>Thêm địa chỉ</Text>
                    </TouchableOpacity>
                  </View>
                }
              />
            </View>
          </View>
        </Modal>

        {/* Payment Method */}
        <PaymentMethodSelector
          selectedMethod={paymentMethod}
          onSelect={setPaymentMethod}
        />

        {/* Coupon */}
        <CouponSelector
          appliedCoupon={appliedCoupon}
          onCouponApplied={(coupon, discount) => {
            logger.log('=== CheckoutScreen: onCouponApplied callback ===', {
              coupon,
              discount,
            });
            setAppliedCoupon(coupon);
            setDiscountAmount(discount);
            logger.log('=== CheckoutScreen: State updated ===', {
              appliedCoupon: coupon,
              discountAmount: discount,
            });
          }}
          onCouponRemoved={() => {
            setAppliedCoupon(null);
            setDiscountAmount(0);
          }}
          subtotal={effectiveSubtotal}
        />

        {/* Order Summary */}
        <View style={styles.summary}>
          <Text style={styles.summaryTitle}>Tóm tắt đơn hàng</Text>
          
          {isLoadingPricing ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={COLORS.primary} />
              <Text style={styles.loadingText}>Đang tính toán khuyến mãi...</Text>
            </View>
          ) : (
            <>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Tạm tính:</Text>
                <Text style={styles.summaryValue}>
                  {originalSubtotal.toLocaleString('vi-VN')} ₫
                </Text>
              </View>

              {automaticDiscount > 0 && (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Khuyến mãi tự động:</Text>
                  <Text style={[styles.summaryValue, styles.discount]}>
                    -{automaticDiscount.toLocaleString('vi-VN')} ₫
                  </Text>
                </View>
              )}

              {automaticDiscount > 0 && (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Sau khuyến mãi tự động:</Text>
                  <Text style={styles.summaryValue}>
                    {effectiveSubtotal.toLocaleString('vi-VN')} ₫
                  </Text>
                </View>
              )}

              {discountAmount > 0 && appliedCoupon && (
                <>
                  <View style={styles.summaryRow}>
                    <View style={styles.couponLabelContainer}>
                      <Text style={styles.summaryLabel}>Mã giảm giá:</Text>
                      <Text style={styles.couponCode}>{appliedCoupon.code}</Text>
                    </View>
                    <Text style={[styles.summaryValue, styles.discount]}>
                      -{discountAmount.toLocaleString('vi-VN')} ₫
                    </Text>
                  </View>
                  {appliedCoupon.promotionName && (
                    <View style={styles.couponDetail}>
                      <Text style={styles.couponDetailText}>
                        {appliedCoupon.promotionName}
                      </Text>
                    </View>
                  )}
                  {appliedCoupon.discountPercent && (
                    <View style={styles.couponDetail}>
                      <Text style={styles.couponDetailText}>
                        Giảm {appliedCoupon.discountPercent}% trên đơn hàng
                      </Text>
                    </View>
                  )}
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Sau mã giảm giá:</Text>
                    <Text style={styles.summaryValue}>
                      {finalAmountAfterDiscounts.toLocaleString('vi-VN')} ₫
                    </Text>
                  </View>
                </>
              )}
            </>
          )}

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Phí vận chuyển:</Text>
            <Text style={styles.summaryValue}>
              {shippingFee === 0 ? 'Miễn phí' : `${shippingFee.toLocaleString('vi-VN')} ₫`}
            </Text>
          </View>

          <View style={[styles.summaryRow, styles.totalRow]}>
            <Text style={styles.totalLabel}>Tổng cộng:</Text>
            <Text style={styles.totalValue}>
              {finalTotal.toLocaleString('vi-VN')} ₫
            </Text>
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.footerSummary}>
          <Text style={styles.footerLabel}>Tổng tiền:</Text>
          <Text style={styles.footerTotal}>
            {finalTotal.toLocaleString('vi-VN')} ₫
          </Text>
        </View>
        <Button
          title={isProcessing ? 'Đang xử lý...' : 'Đặt hàng'}
          onPress={handleCheckout}
          loading={isProcessing}
          disabled={isProcessing}
          style={styles.checkoutButton}
        />
      </View>
    </View>
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
  header: {
    backgroundColor: '#fff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  section: {
    backgroundColor: '#fff',
    padding: 16,
    marginTop: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  selectAddressButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  selectAddressText: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '600',
  },
  selectedAddressBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.success + '20',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  selectedAddressText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.success,
    fontWeight: '600',
  },
  changeAddressText: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '600',
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
    paddingBottom: 32,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  modalCloseButton: {
    padding: 4,
  },
  addressOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  addressOptionSelected: {
    backgroundColor: COLORS.primary + '10',
  },
  addressOptionContent: {
    flex: 1,
  },
  addressOptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  addressOptionName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  defaultBadge: {
    backgroundColor: COLORS.primary + '20',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  defaultBadgeText: {
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: '600',
  },
  addressOptionPhone: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  addressOptionAddress: {
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 20,
    marginBottom: 4,
  },
  addressOptionType: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  emptyAddressList: {
    padding: 32,
    alignItems: 'center',
  },
  emptyAddressText: {
    fontSize: 16,
    color: COLORS.textSecondary,
    marginBottom: 16,
  },
  addAddressButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  addAddressButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  summary: {
    backgroundColor: '#fff',
    padding: 16,
    marginTop: 12,
    marginBottom: 100,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
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
  discount: {
    color: COLORS.success,
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
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  loadingText: {
    marginLeft: 8,
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  couponLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  couponCode: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: 'bold',
    backgroundColor: COLORS.background,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  couponDetail: {
    marginTop: -4,
    marginBottom: 4,
    paddingLeft: 0,
  },
  couponDetailText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
  },
});

