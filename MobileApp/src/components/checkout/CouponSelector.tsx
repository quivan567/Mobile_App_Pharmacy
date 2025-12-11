import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { promotionsApi } from '../../api/promotions';
import { COLORS } from '../../utils/constants';
import Toast from 'react-native-toast-message';
import { useQuery } from '@tanstack/react-query';
import { savedPromotionsStorage } from '../../utils/storage';

interface CouponSelectorProps {
  appliedCoupon: any | null;
  onCouponApplied: (coupon: any, discountAmount: number) => void;
  onCouponRemoved: () => void;
  subtotal: number;
}

export const CouponSelector: React.FC<CouponSelectorProps> = ({
  appliedCoupon,
  onCouponApplied,
  onCouponRemoved,
  subtotal,
}) => {
  const [couponCode, setCouponCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [savedPromotionIds, setSavedPromotionIds] = useState<Set<string>>(new Set());
  const inputRef = useRef<TextInput>(null);
  const blurTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isSelectingItemRef = useRef(false);

  // Load saved promotions - reload when component mounts or when input is focused
  const loadSavedPromotions = React.useCallback(async () => {
    const saved = await savedPromotionsStorage.getSavedPromotions();
    setSavedPromotionIds(new Set(saved));
    if (__DEV__) {
      console.log('CouponSelector: Loaded saved promotions:', saved);
    }
  }, []);

  React.useEffect(() => {
    loadSavedPromotions();
  }, [loadSavedPromotions]);

  // Reload saved promotions when input is focused (in case they were saved while on checkout screen)
  React.useEffect(() => {
    if (inputFocused) {
      loadSavedPromotions();
    }
  }, [inputFocused, loadSavedPromotions]);

  // Get all promotions (not just active) to include saved ones that might be expired
  const { data: promotionsData } = useQuery({
    queryKey: ['promotions', 'all', 'with-codes'],
    queryFn: async () => {
      const response = await promotionsApi.getAllPromotions({ activeOnly: false });
      // Filter only promotions that have codes
      const promotionsWithCodes = (response.data || []).filter(
        (promo: any) => promo.code && promo.code.trim().length > 0
      );
      return { ...response, data: promotionsWithCodes };
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  const allPromotions = promotionsData?.data || [];
  
  // Store available promotions to prevent clearing when input loses focus
  const [cachedPromotions, setCachedPromotions] = React.useState<any[]>([]);
  
  // Calculate available promotions
  const calculatedPromotions = React.useMemo(() => {
    // First, get all saved promotions (including inactive ones)
    const now = new Date();
    const savedPromotions = allPromotions.filter((promo: any) => {
      return savedPromotionIds.has(promo._id);
    });
    
    if (__DEV__) {
      console.log('CouponSelector: savedPromotionIds:', Array.from(savedPromotionIds));
      console.log('CouponSelector: allPromotions count:', allPromotions.length);
      console.log('CouponSelector: savedPromotions count:', savedPromotions.length);
    }
    
    // If there are saved promotions, show them (even if inactive)
    if (savedPromotions.length > 0) {
      return savedPromotions;
    }
    
    // Otherwise, show all promotions with codes that are within date range
    // Don't filter by isActive flag here - let backend validate it
    // Frontend should show promotions that are within date range (realtime check)
    return allPromotions.filter((promo: any) => {
      const startDate = new Date(promo.startDate);
      const endDate = new Date(promo.endDate);
      endDate.setHours(23, 59, 59, 999);
      return startDate <= now && endDate >= now;
    });
  }, [savedPromotionIds, allPromotions]);
  
  // Cache promotions when input is focused
  React.useEffect(() => {
    if (inputFocused && calculatedPromotions.length > 0) {
      setCachedPromotions(calculatedPromotions);
    }
  }, [inputFocused, calculatedPromotions]);
  
  // When input is focused, use calculated promotions; otherwise use cached
  const availablePromotions = inputFocused ? calculatedPromotions : cachedPromotions;
  
  const hasSavedPromotions = React.useMemo(() => {
    // Check if there are any saved promotions (regardless of active status)
    return allPromotions.some((promo: any) => {
      return savedPromotionIds.has(promo._id);
    });
  }, [allPromotions, savedPromotionIds]);

  // Show suggestions when input is focused
  useEffect(() => {
    console.log('=== CouponSelector: inputFocused changed ===', {
      inputFocused,
      showSuggestions,
      availablePromotionsCount: availablePromotions.length,
      cachedPromotionsCount: cachedPromotions.length,
    });
    
    if (inputFocused) {
      // Always show suggestions when focused, even if empty (to show message)
      setShowSuggestions(true);
      console.log('=== CouponSelector: Setting showSuggestions to true ===');
    } else {
      // Delay hiding to allow clicks - increase delay to ensure onPress can complete
      const timer = setTimeout(() => {
        console.log('=== CouponSelector: Hiding suggestions ===');
        setShowSuggestions(false);
        // Clear cached promotions after hiding (to free memory)
        setTimeout(() => {
          setCachedPromotions([]);
        }, 1000);
      }, 500); // Increase delay to 500ms to allow onPress to complete
      return () => clearTimeout(timer);
    }
  }, [inputFocused, availablePromotions.length]);

  const handleApplyCoupon = async (code?: string) => {
    const codeToApply = (code || couponCode.trim()).toUpperCase();
    
    console.log('=== CouponSelector: handleApplyCoupon ===', {
      codeToApply,
      subtotal,
      code,
      couponCode,
    });
    
    if (!codeToApply) {
      Toast.show({
        type: 'error',
        text1: 'Lỗi',
        text2: 'Vui lòng nhập mã giảm giá',
      });
      return;
    }

    if (subtotal <= 0) {
      Toast.show({
        type: 'error',
        text1: 'Lỗi',
        text2: 'Giỏ hàng trống, không thể áp dụng mã giảm giá',
      });
      return;
    }

    setIsLoading(true);
    setShowSuggestions(false);
    try {
      console.log('=== CouponSelector: Calling validateCode API ===', {
        code: codeToApply,
        orderAmount: subtotal,
      });
      
      const response = await promotionsApi.validateCode(codeToApply, subtotal);
      
      console.log('=== CouponSelector: validateCode response ===', {
        success: response.success,
        data: response.data,
      });
      
      if (response.success && response.data) {
        // Create coupon object from promotion data
        const promotion = availablePromotions.find((p: any) => 
          p.code && p.code.toUpperCase() === codeToApply
        );
        const coupon = {
          code: response.data.code || codeToApply,
          discountAmount: response.data.discountAmount,
          discountPercent: response.data.discountPercent,
          promotionId: response.data.promotionId,
          promotionName: response.data.promotionName,
          promotion: promotion,
        };
        
        console.log('=== CouponSelector: Calling onCouponApplied ===', {
          coupon,
          discountAmount: response.data.discountAmount,
        });
        
        onCouponApplied(coupon, response.data.discountAmount);
        setCouponCode('');
        setInputFocused(false);
        Toast.show({
          type: 'success',
          text1: 'Thành công',
          text2: `Áp dụng mã giảm giá thành công. Giảm ${response.data.discountAmount.toLocaleString('vi-VN')} ₫`,
        });
      } else {
        console.log('=== CouponSelector: validateCode failed ===', response);
        Toast.show({
          type: 'error',
          text1: 'Lỗi',
          text2: 'Mã giảm giá không hợp lệ',
        });
      }
    } catch (error: any) {
      console.error('=== CouponSelector: validateCode error ===', error);
      const errorMessage = error.response?.data?.message || 'Không thể áp dụng mã giảm giá';
      Toast.show({
        type: 'error',
        text1: 'Lỗi',
        text2: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectPromotion = (promotion: any) => {
    console.log('=== CouponSelector: handleSelectPromotion ===', {
      code: promotion.code,
      promotion,
    });
    setCouponCode(promotion.code);
    handleApplyCoupon(promotion.code);
  };

  const getPromotionDiscountText = (promotion: any) => {
    if (promotion.discountPercent) {
      return `Giảm ${promotion.discountPercent}%`;
    }
    return 'Giảm giá';
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Mã giảm giá</Text>
      
      {appliedCoupon ? (
        <View style={styles.appliedCoupon}>
          <View style={styles.appliedCouponInfo}>
            <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
            <Text style={styles.appliedCouponText}>
              {appliedCoupon.code} - Giảm {appliedCoupon.discountAmount?.toLocaleString('vi-VN')} ₫
            </Text>
          </View>
          <TouchableOpacity onPress={onCouponRemoved}>
            <Ionicons name="close-circle" size={24} color={COLORS.error} />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.inputSection}>
          <View style={styles.inputContainer}>
            <View style={[
              styles.inputWrapper,
              showSuggestions && styles.inputWrapperFocused
            ]}>
              <Ionicons name="pricetag-outline" size={20} color={COLORS.textSecondary} style={styles.inputIcon} />
              <TextInput
                ref={inputRef}
                style={styles.input}
                placeholder="Nhập mã giảm giá"
                placeholderTextColor={COLORS.textSecondary}
                value={couponCode}
                onChangeText={setCouponCode}
                onFocus={() => {
                  // Clear any pending blur timeout
                  if (blurTimeoutRef.current) {
                    clearTimeout(blurTimeoutRef.current);
                    blurTimeoutRef.current = null;
                  }
                  setInputFocused(true);
                }}
                onBlur={() => {
                  // Clear any existing timeout
                  if (blurTimeoutRef.current) {
                    clearTimeout(blurTimeoutRef.current);
                  }
                  // Only close if not selecting an item
                  blurTimeoutRef.current = setTimeout(() => {
                    if (!isSelectingItemRef.current) {
                      setInputFocused(false);
                    }
                    blurTimeoutRef.current = null;
                  }, 500); // Increase delay to 500ms to allow touch events
                }}
                autoCapitalize="characters"
              />
              {showSuggestions && (
                <TouchableOpacity
                  onPress={() => setInputFocused(false)}
                  style={styles.closeButton}
                >
                  <Ionicons name="chevron-up" size={20} color={COLORS.textSecondary} />
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity
              style={[styles.applyButton, isLoading && styles.applyButtonDisabled]}
              onPress={() => handleApplyCoupon()}
              disabled={isLoading}
            >
              <Text style={styles.applyButtonText}>
                {isLoading ? 'Đang xử lý...' : 'Áp dụng'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Dropdown Suggestions */}
          {showSuggestions && (
            <View 
              style={styles.dropdownContainer}
              pointerEvents="box-none"
            >
                <View style={styles.dropdownHeader}>
                  <Ionicons 
                    name={hasSavedPromotions ? "bookmark" : "pricetag-outline"} 
                    size={16} 
                    color={hasSavedPromotions ? COLORS.primary : COLORS.textSecondary} 
                  />
                  <Text style={styles.dropdownTitle}>
                    {hasSavedPromotions
                      ? 'Khuyến mãi đã lưu'
                      : 'Mã giảm giá có sẵn'}
                  </Text>
                </View>
                {availablePromotions.length > 0 ? (
                  <View 
                    style={styles.dropdownList}
                    pointerEvents="auto"
                  >
                    {availablePromotions.map((item) => {
                    const discountText = getPromotionDiscountText(item);
                    const now = new Date();
                    // Check date range only (realtime validation)
                    // Backend will validate isActive flag, but frontend should check date range in realtime
                    const startDate = new Date(item.startDate);
                    const endDate = new Date(item.endDate);
                    // Set endDate to end of day (23:59:59) to include the full day
                    endDate.setHours(23, 59, 59, 999);
                    // Only check date range, not isActive flag (backend will validate isActive)
                    const isActiveByDate = startDate <= now && endDate >= now;
                    // Use subtotal (which is already effectiveSubtotal from CheckoutScreen) for minOrderValue check
                    // This matches backend logic which uses pricing.subtotal (after automatic promotions)
                    const meetsMinOrder = !item.minOrderValue || subtotal >= item.minOrderValue;
                    const isValid = isActiveByDate && meetsMinOrder;
                    
                    return (
                      <TouchableOpacity
                        key={item._id}
                        style={[
                          styles.dropdownItem,
                          !isValid && styles.dropdownItemDisabled
                        ]}
                        onPressIn={() => {
                          console.log('=== CouponSelector: onPressIn triggered ===', {
                            itemCode: item.code,
                          });
                          // Mark that we're selecting an item to prevent blur from closing dropdown
                          isSelectingItemRef.current = true;
                          // Clear any pending blur timeout
                          if (blurTimeoutRef.current) {
                            clearTimeout(blurTimeoutRef.current);
                            blurTimeoutRef.current = null;
                          }
                          // Blur input immediately to prevent onBlur from interfering
                          if (inputRef.current) {
                            inputRef.current.blur();
                          }
                        }}
                        onPress={() => {
                          console.log('=== CouponSelector: onPress triggered ===', {
                            itemCode: item.code,
                            isValid,
                            isActiveByDate,
                            meetsMinOrder,
                            subtotal,
                            minOrderValue: item.minOrderValue,
                          });
                          
                          if (isValid) {
                            console.log('=== CouponSelector: Calling handleSelectPromotion ===');
                            handleSelectPromotion(item);
                            // Reset flag and close dropdown
                            isSelectingItemRef.current = false;
                            setInputFocused(false);
                          } else {
                            console.log('=== CouponSelector: Item is not valid ===', {
                              isActiveByDate,
                              meetsMinOrder,
                            });
                            isSelectingItemRef.current = false;
                            
                            // Show error message if not valid
                            if (!isActiveByDate) {
                              Toast.show({
                                type: 'error',
                                text1: 'Lỗi',
                                text2: 'Mã giảm giá đã hết hạn',
                              });
                            } else if (!meetsMinOrder) {
                              Toast.show({
                                type: 'error',
                                text1: 'Lỗi',
                                text2: `Cần đơn từ ${item.minOrderValue?.toLocaleString('vi-VN')} ₫`,
                              });
                            }
                          }
                        }}
                        onPressOut={() => {
                          // Reset flag after a delay
                          setTimeout(() => {
                            isSelectingItemRef.current = false;
                          }, 100);
                        }}
                        // Don't disable - always allow press to show error messages
                        // disabled={!isValid}
                      >
                        <View style={styles.dropdownItemContent}>
                          <View style={styles.dropdownItemHeader}>
                            <View style={styles.dropdownCodeContainer}>
                              {savedPromotionIds.has(item._id) && (
                                <Ionicons name="bookmark" size={14} color={COLORS.primary} style={{ marginRight: 4 }} />
                              )}
                              <Text style={styles.dropdownCode}>{item.code}</Text>
                            </View>
                            <View style={styles.dropdownBadge}>
                              <Text style={styles.dropdownBadgeText}>{discountText}</Text>
                            </View>
                          </View>
                          {item.name && (
                            <Text style={styles.dropdownItemName} numberOfLines={1}>
                              {item.name}
                            </Text>
                          )}
                          {!isActiveByDate && (
                            <Text style={[styles.dropdownItemCondition, { color: COLORS.error }]}>
                              Khuyến mãi đã hết hạn
                            </Text>
                          )}
                          {isActiveByDate && item.minOrderValue && (
                            <Text style={styles.dropdownItemCondition}>
                              {meetsMinOrder ? (
                                `Đơn từ ${item.minOrderValue.toLocaleString('vi-VN')} ₫`
                              ) : (
                                `Cần đơn từ ${item.minOrderValue.toLocaleString('vi-VN')} ₫`
                              )}
                            </Text>
                          )}
                        </View>
                        <Ionicons 
                          name={isValid ? "chevron-forward" : "lock-closed"} 
                          size={18} 
                          color={isValid ? COLORS.primary : COLORS.textSecondary} 
                        />
                      </TouchableOpacity>
                    );
                    })}
                  </View>
                ) : (
                  <View style={styles.dropdownEmpty}>
                    <Ionicons name="bookmark-outline" size={24} color={COLORS.textSecondary} />
                    <Text style={styles.dropdownEmptyText}>
                      {hasSavedPromotions 
                        ? 'Không có khuyến mãi đã lưu đang hoạt động'
                        : 'Không có mã giảm giá khả dụng'}
                    </Text>
                  </View>
                )}
              </View>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    padding: 16,
    marginTop: 12,
    overflow: 'visible',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 12,
  },
  inputSection: {
    position: 'relative',
    zIndex: 1,
    overflow: 'visible',
  },
  inputContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  input: {
    flex: 1,
    paddingVertical: 10,
    paddingRight: 40,
    fontSize: 16,
    color: COLORS.text,
  },
  closeButton: {
    position: 'absolute',
    right: 12,
    padding: 4,
  },
  applyButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    justifyContent: 'center',
  },
  applyButtonDisabled: {
    opacity: 0.6,
  },
  applyButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  appliedCoupon: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f0fdf4',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.success,
  },
  appliedCouponInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  appliedCouponText: {
    marginLeft: 8,
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '600',
  },
  inputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: COLORS.background,
    position: 'relative',
  },
  inputWrapperFocused: {
    borderColor: COLORS.primary,
    borderWidth: 1.5,
  },
  inputIcon: {
    marginRight: 8,
  },
  dropdownContainer: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 4,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 20,
    zIndex: 9999,
    maxHeight: 300,
    overflow: 'hidden',
    // Ensure dropdown can receive touch events
    pointerEvents: 'box-none',
  },
  dropdownHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: '#f9fafb',
  },
  dropdownTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    marginLeft: 6,
  },
  dropdownList: {
    maxHeight: 250,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: '#fff',
  },
  dropdownItemDisabled: {
    opacity: 0.5,
    backgroundColor: '#f9fafb',
  },
  dropdownItemContent: {
    flex: 1,
    marginRight: 8,
  },
  dropdownItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  dropdownCodeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
  dropdownCode: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  dropdownBadge: {
    backgroundColor: COLORS.warning,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  dropdownBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
  dropdownItemName: {
    fontSize: 13,
    color: COLORS.text,
    marginBottom: 2,
  },
  dropdownItemCondition: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  dropdownEmpty: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropdownEmptyText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 8,
    textAlign: 'center',
  },
});

