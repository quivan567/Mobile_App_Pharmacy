import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../../utils/constants';
import {
  getProvinces,
  getDistricts,
  getWards,
  findProvinceByName,
  findDistrictByName,
  findWardByName,
} from '../../data/vietnamAddresses';

interface AddressPickerProps {
  label: string;
  value: string; // Display value (name)
  onSelect: (code: string, name: string) => void;
  options: Array<{ code: string; name: string }>;
  error?: string;
  placeholder?: string;
  disabled?: boolean;
  searchable?: boolean;
}

const AddressPicker: React.FC<AddressPickerProps> = ({
  label,
  value,
  onSelect,
  options,
  error,
  placeholder = 'Chọn...',
  disabled = false,
  searchable = true,
}) => {
  const insets = useSafeAreaInsets();
  const [modalVisible, setModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredOptions, setFilteredOptions] = useState(options);

  useEffect(() => {
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      setFilteredOptions(
        options.filter(
          (opt) =>
            opt.name.toLowerCase().includes(query) ||
            opt.code.toLowerCase().includes(query)
        )
      );
    } else {
      setFilteredOptions(options);
    }
  }, [searchQuery, options]);

  const handleSelect = (code: string, name: string) => {
    onSelect(code, name);
    setModalVisible(false);
    setSearchQuery('');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity
        style={[
          styles.pickerButton,
          error && styles.pickerButtonError,
          disabled && styles.pickerButtonDisabled,
        ]}
        onPress={() => !disabled && setModalVisible(true)}
        disabled={disabled}
      >
        <Text
          style={[
            styles.pickerText,
            !value && styles.pickerTextPlaceholder,
            disabled && styles.pickerTextDisabled,
          ]}
        >
          {value || placeholder}
        </Text>
        <Ionicons
          name="chevron-down-outline"
          size={20}
          color={disabled ? COLORS.textSecondary : COLORS.text}
        />
      </TouchableOpacity>
      {error && <Text style={styles.errorText}>{error}</Text>}

      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          setModalVisible(false);
          setSearchQuery('');
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={[styles.modalHeader, { paddingTop: Math.max(insets.top, 16) }]}>
              <Text style={styles.modalTitle}>{label}</Text>
              <TouchableOpacity
                onPress={() => {
                  setModalVisible(false);
                  setSearchQuery('');
                }}
                style={styles.modalCloseButton}
              >
                <Ionicons name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            {searchable && (
              <View style={styles.searchContainer}>
                <Ionicons
                  name="search-outline"
                  size={20}
                  color={COLORS.textSecondary}
                  style={styles.searchIcon}
                />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Tìm kiếm..."
                  placeholderTextColor={COLORS.textSecondary}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity
                    onPress={() => setSearchQuery('')}
                    style={styles.clearButton}
                  >
                    <Ionicons
                      name="close-circle"
                      size={20}
                      color={COLORS.textSecondary}
                    />
                  </TouchableOpacity>
                )}
              </View>
            )}

            <FlatList
              data={filteredOptions}
              keyExtractor={(item) => item.code}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.optionItem,
                    value === item.name && styles.optionItemSelected,
                  ]}
                  onPress={() => handleSelect(item.code, item.name)}
                >
                  <Text
                    style={[
                      styles.optionText,
                      value === item.name && styles.optionTextSelected,
                    ]}
                  >
                    {item.name}
                  </Text>
                  {value === item.name && (
                    <Ionicons
                      name="checkmark-circle"
                      size={20}
                      color={COLORS.primary}
                    />
                  )}
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>Không tìm thấy kết quả</Text>
                </View>
              }
            />
          </View>
        </View>
      </Modal>
    </View>
  );
};

interface CascadingAddressPickerProps {
  selectedProvince?: { code: string; name: string };
  selectedDistrict?: { code: string; name: string };
  selectedWard?: { code: string; name: string };
  onProvinceSelect: (code: string, name: string) => void;
  onDistrictSelect: (code: string, name: string) => void;
  onWardSelect: (code: string, name: string) => void;
  errors?: {
    province?: string;
    district?: string;
    ward?: string;
  };
  disabled?: boolean;
}

