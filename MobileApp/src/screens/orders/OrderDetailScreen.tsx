import React, { useState, useLayoutEffect, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, AppState, AppStateStatus } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ordersApi } from '../../api/orders';
import { COLORS } from '../../utils/constants';
import { Loading } from '../../components/common/Loading';
import { Button } from '../../components/common/Button';
import Toast from 'react-native-toast-message';
import { useNavigation } from '@react-navigation/native';
import { useCart } from '../../contexts/CartContext';
import { paymentApi } from '../../api/payment';
import { openMomoPayment } from '../../utils/momoHelper';
import { Ionicons } from '@expo/vector-icons';
import { parseError, AppError } from '../../utils/errorHandler';
import { logger } from '../../utils/logger';

export default function OrderDetailScreen({ route, navigation }: any) {
  const { orderId } = route.params;
  const queryClient = useQueryClient();
  const { addToCart, clearCart, refreshCart } = useCart();
  
  // Track when order was created for smart polling
  const orderCreatedAtRef = useRef<Date | null>(null);
  const [pollingElapsedTime, setPollingElapsedTime] = useState(0);
  
  // Track if notifications have been shown to prevent duplicate displays
  const paymentSuccessShownRef = useRef<string | null>(null); // Track by orderNumber
  const timeoutWarningShownRef = useRef<boolean>(false);
  
  // Reset notification flags when orderId changes
  useEffect(() => {
    paymentSuccessShownRef.current = null;
    timeoutWarningShownRef.current = false;
  }, [orderId]);

  // Set header with back button
  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      title: 'Chi tiết đơn hàng',
      headerStyle: {
        backgroundColor: COLORS.primary,
      },
      headerTintColor: '#fff',
      headerTitleStyle: {
        fontWeight: 'bold',
      },
      headerLeft: () => {
        const handleGoBack = () => {
          // Always navigate back to OrderList screen explicitly
          // This ensures we go back to OrderList instead of Home
          (navigation as any).navigate('Orders', {
            screen: 'OrderList',
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

  const { data, isLoading, error: queryError, isFetching } = useQuery({
    queryKey: ['order', orderId],
    queryFn: async () => {
      try {
        const result = await ordersApi.getOrderById(orderId);
        // Track order creation time for smart polling
        if (result?.data?.createdAt && !orderCreatedAtRef.current) {
          orderCreatedAtRef.current = new Date(result.data.createdAt);
        }
        return result;
      } catch (err: any) {
        const appError = parseError(err);
        logger.error('OrderDetailScreen - Error fetching order:', appError);
        throw err;
      }
    },
    refetchInterval: (query) => {
      // Smart polling: Adaptive intervals based on elapsed time
      const order = query.state.data?.data;
      if (order?.paymentMethod === 'momo' && order?.paymentStatus === 'pending') {
        if (!orderCreatedAtRef.current) {
          return 5000; // Default: 5 seconds
        }
        
        const elapsed = Date.now() - orderCreatedAtRef.current.getTime();
        const elapsedMinutes = elapsed / 60000;
        
        // Poll every 5s for first 2 minutes (fast polling)
        if (elapsedMinutes < 2) {
          return 5000;
        }
        // Poll every 30s for next 8 minutes (moderate polling)
        if (elapsedMinutes < 10) {
          return 30000;
        }
        // Stop polling after 10 minutes (timeout)
        return false;
      }
      return false;
    },
    retry: (failureCount, error: any) => {
      const appError = parseError(error);
      // Retry only for network errors or server errors
      return failureCount < 2 && (appError.isNetworkError || appError.statusCode >= 500);
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
  
  // Track polling elapsed time for UI display
  useEffect(() => {
    const order = data?.data;
    if (!order || order.paymentMethod !== 'momo' || order.paymentStatus !== 'pending') {
      return;
    }
    
    if (!orderCreatedAtRef.current && order.createdAt) {
      orderCreatedAtRef.current = new Date(order.createdAt);
    }
    
    if (!orderCreatedAtRef.current) return;
    
    const interval = setInterval(() => {
      const elapsed = Date.now() - orderCreatedAtRef.current!.getTime();
      setPollingElapsedTime(elapsed);
    }, 1000);
    
    return () => clearInterval(interval);
  }, [data?.data?.paymentStatus, data?.data?.paymentMethod, data?.data?.createdAt]);

  // Clear cart when payment is confirmed (stay on order detail screen)
  useEffect(() => {
    const order = data?.data;
    if (order?.paymentStatus === 'paid' && order?.orderNumber) {
      // Only show notification once per order number
      if (paymentSuccessShownRef.current !== order.orderNumber) {
        paymentSuccessShownRef.current = order.orderNumber;
        // Clear cart for both momo and cash payments
        clearCart();
        Toast.show({
          type: 'success',
          text1: '✅ Thanh toán thành công',
          text2: `Đơn hàng ${order.orderNumber} đã được thanh toán thành công. Đơn hàng sẽ được xử lý và giao trong thời gian sớm nhất.`,
          visibilityTime: 4000,
        });
      }
      // Stay on order detail screen - don't navigate away
    }
  }, [data?.data?.paymentStatus, data?.data?.orderNumber, clearCart]);

  // Refresh payment status when app comes to foreground (returning from MoMo app)
  useEffect(() => {
    const order = data?.data;
    if (!order || order.paymentMethod !== 'momo' || order.paymentStatus !== 'pending') {
      return;
    }

    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        // App came to foreground - immediately refresh payment status
        logger.log('OrderDetailScreen: App came to foreground, refreshing payment status');
        queryClient.invalidateQueries({ queryKey: ['order', orderId] });
      }
    });

    return () => {
      subscription.remove();
    };
  }, [data?.data?.paymentMethod, data?.data?.paymentStatus, orderId, queryClient]);
  
  // Show timeout warning after 10 minutes
  useEffect(() => {
    const order = data?.data;
    if (order?.paymentMethod === 'momo' && order?.paymentStatus === 'pending') {
      const elapsedMinutes = pollingElapsedTime / 60000;
      if (elapsedMinutes >= 10 && elapsedMinutes < 10.5 && !timeoutWarningShownRef.current) {
        // Show warning only once
        timeoutWarningShownRef.current = true;
        Toast.show({
          type: 'info',
          text1: '⏳ Thanh toán đang chờ xử lý',
          text2: 'Đơn hàng đang chờ thanh toán. Vui lòng hoàn tất thanh toán trong ứng dụng MoMo hoặc thử lại sau vài phút.',
          visibilityTime: 6000,
        });
      }
      // Reset flag if payment status changes or order changes
      if (order?.paymentStatus !== 'pending') {
        timeoutWarningShownRef.current = false;
      }
    } else {
      // Reset flag when not in pending state
      timeoutWarningShownRef.current = false;
    }
  }, [pollingElapsedTime, data?.data?.paymentStatus, data?.data?.paymentMethod]);

  const cancelOrderMutation = useMutation({
    mutationFn: () => ordersApi.updateOrderStatus(orderId, 'cancelled'),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['order', orderId] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['orderStats'] });
      
      const orderNumber = order?.orderNumber || '';
      Toast.show({
        type: 'success',
        text1: '✅ Đã hủy đơn hàng thành công',
        text2: orderNumber ? `Đơn hàng ${orderNumber} đã được hủy. Bạn có thể đặt lại đơn hàng sau.` : 'Đơn hàng đã được hủy thành công.',
        visibilityTime: 4000,
      });
    },
    onError: (error: any) => {
      const appError = parseError(error);
      let errorMessage = appError.message || 'Không thể hủy đơn hàng';
      let suggestions = '';
      
      // Cải thiện thông báo lỗi dựa trên status code
      if (appError.statusCode === 403) {
        const currentStatus = order?.status;
        if (currentStatus === 'processing' || currentStatus === 'shipped') {
          errorMessage = 'Không thể hủy đơn hàng đang được xử lý';
          suggestions = '\n\nĐơn hàng đã được xử lý hoặc đang giao. Vui lòng liên hệ bộ phận chăm sóc khách hàng nếu cần hỗ trợ.';
        } else if (currentStatus === 'delivered') {
          errorMessage = 'Không thể hủy đơn hàng đã giao';
          suggestions = '\n\nĐơn hàng đã được giao thành công. Nếu có vấn đề, vui lòng liên hệ bộ phận chăm sóc khách hàng.';
        } else if (currentStatus === 'cancelled') {
          errorMessage = 'Đơn hàng đã được hủy trước đó';
          suggestions = '\n\nĐơn hàng này đã ở trạng thái hủy.';
        } else {
          suggestions = '\n\nChỉ có thể hủy đơn hàng đang chờ xử lý hoặc đã xác nhận.';
        }
      } else if (appError.statusCode === 404) {
        errorMessage = 'Không tìm thấy đơn hàng';
        suggestions = '\n\nVui lòng kiểm tra lại thông tin đơn hàng.';
      } else if (appError.isNetworkError) {
        errorMessage = 'Lỗi kết nối mạng';
        suggestions = '\n\nVui lòng kiểm tra kết nối internet và thử lại.';
      }
      
      Toast.show({
        type: 'error',
        text1: '❌ Không thể hủy đơn hàng',
        text2: errorMessage + suggestions,
        visibilityTime: 6000,
      });
    },
  });

  const reorderMutation = useMutation({
    mutationFn: () => ordersApi.reorderFromOrder(orderId),
    onSuccess: async (response) => {
      if (response.success) {
        // Backend đã thêm items vào cart, cần refresh cart từ CartContext
        const message = response.message || 'Đã thêm sản phẩm vào giỏ hàng';
        const skippedCount = response.data?.skippedItems?.length || 0;
        const addedCount = response.data?.addedItems?.length || 0;
        const summary = response.data?.summary;
        
        logger.log('Reorder success:', {
          addedCount,
          skippedCount,
          summary,
          addedItems: response.data?.addedItems,
          skippedItems: response.data?.skippedItems
        });
        
        // Refresh cart from CartContext (not React Query)
        await refreshCart();
        
        // Show detailed notification based on result
        if (addedCount > 0 && skippedCount === 0) {
          // All items added successfully - simple toast
          Toast.show({
            type: 'success',
            text1: '✅ Đặt lại đơn hàng thành công',
            text2: `Đã thêm ${addedCount} sản phẩm vào giỏ hàng`,
            visibilityTime: 3000,
          });
        } else if (addedCount > 0 && skippedCount > 0) {
          // Some items added, some skipped - show detailed alert
          const skippedItems = response.data?.skippedItems || [];
          const outOfStockItems = skippedItems.filter((item: any) => item.reason === 'Product out of stock');
          const notFoundItems = skippedItems.filter((item: any) => item.reason?.includes('not found'));
          
          let alertMessage = `✅ Đã thêm ${addedCount} sản phẩm vào giỏ hàng.\n\n`;
          
          if (outOfStockItems.length > 0) {
            alertMessage += `⚠️ ${outOfStockItems.length} sản phẩm hết hàng:\n`;
            outOfStockItems.slice(0, 3).forEach((item: any) => {
              alertMessage += `• ${item.productName || 'Sản phẩm'}\n`;
            });
            if (outOfStockItems.length > 3) {
              alertMessage += `... và ${outOfStockItems.length - 3} sản phẩm khác\n`;
            }
          }
          
          if (notFoundItems.length > 0) {
            if (outOfStockItems.length > 0) alertMessage += '\n';
            alertMessage += `❌ ${notFoundItems.length} sản phẩm không tìm thấy trong hệ thống`;
          }
          
          Alert.alert(
            'Đặt lại đơn hàng',
            alertMessage,
            [
              {
                text: 'Xem giỏ hàng',
                onPress: () => {
                  setTimeout(() => {
                    (navigation as any).navigate('Cart', { screen: 'Cart' });
                  }, 500);
                },
                style: 'default'
              },
              { text: 'Đóng', style: 'cancel' }
            ]
          );
        } else if (addedCount === 0) {
          // No items added - show detailed alert with all reasons
          const skippedItems = response.data?.skippedItems || [];
          const outOfStockItems = skippedItems.filter((item: any) => item.reason === 'Product out of stock');
          const notFoundItems = skippedItems.filter((item: any) => item.reason?.includes('not found'));
          
          let alertMessage = '❌ Không thể thêm sản phẩm vào giỏ hàng.\n\n';
          
          if (outOfStockItems.length > 0) {
            alertMessage += `⚠️ ${outOfStockItems.length} sản phẩm hết hàng:\n`;
            outOfStockItems.slice(0, 5).forEach((item: any) => {
              alertMessage += `• ${item.productName || 'Sản phẩm'}\n`;
            });
            if (outOfStockItems.length > 5) {
              alertMessage += `... và ${outOfStockItems.length - 5} sản phẩm khác\n`;
            }
          }
          
          if (notFoundItems.length > 0) {
            if (outOfStockItems.length > 0) alertMessage += '\n';
            alertMessage += `❌ ${notFoundItems.length} sản phẩm không tìm thấy trong hệ thống`;
            if (notFoundItems.length <= 3) {
              notFoundItems.forEach((item: any) => {
                alertMessage += `\n• ${item.productName || 'Sản phẩm đã bị xóa'}`;
              });
            }
          }
          
          Alert.alert(
            'Không thể đặt lại đơn hàng',
            alertMessage,
            [{ text: 'Đóng', style: 'default' }]
          );
        } else {
          // Edge case: no items at all
          Toast.show({
            type: 'info',
            text1: 'Thông báo',
            text2: 'Không có sản phẩm nào để thêm vào giỏ hàng',
            visibilityTime: 3000,
          });
        }
        
        // Navigate to cart if items were added
        if (addedCount > 0) {
          setTimeout(() => {
            (navigation as any).navigate('Cart', {
              screen: 'Cart',
            });
          }, skippedCount > 0 ? 1500 : 800); // Delay longer if there are skipped items (user might read alert)
        }
      }
    },
    onError: (error: any) => {
      logger.error('Reorder error:', error);
      const appError = parseError(error);
      Toast.show({
        type: 'error',
        text1: '❌ Lỗi đặt lại đơn hàng',
        text2: appError.message || 'Không thể đặt lại đơn hàng. Vui lòng thử lại sau.',
        visibilityTime: 5000,
      });
    },
  });

  // Define retryPaymentMutation before conditional returns to follow Rules of Hooks
  const retryPaymentMutation = useMutation({
    mutationFn: async () => {
      // Get order from data (available at this point)
      const currentOrder = data?.data;
      if (!currentOrder) throw new Error('Order not found');
      
      const paymentResponse = await paymentApi.createMomoPayment({
        orderId: currentOrder._id,
        amount: currentOrder.totalAmount,
        orderInfo: `Thanh toán đơn hàng ${currentOrder.orderNumber}`,
      });

      if (!paymentResponse.success) {
        throw new Error(paymentResponse.message || 'Không thể tạo yêu cầu thanh toán MoMo');
      }

      if (!paymentResponse.data?.payUrl && !paymentResponse.data?.deeplink) {
        throw new Error('MoMo không trả về URL thanh toán');
      }

      const payUrl = paymentResponse.data.payUrl || '';
      const deeplink = paymentResponse.data.deeplink;
      
      const opened = await openMomoPayment(payUrl, deeplink);
      
      if (!opened) {
        throw new Error('Không thể mở trang thanh toán MoMo. Vui lòng kiểm tra ứng dụng MoMo UAT đã được cài đặt chưa.');
      }

      return paymentResponse;
    },
    onSuccess: () => {
      Toast.show({
        type: 'success',
        text1: '📱 Đã mở ứng dụng MoMo',
        text2: 'Vui lòng hoàn tất thanh toán trong ứng dụng MoMo. Sau khi thanh toán, quay lại ứng dụng để xem trạng thái đơn hàng.',
        visibilityTime: 5000,
      });
      // Invalidate order query to refetch payment status
      queryClient.invalidateQueries({ queryKey: ['order', orderId] });
    },
    onError: (error: any) => {
      const appError = parseError(error);
      
      // Provide specific error recovery suggestions
      let errorMessage = appError.message || 'Không thể thử lại thanh toán';
      let suggestions = '';
      
      if (appError.isNetworkError) {
        suggestions = '\n\nVui lòng kiểm tra kết nối mạng và thử lại.';
      } else if (appError.statusCode === 400) {
        suggestions = '\n\nVui lòng kiểm tra lại thông tin đơn hàng.';
      } else if (appError.statusCode >= 500) {
        suggestions = '\n\nLỗi máy chủ. Vui lòng thử lại sau vài phút.';
      }
      
      Toast.show({
        type: 'error',
        text1: '❌ Lỗi thanh toán MoMo',
        text2: errorMessage + suggestions,
        visibilityTime: 7000,
      });
    },
  });

  if (isLoading) {
    return <Loading />;
  }

  // Handle error state
  if (queryError) {
    const appError = parseError(queryError);
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={64} color={COLORS.error} />
          <Text style={styles.errorText}>{appError.message}</Text>
          <Text style={styles.errorSubtext}>
            {appError.isNetworkError 
              ? 'Vui lòng kiểm tra kết nối mạng và thử lại'
              : 'Vui lòng thử lại sau'}
          </Text>
          <Button
            title="Thử lại"
            onPress={() => queryClient.invalidateQueries({ queryKey: ['order', orderId] })}
            style={styles.retryButton}
          />
        </View>
      </View>
    );
  }

  const order = data?.data;

  if (!order) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="document-outline" size={64} color={COLORS.textSecondary} />
          <Text style={styles.errorText}>Không tìm thấy đơn hàng</Text>
          <Button
            title="Quay lại"
            onPress={() => (navigation as any).navigate('Orders', { screen: 'OrderList' })}
            style={styles.retryButton}
          />
        </View>
      </View>
    );
  }

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

  const canCancel = order?.status === 'pending' || order?.status === 'confirmed';
  // Allow reorder for: delivered, cancelled, or after successful payment (completed/paid)
  // Chỉ cho phép đặt lại đơn hàng khi đơn đã giao hoặc đã hủy
  const canReorder = order?.status === 'delivered' || order?.status === 'cancelled';
  const canRetryPayment = order?.paymentMethod === 'momo' && 
                          (order?.paymentStatus === 'pending' || order?.paymentStatus === 'failed');

  const handleCancelOrder = () => {
    const orderNumber = order?.orderNumber || '';
    const orderTotal = order?.totalAmount ? order.totalAmount.toLocaleString('vi-VN') + ' ₫' : '';
    
    Alert.alert(
      '⚠️ Xác nhận hủy đơn hàng',
      orderNumber 
        ? `Bạn có chắc chắn muốn hủy đơn hàng ${orderNumber}?\n\nTổng tiền: ${orderTotal}\n\nSau khi hủy, bạn có thể đặt lại đơn hàng này sau.`
        : 'Bạn có chắc chắn muốn hủy đơn hàng này?\n\nSau khi hủy, bạn có thể đặt lại đơn hàng này sau.',
      [
        { 
          text: 'Không, giữ nguyên', 
          style: 'cancel' 
        },
        {
          text: 'Có, hủy đơn hàng',
          style: 'destructive',
          onPress: () => cancelOrderMutation.mutate(),
        },
      ]
    );
  };

  const handleReorder = () => {
    reorderMutation.mutate();
  };

  const handleRetryPayment = () => {
    retryPaymentMutation.mutate();
  };

  return (
    <ScrollView 
      style={styles.container}
      key="order-detail-scroll"
    >
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Thông tin đơn hàng</Text>
        <View style={styles.infoRow}>
          <Text style={styles.label}>Mã đơn hàng:</Text>
          <Text style={styles.value}>{order.orderNumber}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.label}>Trạng thái:</Text>
          <Text style={styles.value}>{getStatusText(order.status)}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.label}>Ngày đặt:</Text>
          <Text style={styles.value}>
            {new Date(order.createdAt).toLocaleString('vi-VN')}
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Sản phẩm</Text>
        {order.items && Array.isArray(order.items) && order.items.length > 0 ? (
          order.items.map((item: any, index: number) => {
            const productId = typeof item.product === 'object' 
              ? item.product?._id || item.product?.id 
              : typeof item.product === 'string' 
              ? item.product 
              : null;
            
            return (
              <View key={`order-item-${productId || item._id || index}`} style={styles.item}>
                <Text style={styles.itemName}>
                  {typeof item.product === 'object' ? item.product.name : 'Sản phẩm'}
                </Text>
                <Text style={styles.itemQuantity}>Số lượng: {item.quantity}</Text>
                <Text style={styles.itemPrice}>
                  {item.price?.toLocaleString('vi-VN')} ₫
                </Text>
              </View>
            );
          })
        ) : (
          <Text style={styles.emptyText}>Không có sản phẩm</Text>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Địa chỉ giao hàng</Text>
        <Text style={styles.address}>{order.shippingAddress}</Text>
        <Text style={styles.phone}>SĐT: {order.shippingPhone}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Thanh toán</Text>
        <View style={styles.infoRow}>
          <Text style={styles.label}>Phương thức:</Text>
          <Text style={styles.value}>
            {order.paymentMethod === 'cash' ? 'Tiền mặt' : 'MoMo'}
          </Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.label}>Trạng thái thanh toán:</Text>
          <View style={styles.paymentStatusContainer}>
            {order.paymentMethod === 'momo' && order.paymentStatus === 'pending' && isFetching && (
              <ActivityIndicator size="small" color={COLORS.primary} style={styles.statusIndicator} />
            )}
            <Text style={[
              styles.value,
              order.paymentStatus === 'paid' && styles.paidStatus,
              order.paymentStatus === 'failed' && styles.failedStatus,
              order.paymentStatus === 'pending' && styles.pendingStatus,
            ]}>
              {order.paymentStatus === 'paid' ? 'Đã thanh toán' : 
               order.paymentStatus === 'failed' ? 'Thanh toán thất bại' :
               'Đang chờ thanh toán'}
            </Text>
          </View>
        </View>
        {order.paymentMethod === 'momo' && order.paymentStatus === 'pending' && (
          <View style={styles.pollingInfo}>
            <Text style={styles.pollingText}>
              {isFetching ? 'Đang kiểm tra trạng thái thanh toán...' : 'Đang theo dõi thanh toán'}
            </Text>
            {pollingElapsedTime > 0 && (
              <Text style={styles.pollingTime}>
                Đã chờ: {Math.floor(pollingElapsedTime / 60000)} phút
              </Text>
            )}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Tổng cộng:</Text>
          <Text style={styles.totalValue}>
            {order.totalAmount?.toLocaleString('vi-VN')} ₫
          </Text>
        </View>
      </View>

      {/* Action Buttons */}
      <View style={styles.actionsContainer}>
        {canRetryPayment && (
          <Button
            title="Thử lại thanh toán"
            onPress={handleRetryPayment}
            style={styles.actionButton}
            loading={retryPaymentMutation.isPending}
          />
        )}
        {canCancel && (
          <Button
            title="Hủy đơn hàng"
            onPress={handleCancelOrder}
            variant="outline"
            style={[styles.actionButton, styles.cancelButton]}
            loading={cancelOrderMutation.isPending}
          />
        )}
        {canReorder && (
          <Button
            title="Đặt lại đơn hàng"
            onPress={handleReorder}
            style={styles.actionButton}
            loading={reorderMutation.isPending}
          />
        )}
        {order?.orderNumber && (
          <TouchableOpacity
            style={styles.trackButton}
            onPress={() => {
              // Navigate to track order screen or show tracking info
              Alert.alert(
                'Theo dõi đơn hàng',
                `Mã đơn hàng: ${order.orderNumber}\n\nBạn có thể sử dụng mã này để theo dõi đơn hàng của mình.`,
                [{ text: 'Đóng' }]
              );
            }}
          >
            <Ionicons name="location-outline" size={20} color={COLORS.primary} />
            <Text style={styles.trackButtonText}>Theo dõi đơn hàng</Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  section: {
    backgroundColor: '#fff',
    padding: 16,
    marginTop: 12,
    marginHorizontal: 16,
    borderRadius: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  value: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '600',
  },
  item: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
  },
  itemQuantity: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  itemPrice: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '600',
  },
  address: {
    fontSize: 14,
    color: COLORS.text,
    marginBottom: 4,
  },
  phone: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
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
  errorText: {
    fontSize: 16,
    color: COLORS.error,
    textAlign: 'center',
    marginTop: 40,
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    paddingVertical: 16,
  },
  actionsContainer: {
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  actionButton: {
    marginBottom: 12,
  },
  cancelButton: {
    borderColor: COLORS.error,
  },
  trackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 8,
    backgroundColor: '#f0f7ff',
  },
  trackButtonText: {
    marginLeft: 8,
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.primary,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  errorSubtext: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 8,
    textAlign: 'center',
    marginBottom: 24,
  },
  retryButton: {
    marginTop: 16,
    minWidth: 120,
  },
  paymentStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIndicator: {
    marginRight: 8,
  },
  paidStatus: {
    color: COLORS.success,
  },
  failedStatus: {
    color: COLORS.error,
  },
  pendingStatus: {
    color: COLORS.warning,
  },
  pollingInfo: {
    marginTop: 12,
    padding: 12,
    backgroundColor: COLORS.background,
    borderRadius: 8,
  },
  pollingText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  pollingTime: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
  },
});

