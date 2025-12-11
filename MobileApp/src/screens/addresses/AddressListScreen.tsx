import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { addressesApi, Address } from '../../api/addresses';
import { COLORS } from '../../utils/constants';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';

export default function AddressListScreen() {
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['addresses'],
    queryFn: () => addressesApi.getAddresses(),
  });

  // Refresh when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  const addresses = data?.data || [];

  const handleAddAddress = () => {
    (navigation as any).navigate('AddressForm', { addressId: null });
  };

  const handleEditAddress = (address: Address) => {
    (navigation as any).navigate('AddressForm', { addressId: address._id });
  };

  const handleDeleteAddress = (address: Address) => {
    if (!address._id) return;

    Alert.alert(
      'Xóa địa chỉ',
      'Bạn có chắc chắn muốn xóa địa chỉ này?',
      [
        {
          text: 'Hủy',
          style: 'cancel',
        },
        {
          text: 'Xóa',
          style: 'destructive',
          onPress: async () => {
            setIsDeleting(address._id!);
            try {
              const response = await addressesApi.deleteAddress(address._id!);
              if (response.success) {
                Toast.show({
                  type: 'success',
                  text1: 'Thành công',
                  text2: 'Đã xóa địa chỉ',
                });
                queryClient.invalidateQueries({ queryKey: ['addresses'] });
              } else {
                Toast.show({
                  type: 'error',
                  text1: 'Lỗi',
                  text2: response.message || 'Không thể xóa địa chỉ',
                });
              }
            } catch (error: any) {
              Toast.show({
                type: 'error',
                text1: 'Lỗi',
                text2: error.response?.data?.message || 'Không thể xóa địa chỉ',
              });
            } finally {
              setIsDeleting(null);
            }
          },
        },
      ]
    );
  };

  const handleSetDefault = async (address: Address) => {
    if (!address._id) return;

    try {
      const response = await addressesApi.setDefaultAddress(address._id);
      if (response.success) {
        Toast.show({
          type: 'success',
          text1: 'Thành công',
          text2: 'Đã đặt làm địa chỉ mặc định',
        });
        queryClient.invalidateQueries({ queryKey: ['addresses'] });
      } else {
        Toast.show({
          type: 'error',
          text1: 'Lỗi',
          text2: response.message || 'Không thể đặt địa chỉ mặc định',
        });
      }
    } catch (error: any) {
      Toast.show({
        type: 'error',
        text1: 'Lỗi',
        text2: error.response?.data?.message || 'Không thể đặt địa chỉ mặc định',
      });
    }
  };

  const formatAddress = (address: Address) => {
    const parts = [
      address.address,
      address.wardName || address.ward,
      address.districtName || address.district,
      address.provinceName || address.province,
    ].filter(Boolean);
    return parts.join(', ');
  };

  const renderAddressItem = ({ item }: { item: Address }) => (
    <View style={styles.addressCard}>
      <View style={styles.addressHeader}>
        <View style={styles.addressInfo}>
          <View style={styles.addressTitleRow}>
            <Text style={styles.receiverName}>{item.receiverName}</Text>
            {item.isDefault && (
              <View style={styles.defaultBadge}>
                <Text style={styles.defaultBadgeText}>Mặc định</Text>
              </View>
            )}
          </View>
          <Text style={styles.receiverPhone}>{item.receiverPhone}</Text>
          <Text style={styles.addressText}>{formatAddress(item)}</Text>
          {item.addressType && (
            <Text style={styles.addressType}>
              {item.addressType === 'home' ? '🏠 Nhà riêng' : '🏢 Công ty'}
            </Text>
          )}
        </View>
      </View>

      <View style={styles.addressActions}>
        {!item.isDefault && (
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => handleSetDefault(item)}
          >
            <Ionicons name="star-outline" size={20} color={COLORS.primary} />
            <Text style={styles.actionText}>Đặt mặc định</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => handleEditAddress(item)}
        >
          <Ionicons name="create-outline" size={20} color={COLORS.primary} />
          <Text style={styles.actionText}>Sửa</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, styles.deleteButton]}
          onPress={() => handleDeleteAddress(item)}
          disabled={isDeleting === item._id}
        >
          {isDeleting === item._id ? (
            <ActivityIndicator size="small" color={COLORS.error} />
          ) : (
            <>
              <Ionicons name="trash-outline" size={20} color={COLORS.error} />
              <Text style={[styles.actionText, styles.deleteText]}>Xóa</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={24} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Địa chỉ</Text>
          <View style={styles.backButton} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Địa chỉ</Text>
        <TouchableOpacity
          onPress={handleAddAddress}
          style={styles.addButton}
        >
          <Ionicons name="add" size={24} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      {addresses.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="location-outline" size={64} color={COLORS.textSecondary} />
          <Text style={styles.emptyText}>Chưa có địa chỉ nào</Text>
          <Text style={styles.emptySubtext}>Thêm địa chỉ để tiện thanh toán</Text>
          <TouchableOpacity
            style={styles.addFirstButton}
            onPress={handleAddAddress}
          >
            <Text style={styles.addFirstButtonText}>Thêm địa chỉ</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={addresses}
          renderItem={renderAddressItem}
          keyExtractor={(item) => item._id || Math.random().toString()}
          contentContainerStyle={styles.listContent}
          ListFooterComponent={
            <TouchableOpacity
              style={styles.addAddressButton}
              onPress={handleAddAddress}
            >
              <Ionicons name="add-circle-outline" size={24} color={COLORS.primary} />
              <Text style={styles.addAddressButtonText}>Thêm địa chỉ mới</Text>
            </TouchableOpacity>
          }
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButton: {
    padding: 8,
    width: 40,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    flex: 1,
    textAlign: 'center',
  },
  addButton: {
    padding: 8,
    width: 40,
    alignItems: 'flex-end',
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
    padding: 32,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
  },
  addFirstButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  addFirstButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  listContent: {
    padding: 16,
  },
  addressCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  addressHeader: {
    marginBottom: 12,
  },
  addressInfo: {
    flex: 1,
  },
  addressTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  receiverName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginRight: 8,
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
  receiverPhone: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  addressText: {
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 20,
    marginBottom: 4,
  },
  addressType: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  addressActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  deleteButton: {
    marginLeft: 'auto',
  },
  actionText: {
    fontSize: 14,
    color: COLORS.primary,
  },
  deleteText: {
    color: COLORS.error,
  },
  addAddressButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  addAddressButtonText: {
    fontSize: 16,
    color: COLORS.primary,
    fontWeight: '600',
    marginLeft: 8,
  },
});

