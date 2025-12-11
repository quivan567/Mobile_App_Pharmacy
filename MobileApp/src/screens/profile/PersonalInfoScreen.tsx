import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { COLORS, API_BASE_URL } from '../../utils/constants';
import { Button } from '../../components/common/Button';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { authApi } from '../../api/auth';
import Toast from 'react-native-toast-message';
import * as ImagePicker from 'expo-image-picker';
import { logger } from '../../utils/logger';

export default function PersonalInfoScreen() {
  const navigation = useNavigation();
  const { user, refreshUser } = useAuth();
  
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [formData, setFormData] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    email: user?.email || '',
    phone: user?.phone || '',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof typeof formData, string>>>({});
  const [selectedAvatar, setSelectedAvatar] = useState<any>(null);

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof typeof formData, string>> = {};
    
    if (!formData.firstName.trim()) {
      newErrors.firstName = 'Vui lòng nhập họ';
    }
    
    if (!formData.lastName.trim()) {
      newErrors.lastName = 'Vui lòng nhập tên';
    }
    
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Email không hợp lệ';
    }
    
    if (!formData.phone.trim()) {
      newErrors.phone = 'Vui lòng nhập số điện thoại';
    } else if (!/^[0-9]{10,11}$/.test(formData.phone)) {
      newErrors.phone = 'Số điện thoại không hợp lệ';
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
      const updateData: any = { ...formData };
      
      // Add avatar if selected
      if (selectedAvatar) {
        updateData.avatar = selectedAvatar;
      }
      
      logger.log('Updating profile with data:', {
        ...updateData,
        avatar: selectedAvatar ? 'Avatar selected' : 'No avatar',
      });
      
      const response = await authApi.updateProfile(updateData);
      
      logger.log('Update profile response:', response);
      
      if (response.success) {
        await refreshUser();
        setIsEditing(false);
        setSelectedAvatar(null);
        Toast.show({
          type: 'success',
          text1: 'Thành công',
          text2: 'Cập nhật thông tin cá nhân thành công',
        });
      } else {
        Toast.show({
          type: 'error',
          text1: 'Lỗi',
          text2: response.message || 'Không thể cập nhật thông tin',
        });
      }
    } catch (error: any) {
      logger.error('Error updating profile:', error);
      
      // Handle different error types
      let errorMessage = 'Không thể cập nhật thông tin';
      
      if (error.message) {
        errorMessage = error.message;
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      
      Toast.show({
        type: 'error',
        text1: 'Lỗi',
        text2: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setFormData({
      firstName: user?.firstName || '',
      lastName: user?.lastName || '',
      email: user?.email || '',
      phone: user?.phone || '',
    });
    setErrors({});
    setSelectedAvatar(null);
    setIsEditing(false);
  };

  const handleChangeAvatar = () => {
    Alert.alert(
      'Đổi ảnh đại diện',
      'Chọn nguồn ảnh',
      [
        {
          text: 'Hủy',
          style: 'cancel',
        },
        {
          text: 'Chọn từ thư viện',
          onPress: pickImageFromLibrary,
        },
        {
          text: 'Chụp ảnh',
          onPress: takePhoto,
        },
      ]
    );
  };

  const pickImageFromLibrary = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Toast.show({
          type: 'error',
          text1: 'Quyền truy cập',
          text2: 'Cần quyền truy cập thư viện ảnh để chọn ảnh đại diện',
        });
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        setSelectedAvatar({
          uri: result.assets[0].uri,
          type: result.assets[0].mimeType || 'image/jpeg',
          name: `avatar-${Date.now()}.jpg`,
        });
      }
    } catch (error) {
      logger.error('Error picking image:', error);
      Toast.show({
        type: 'error',
        text1: 'Lỗi',
        text2: 'Không thể chọn ảnh từ thư viện',
      });
    }
  };

  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Toast.show({
          type: 'error',
          text1: 'Quyền truy cập',
          text2: 'Cần quyền truy cập camera để chụp ảnh',
        });
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        setSelectedAvatar({
          uri: result.assets[0].uri,
          type: result.assets[0].mimeType || 'image/jpeg',
          name: `avatar-${Date.now()}.jpg`,
        });
      }
    } catch (error) {
      logger.error('Error taking photo:', error);
      Toast.show({
        type: 'error',
        text1: 'Lỗi',
        text2: 'Không thể chụp ảnh',
      });
    }
  };

  // Get avatar URL
  const getAvatarUrl = () => {
    if (selectedAvatar) {
      return selectedAvatar.uri;
    }
    if (user?.avatar) {
      // If avatar is a full URL, use it directly
      if (user.avatar.startsWith('http://') || user.avatar.startsWith('https://')) {
        return user.avatar;
      }
      // Otherwise, construct URL from API base
      return `${API_BASE_URL}/${user.avatar}`;
    }
    return null;
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Thông tin cá nhân</Text>
        {!isEditing && (
          <TouchableOpacity
            onPress={() => setIsEditing(true)}
            style={styles.editButton}
          >
            <Ionicons name="create-outline" size={24} color={COLORS.primary} />
          </TouchableOpacity>
        )}
        {isEditing && <View style={styles.editButton} />}
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Avatar Section */}
        <View style={styles.avatarSection}>
          <View style={styles.avatar}>
            {getAvatarUrl() ? (
              <Image
                source={{ uri: getAvatarUrl()! }}
                style={styles.avatarImage}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>
                  {user?.firstName?.[0]?.toUpperCase() || ''}{user?.lastName?.[0]?.toUpperCase() || ''}
                </Text>
              </View>
            )}
          </View>
          {isEditing && (
            <TouchableOpacity
              style={styles.changeAvatarButton}
              onPress={handleChangeAvatar}
              disabled={isLoading || isUploadingAvatar}
            >
              {isUploadingAvatar ? (
                <ActivityIndicator size="small" color={COLORS.primary} />
              ) : (
                <>
                  <Ionicons name="camera" size={20} color={COLORS.primary} />
                  <Text style={styles.changeAvatarText}>Đổi ảnh</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Form Section */}
        <View style={styles.formSection}>
          {/* First Name */}
          <View style={styles.formGroup}>
            {isEditing ? (
              <>
                <View style={styles.formRow}>
                  <Text style={styles.label}>Họ *</Text>
                  <TextInput
                    style={[styles.inputHorizontal, errors.firstName && styles.inputError]}
                    value={formData.firstName}
                    onChangeText={(text) => {
                      setFormData({ ...formData, firstName: text });
                      if (errors.firstName) {
                        setErrors({ ...errors, firstName: undefined });
                      }
                    }}
                    placeholder="Nhập họ"
                    placeholderTextColor={COLORS.textSecondary}
                  />
                </View>
                {errors.firstName && (
                  <Text style={styles.errorText}>{errors.firstName}</Text>
                )}
              </>
            ) : (
              <View style={styles.formRow}>
                <Text style={styles.label}>Họ</Text>
                <View style={styles.valueContainer}>
                  <Text style={styles.value}>{user?.firstName || 'Chưa cập nhật'}</Text>
                </View>
              </View>
            )}
          </View>

          {/* Last Name */}
          <View style={styles.formGroup}>
            {isEditing ? (
              <>
                <View style={styles.formRow}>
                  <Text style={styles.label}>Tên *</Text>
                  <TextInput
                    style={[styles.inputHorizontal, errors.lastName && styles.inputError]}
                    value={formData.lastName}
                    onChangeText={(text) => {
                      setFormData({ ...formData, lastName: text });
                      if (errors.lastName) {
                        setErrors({ ...errors, lastName: undefined });
                      }
                    }}
                    placeholder="Nhập tên"
                    placeholderTextColor={COLORS.textSecondary}
                  />
                </View>
                {errors.lastName && (
                  <Text style={styles.errorText}>{errors.lastName}</Text>
                )}
              </>
            ) : (
              <View style={styles.formRow}>
                <Text style={styles.label}>Tên</Text>
                <View style={styles.valueContainer}>
                  <Text style={styles.value}>{user?.lastName || 'Chưa cập nhật'}</Text>
                </View>
              </View>
            )}
          </View>

          {/* Email */}
          <View style={styles.formGroup}>
            {isEditing ? (
              <>
                <View style={styles.formRow}>
                  <Text style={styles.label}>Email</Text>
                  <TextInput
                    style={[styles.inputHorizontal, errors.email && styles.inputError]}
                    value={formData.email}
                    onChangeText={(text) => {
                      setFormData({ ...formData, email: text });
                      if (errors.email) {
                        setErrors({ ...errors, email: undefined });
                      }
                    }}
                    placeholder="Nhập email"
                    placeholderTextColor={COLORS.textSecondary}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>
                {errors.email && (
                  <Text style={styles.errorText}>{errors.email}</Text>
                )}
              </>
            ) : (
              <View style={styles.formRow}>
                <Text style={styles.label}>Email</Text>
                <View style={styles.valueContainer}>
                  <Text style={styles.value}>{user?.email || 'Chưa cập nhật'}</Text>
                </View>
              </View>
            )}
          </View>

          {/* Phone */}
          <View style={styles.formGroup}>
            {isEditing ? (
              <>
                <View style={styles.formRow}>
                  <Text style={styles.label}>Số điện thoại *</Text>
                  <TextInput
                    style={[styles.inputHorizontal, errors.phone && styles.inputError]}
                    value={formData.phone}
                    onChangeText={(text) => {
                      setFormData({ ...formData, phone: text });
                      if (errors.phone) {
                        setErrors({ ...errors, phone: undefined });
                      }
                    }}
                    placeholder="Nhập số điện thoại"
                    placeholderTextColor={COLORS.textSecondary}
                    keyboardType="phone-pad"
                  />
                </View>
                {errors.phone && (
                  <Text style={styles.errorText}>{errors.phone}</Text>
                )}
              </>
            ) : (
              <View style={styles.formRow}>
                <Text style={styles.label}>Số điện thoại</Text>
                <View style={styles.valueContainer}>
                  <Text style={styles.value}>{user?.phone || 'Chưa cập nhật'}</Text>
                </View>
              </View>
            )}
          </View>

          {/* Role (Read-only) */}
          <View style={styles.formGroup}>
            <View style={styles.formRow}>
              <Text style={styles.label}>Vai trò</Text>
              <View style={styles.valueContainer}>
                <Text style={styles.value}>
                  {user?.role === 'customer' ? 'Khách hàng' : user?.role || 'Chưa cập nhật'}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Action Buttons */}
        {isEditing && (
          <View style={styles.actionButtons}>
            <Button
              title="Hủy"
              onPress={handleCancel}
              variant="outline"
              style={styles.cancelButton}
              disabled={isLoading}
            />
            <Button
              title={isLoading ? 'Đang lưu...' : 'Lưu thay đổi'}
              onPress={handleSave}
              style={styles.saveButton}
              loading={isLoading}
              disabled={isLoading}
            />
          </View>
        )}
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
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    flex: 1,
    textAlign: 'center',
  },
  editButton: {
    padding: 8,
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    overflow: 'hidden',
    marginBottom: 16,
  },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: COLORS.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  changeAvatarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  changeAvatarText: {
    marginLeft: 8,
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '600',
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
  formRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    width: 120,
    minWidth: 120,
  },
  inputHorizontal: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: COLORS.text,
    backgroundColor: COLORS.background,
  },
  inputError: {
    borderColor: COLORS.error,
  },
  valueContainer: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: COLORS.background,
    borderRadius: 8,
    minHeight: 44,
    justifyContent: 'center',
  },
  value: {
    fontSize: 16,
    color: COLORS.text,
  },
  errorText: {
    fontSize: 12,
    color: COLORS.error,
    marginTop: 4,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  cancelButton: {
    flex: 1,
  },
  saveButton: {
    flex: 1,
  },
});