export const CascadingAddressPicker: React.FC<CascadingAddressPickerProps> = ({
  selectedProvince,
  selectedDistrict,
  selectedWard,
  onProvinceSelect,
  onDistrictSelect,
  onWardSelect,
  errors,
  disabled = false,
}) => {
  const [provinces] = useState(getProvinces());
  const [districts, setDistricts] = useState<Array<{ code: string; name: string }>>([]);
  const [wards, setWards] = useState<Array<{ code: string; name: string }>>([]);

  // Load districts when province changes
  useEffect(() => {
    if (selectedProvince?.code) {
      const newDistricts = getDistricts(selectedProvince.code);
      setDistricts(newDistricts);
      // Reset district and ward when province changes
      if (selectedDistrict && !newDistricts.find((d) => d.code === selectedDistrict.code)) {
        onDistrictSelect('', '');
        onWardSelect('', '');
      }
    } else {
      setDistricts([]);
    }
  }, [selectedProvince?.code]);

  // Load wards when district changes
  useEffect(() => {
    if (selectedProvince?.code && selectedDistrict?.code) {
      const newWards = getWards(selectedProvince.code, selectedDistrict.code);
      setWards(newWards);
      // Reset ward when district changes
      if (selectedWard && !newWards.find((w) => w.code === selectedWard.code)) {
        onWardSelect('', '');
      }
    } else {
      setWards([]);
    }
  }, [selectedProvince?.code, selectedDistrict?.code]);

  const handleProvinceSelect = (code: string, name: string) => {
    onProvinceSelect(code, name);
    // Reset district and ward
    onDistrictSelect('', '');
    onWardSelect('', '');
  };

  const handleDistrictSelect = (code: string, name: string) => {
    onDistrictSelect(code, name);
    // Reset ward
    onWardSelect('', '');
  };

  return (
    <View>
      <AddressPicker
        label="Tỉnh/Thành phố *"
        value={selectedProvince?.name || ''}
        onSelect={handleProvinceSelect}
        options={provinces}
        error={errors?.province}
        placeholder="Chọn tỉnh/thành phố"
        disabled={disabled}
      />

      <AddressPicker
        label="Quận/Huyện *"
        value={selectedDistrict?.name || ''}
        onSelect={handleDistrictSelect}
        options={districts}
        error={errors?.district}
        placeholder={
          selectedProvince?.code
            ? 'Chọn quận/huyện'
            : 'Vui lòng chọn tỉnh/thành phố trước'
        }
        disabled={disabled || !selectedProvince?.code}
      />

      <AddressPicker
        label="Phường/Xã *"
        value={selectedWard?.name || ''}
        onSelect={onWardSelect}
        options={wards}
        error={errors?.ward}
        placeholder={
          selectedDistrict?.code
            ? 'Chọn phường/xã'
            : 'Vui lòng chọn quận/huyện trước'
        }
        disabled={disabled || !selectedDistrict?.code}
      />
    </View>
  );
};

// Helper function to find address codes from names (for backward compatibility)
export const findAddressCodes = (
  provinceName: string,
  districtName?: string,
  wardName?: string
): {
  province?: { code: string; name: string };
  district?: { code: string; name: string };
  ward?: { code: string; name: string };
} => {
  const result: {
    province?: { code: string; name: string };
    district?: { code: string; name: string };
    ward?: { code: string; name: string };
  } = {};

  if (provinceName) {
    const province = findProvinceByName(provinceName);
    if (province) {
      result.province = province;

      if (districtName && province) {
        const district = findDistrictByName(province.code, districtName);
        if (district) {
          result.district = district;

          if (wardName && district) {
            const ward = findWardByName(province.code, district.code, wardName);
            if (ward) {
              result.ward = ward;
            }
          }
        }
      }
    }
  }

  return result;
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: COLORS.background,
    minHeight: 44,
  },
  pickerButtonError: {
    borderColor: COLORS.error,
  },
  pickerButtonDisabled: {
    backgroundColor: COLORS.border + '40',
  },
  pickerText: {
    flex: 1,
    fontSize: 16,
    color: COLORS.text,
  },
  pickerTextPlaceholder: {
    color: COLORS.textSecondary,
  },
  pickerTextDisabled: {
    color: COLORS.textSecondary,
  },
  errorText: {
    fontSize: 12,
    color: COLORS.error,
    marginTop: 4,
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
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginVertical: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: COLORS.background,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: COLORS.text,
    paddingVertical: 10,
  },
  clearButton: {
    padding: 4,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  optionItemSelected: {
    backgroundColor: COLORS.primary + '10',
  },
  optionText: {
    flex: 1,
    fontSize: 16,
    color: COLORS.text,
  },
  optionTextSelected: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  emptyContainer: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
});

export default AddressPicker;

