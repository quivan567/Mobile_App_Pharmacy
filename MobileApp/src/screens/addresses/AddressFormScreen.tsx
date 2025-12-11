import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { addressesApi, Address } from '../../api/addresses';
import { COLORS } from '../../utils/constants';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { Button } from '../../components/common/Button';
import { CascadingAddressPicker, findAddressCodes } from '../../components/address/AddressPicker';

export default function AddressFormScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const queryClient = useQueryClient();
  const addressId = (route.params as any)?.addressId;

  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState<Address>({
    receiverName: '',
    receiverPhone: '',
    province: '',
    provinceName: '',
    district: '',
    districtName: '',
    ward: '',
    wardName: '',
    address: '',
    addressType: 'home',
    isDefault: false,
  });
  const [errors, setErrors] = useState<Partial<Record<keyof Address, string>>>({});
  
  // State for address picker (codes and names)
  const [selectedProvince, setSelectedProvince] = useState<{ code: string; name: string } | undefined>();
  const [selectedDistrict, setSelectedDistrict] = useState<{ code: string; name: string } | undefined>();
  const [selectedWard, setSelectedWard] = useState<{ code: string; name: string } | undefined>();

  // Load address if editing
  const { data: addressData, isLoading: isLoadingAddress } = useQuery({
    queryKey: ['address', addressId],
    queryFn: () => addressesApi.getAddress(addressId!),
    enabled: !!addressId,
  });

  useEffect(() => {
    if (addressData?.data) {
      const address = addressData.data;
      setFormData(address);
      
      // Try to find address codes from names (for existing addresses)
      // This allows backward compatibility with manually entered addresses
      if (address.provinceName || address.province) {
        const addressCodes = findAddressCodes(
          address.provinceName || address.province,
          address.districtName || address.district,
          address.wardName || address.ward
        );
        
        if (addressCodes.province) {
          setSelectedProvince(addressCodes.province);
        } else {
          // If not found in dataset, still show the name (for manual addresses)
          setSelectedProvince({
            code: address.province || '',
            name: address.provinceName || address.province || '',
          });
        }
        
        if (addressCodes.district && addressCodes.province) {
          setSelectedDistrict(addressCodes.district);
        } else if (address.districtName || address.district) {
          // If not found in dataset, still show the name
          setSelectedDistrict({
            code: address.district || '',
            name: address.districtName || address.district || '',
          });
        }
        
        if (addressCodes.ward && addressCodes.district) {
          setSelectedWard(addressCodes.ward);
        } else if (address.wardName || address.ward) {
          // If not found in dataset, still show the name
          setSelectedWard({
            code: address.ward || '',
            name: address.wardName || address.ward || '',
          });
        }
      }
    }
  }, [addressData]);

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof Address, string>> = {};

    if (!formData.receiverName.trim()) {
      newErrors.receiverName = 'Vui lòng nhập họ tên người nhận';
    }

    if (!formData.receiverPhone.trim()) {
      newErrors.receiverPhone = 'Vui lòng nhập số điện thoại';
    } else if (!/^[0-9]{10,11}$/.test(formData.receiverPhone)) {
      newErrors.receiverPhone = 'Số điện thoại không hợp lệ';
    }

    // Validate using picker selections
    if (!selectedProvince) {
      newErrors.province = 'Vui lòng chọn tỉnh/thành phố';
    }

    if (!selectedDistrict) {
      newErrors.district = 'Vui lòng chọn quận/huyện';
    }

    if (!selectedWard) {
      newErrors.ward = 'Vui lòng chọn phường/xã';
    }

    if (!formData.address.trim()) {
      newErrors.address = 'Vui lòng nhập địa chỉ chi tiết';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) {
      return;
    }

    setIsLoading(true);
    try {
      // Use selected values from picker
      const submitData = {
        ...formData,
        province: selectedProvince?.code || formData.province,
        provinceName: selectedProvince?.name || formData.provinceName || formData.province,
        district: selectedDistrict?.code || formData.district,
        districtName: selectedDistrict?.name || formData.districtName || formData.district,
        ward: selectedWard?.code || formData.ward,
        wardName: selectedWard?.name || formData.wardName || formData.ward,
      };

      let response;
      if (addressId) {
        response = await addressesApi.updateAddress(addressId, submitData);
      } else {
        response = await addressesApi.createAddress(submitData);
      }

      if (response.success) {
        Toast.show({
          type: 'success',
          text1: 'Thành công',
          text2: addressId ? 'Đã cập nhật địa chỉ' : 'Đã thêm địa chỉ',
        });
        queryClient.invalidateQueries({ queryKey: ['addresses'] });
        navigation.goBack();
      } else {
        Toast.show({
          type: 'error',
          text1: 'Lỗi',
          text2: response.message || 'Không thể lưu địa chỉ',
        });
      }
    } catch (error: any) {
      Toast.show({
        type: 'error',
        text1: 'Lỗi',
        text2: error.response?.data?.message || 'Không thể lưu địa chỉ',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const updateField = (field: keyof Address, value: any) => {
    setFormData({ ...formData, [field]: value });
    if (errors[field]) {
      setErrors({ ...errors, [field]: undefined });
    }
  };

  if (isLoadingAddress) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={24} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {addressId ? 'Sửa địa chỉ' : 'Thêm địa chỉ'}
          </Text>
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
        <Text style={styles.headerTitle}>
          {addressId ? 'Sửa địa chỉ' : 'Thêm địa chỉ'}
        </Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <View style={styles.formSection}>
          <View style={styles.formGroup}>
            <Text style={styles.label}>Họ tên người nhận *</Text>
            <TextInput
              style={[styles.input, errors.receiverName && styles.inputError]}
              value={formData.receiverName}
              onChangeText={(text) => updateField('receiverName', text)}
              placeholder="Nhập họ tên người nhận"
              placeholderTextColor={COLORS.textSecondary}
            />
            {errors.receiverName && (
              <Text style={styles.errorText}>{errors.receiverName}</Text>
            )}
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Số điện thoại *</Text>
            <TextInput
              style={[styles.input, errors.receiverPhone && styles.inputError]}
              value={formData.receiverPhone}
              onChangeText={(text) => updateField('receiverPhone', text)}
              placeholder="Nhập số điện thoại"
              placeholderTextColor={COLORS.textSecondary}
              keyboardType="phone-pad"
            />
            {errors.receiverPhone && (
              <Text style={styles.errorText}>{errors.receiverPhone}</Text>
            )}
          </View>

          <CascadingAddressPicker
            selectedProvince={selectedProvince}
            selectedDistrict={selectedDistrict}
            selectedWard={selectedWard}
            onProvinceSelect={(code, name) => {
              setSelectedProvince({ code, name });
              setSelectedDistrict(undefined);
              setSelectedWard(undefined);
              updateField('province', code);
              updateField('provinceName', name);
              // Clear errors when selection changes
              if (errors.province) {
                setErrors({ ...errors, province: undefined });
              }
            }}
            onDistrictSelect={(code, name) => {
              setSelectedDistrict({ code, name });
              setSelectedWard(undefined);
              updateField('district', code);
              updateField('districtName', name);
              // Clear errors when selection changes
              if (errors.district) {
                setErrors({ ...errors, district: undefined });
              }
            }}
            onWardSelect={(code, name) => {
              setSelectedWard({ code, name });
              updateField('ward', code);
              updateField('wardName', name);
              // Clear errors when selection changes
              if (errors.ward) {
                setErrors({ ...errors, ward: undefined });
              }
            }}
            errors={{
              province: errors.province,
              district: errors.district,
              ward: errors.ward,
            }}
          />

          <View style={styles.formGroup}>
            <Text style={styles.label}>Địa chỉ chi tiết *</Text>
            <TextInput
              style={[styles.input, errors.address && styles.inputError]}
              value={formData.address}
              onChangeText={(text) => updateField('address', text)}
              placeholder="Số nhà, tên đường"
              placeholderTextColor={COLORS.textSecondary}
              multiline
              numberOfLines={3}
            />
            {errors.address && (
              <Text style={styles.errorText}>{errors.address}</Text>
            )}
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Loại địa chỉ</Text>
            <View style={styles.radioGroup}>
              <TouchableOpacity
                style={[
                  styles.radioOption,
                  formData.addressType === 'home' && styles.radioOptionActive,
                ]}
                onPress={() => updateField('addressType', 'home')}
              >
                <Ionicons
                  name={formData.addressType === 'home' ? 'radio-button-on' : 'radio-button-off'}
                  size={20}
                  color={formData.addressType === 'home' ? COLORS.primary : COLORS.textSecondary}
                />
                <Text
                  style={[
                    styles.radioText,
                    formData.addressType === 'home' && styles.radioTextActive,
                  ]}
                >
                  🏠 Nhà riêng
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.radioOption,
                  formData.addressType === 'company' && styles.radioOptionActive,
                ]}
                onPress={() => updateField('addressType', 'company')}
              >
                <Ionicons
                  name={formData.addressType === 'company' ? 'radio-button-on' : 'radio-button-off'}
                  size={20}
                  color={formData.addressType === 'company' ? COLORS.primary : COLORS.textSecondary}
                />
                <Text
                  style={[
                    styles.radioText,
                    formData.addressType === 'company' && styles.radioTextActive,
                  ]}
                >
                  🏢 Công ty
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.formGroup}>
            <TouchableOpacity
              style={styles.checkboxContainer}
              onPress={() => updateField('isDefault', !formData.isDefault)}
            >
              <Ionicons
                name={formData.isDefault ? 'checkbox' : 'checkbox-outline'}
                size={24}
                color={formData.isDefault ? COLORS.primary : COLORS.textSecondary}
              />
              <Text style={styles.checkboxText}>Đặt làm địa chỉ mặc định</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Button
          title={isLoading ? 'Đang lưu...' : 'Lưu địa chỉ'}
          onPress={handleSave}
          style={styles.saveButton}
          loading={isLoading}
          disabled={isLoading}
        />
      </ScrollView>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  formSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: COLORS.text,
    backgroundColor: COLORS.background,
    minHeight: 44,
  },
  inputError: {
    borderColor: COLORS.error,
  },
  errorText: {
    fontSize: 12,
    color: COLORS.error,
    marginTop: 4,
  },
  radioGroup: {
    flexDirection: 'row',
    gap: 16,
  },
  radioOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    flex: 1,
  },
  radioOptionActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + '10',
  },
  radioText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  radioTextActive: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  checkboxText: {
    fontSize: 14,
    color: COLORS.text,
  },
  saveButton: {
    marginTop: 8,
  },
});

