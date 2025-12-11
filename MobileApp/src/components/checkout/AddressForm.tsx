import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput } from 'react-native';
import { Input } from '../common/Input';
import { Address } from '../../api/addresses';
import { COLORS } from '../../utils/constants';
import { CascadingAddressPicker, findAddressCodes } from '../address/AddressPicker';

interface AddressFormProps {
  address?: Address;
  onChange: (address: Address) => void;
  errors?: Partial<Record<keyof Address, string>>;
  disabled?: boolean;
}

export const AddressForm: React.FC<AddressFormProps> = ({
  address,
  onChange,
  errors,
  disabled = false,
}) => {
  const [formData, setFormData] = useState<Address>({
    fullName: address?.fullName || '',
    phone: address?.phone || '',
    address: address?.address || '',
    ward: address?.ward || '',
    district: address?.district || '',
    province: address?.province || '',
  });

  // State for address picker (codes and names)
  const [selectedProvince, setSelectedProvince] = useState<{ code: string; name: string } | undefined>();
  const [selectedDistrict, setSelectedDistrict] = useState<{ code: string; name: string } | undefined>();
  const [selectedWard, setSelectedWard] = useState<{ code: string; name: string } | undefined>();

  // Update formData when address prop changes (especially when selecting saved address)
  useEffect(() => {
    if (address) {
      setFormData({
        fullName: address.fullName || '',
        phone: address.phone || '',
        address: address.address || '',
        ward: address.ward || '',
        district: address.district || '',
        province: address.province || '',
      });

      // Try to find address codes from names (for existing addresses)
      if (address.province) {
        const addressCodes = findAddressCodes(
          address.province,
          address.district,
          address.ward
        );
        
        if (addressCodes.province) {
          setSelectedProvince(addressCodes.province);
        } else {
          // If not found in dataset, still show the name
          setSelectedProvince({
            code: address.province || '',
            name: address.province || '',
          });
        }
        
        if (addressCodes.district && addressCodes.province) {
          setSelectedDistrict(addressCodes.district);
        } else if (address.district) {
          setSelectedDistrict({
            code: address.district || '',
            name: address.district || '',
          });
        } else {
          setSelectedDistrict(undefined);
        }
        
        if (addressCodes.ward && addressCodes.district) {
          setSelectedWard(addressCodes.ward);
        } else if (address.ward) {
          setSelectedWard({
            code: address.ward || '',
            name: address.ward || '',
          });
        } else {
          setSelectedWard(undefined);
        }
      } else {
        // Reset if no province
        setSelectedProvince(undefined);
        setSelectedDistrict(undefined);
        setSelectedWard(undefined);
      }
    } else {
      // Reset if no address
      setSelectedProvince(undefined);
      setSelectedDistrict(undefined);
      setSelectedWard(undefined);
    }
  }, [address]);

  const updateField = (field: keyof Address, value: string) => {
    if (disabled) return; // Prevent updates when disabled
    
    const updated = { ...formData, [field]: value };
    setFormData(updated);
    onChange(updated);
  };

  const handleProvinceSelect = (code: string, name: string) => {
    setSelectedProvince({ code, name });
    setSelectedDistrict(undefined);
    setSelectedWard(undefined);
    updateField('province', name); // Store name for backward compatibility
  };

  const handleDistrictSelect = (code: string, name: string) => {
    setSelectedDistrict({ code, name });
    setSelectedWard(undefined);
    updateField('district', name); // Store name for backward compatibility
  };

  const handleWardSelect = (code: string, name: string) => {
    setSelectedWard({ code, name });
    updateField('ward', name); // Store name for backward compatibility
  };

  return (
    <ScrollView style={styles.container}>
      <Input
        label="Họ và tên"
        value={formData.fullName}
        onChangeText={(text) => updateField('fullName', text)}
        error={errors?.fullName}
        placeholder="Nhập họ và tên"
        editable={!disabled}
      />

      <Input
        label="Số điện thoại"
        value={formData.phone}
        onChangeText={(text) => updateField('phone', text)}
        error={errors?.phone}
        placeholder="Nhập số điện thoại"
        keyboardType="phone-pad"
        editable={!disabled}
      />

      <CascadingAddressPicker
        selectedProvince={selectedProvince}
        selectedDistrict={selectedDistrict}
        selectedWard={selectedWard}
        onProvinceSelect={handleProvinceSelect}
        onDistrictSelect={handleDistrictSelect}
        onWardSelect={handleWardSelect}
        errors={{
          province: errors?.province,
          district: errors?.district,
          ward: errors?.ward,
        }}
        disabled={disabled}
      />

      <View style={styles.formGroup}>
        <Text style={styles.label}>Địa chỉ chi tiết *</Text>
        <TextInput
          style={[
            styles.input,
            errors?.address && styles.inputError,
            disabled && styles.inputDisabled,
          ]}
          value={formData.address}
          onChangeText={(text) => updateField('address', text)}
          placeholder="Số nhà, tên đường"
          placeholderTextColor={COLORS.textSecondary}
          editable={!disabled}
          multiline
          numberOfLines={3}
        />
        {errors?.address && (
          <Text style={styles.errorText}>{errors.address}</Text>
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
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
    textAlignVertical: 'top',
  },
  inputError: {
    borderColor: COLORS.error,
  },
  inputDisabled: {
    backgroundColor: COLORS.border + '40',
    color: COLORS.textSecondary,
  },
  errorText: {
    fontSize: 12,
    color: COLORS.error,
    marginTop: 4,
  },
});

