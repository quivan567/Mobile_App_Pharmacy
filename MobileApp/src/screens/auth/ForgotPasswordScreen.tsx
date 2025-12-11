import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { authApi } from '../../api/auth';
import { Input } from '../../components/common/Input';
import { Button } from '../../components/common/Button';
import { COLORS } from '../../utils/constants';
import Toast from 'react-native-toast-message';

export default function ForgotPasswordScreen({ navigation }: any) {
  const [step, setStep] = useState<'phone' | 'otp' | 'password'>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const validatePhone = () => {
    const phoneRegex = /^(0|\+84)[3|5|7|8|9][0-9]{8}$/;
    if (!phone.trim()) {
      setErrors({ phone: 'Vui lòng nhập số điện thoại' });
      return false;
    }
    if (!phoneRegex.test(phone)) {
      setErrors({ phone: 'Định dạng số điện thoại không hợp lệ' });
      return false;
    }
    setErrors({});
    return true;
  };

  const validateOTP = () => {
    if (!otp.trim()) {
      setErrors({ otp: 'Vui lòng nhập mã OTP' });
      return false;
    }
    if (otp.length !== 6) {
      setErrors({ otp: 'Mã OTP phải có 6 chữ số' });
      return false;
    }
    setErrors({});
    return true;
  };

  const validatePassword = () => {
    const newErrors: { [key: string]: string } = {};
    
    if (!newPassword) {
      newErrors.newPassword = 'Vui lòng nhập mật khẩu mới';
    } else if (newPassword.length < 6) {
      newErrors.newPassword = 'Mật khẩu phải có ít nhất 6 ký tự';
    }
    
    if (!confirmPassword) {
      newErrors.confirmPassword = 'Vui lòng xác nhận mật khẩu';
    } else if (newPassword !== confirmPassword) {
      newErrors.confirmPassword = 'Mật khẩu xác nhận không khớp';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSendOTP = async () => {
    if (!validatePhone()) return;

    setLoading(true);
    try {
      const response = await authApi.forgotPassword(phone, 'sms');
      if (response.success) {
        Toast.show({
          type: 'success',
          text1: 'Thành công',
          text2: response.message || 'Mã OTP đã được gửi đến số điện thoại của bạn',
        });
        setStep('otp');
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Không thể gửi mã OTP. Vui lòng thử lại.';
      Toast.show({
        type: 'error',
        text1: 'Lỗi',
        text2: errorMessage,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (!validateOTP()) return;

    setLoading(true);
    try {
      // Just verify OTP is valid format, actual verification happens in reset password
      setStep('password');
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Mã OTP không hợp lệ';
      Toast.show({
        type: 'error',
        text1: 'Lỗi',
        text2: errorMessage,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!validatePassword()) return;

    setLoading(true);
    try {
      const response = await authApi.resetPassword(phone, otp, newPassword);
      if (response.success) {
        Toast.show({
          type: 'success',
          text1: 'Thành công',
          text2: response.message || 'Đặt lại mật khẩu thành công',
        });
        // Navigate back to login
        navigation.navigate('Login');
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Không thể đặt lại mật khẩu. Vui lòng thử lại.';
      Toast.show({
        type: 'error',
        text1: 'Lỗi',
        text2: errorMessage,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResendOTP = async () => {
    await handleSendOTP();
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>Quên mật khẩu</Text>
          <Text style={styles.subtitle}>
            {step === 'phone' ? 'Nhập số điện thoại để nhận mã OTP' :
             step === 'otp' ? 'Nhập mã OTP đã được gửi đến số điện thoại của bạn' :
             step === 'password' ? 'Nhập mật khẩu mới' : ''}
          </Text>
        </View>

        <View style={styles.form}>
          {step === 'phone' && (
            <>
              <Input
                placeholder="Số điện thoại"
                value={phone}
                onChangeText={(text) => {
                  setPhone(text);
                  if (errors.phone) {
                    setErrors({ ...errors, phone: undefined });
                  }
                }}
                keyboardType="phone-pad"
                error={errors.phone}
              />

              <Button
                title="Gửi mã OTP"
                onPress={handleSendOTP}
                loading={loading}
                style={styles.button}
              />
            </>
          )}

          {step === 'otp' && (
            <>
              <View style={styles.phoneDisplay}>
                <Text style={styles.phoneDisplayText}>Số điện thoại: {phone}</Text>
                <TouchableOpacity onPress={() => setStep('phone')}>
                  <Text style={styles.changePhoneText}>Thay đổi</Text>
                </TouchableOpacity>
              </View>

              <Input
                placeholder="Mã OTP (6 chữ số)"
                value={otp}
                onChangeText={(text) => {
                  setOtp(text.replace(/[^0-9]/g, '').slice(0, 6));
                  if (errors.otp) {
                    setErrors({ ...errors, otp: undefined });
                  }
                }}
                keyboardType="number-pad"
                maxLength={6}
                error={errors.otp}
              />

              <TouchableOpacity
                onPress={handleResendOTP}
                style={styles.resendLink}
                disabled={loading}
              >
                <Text style={styles.resendText}>Gửi lại mã OTP</Text>
              </TouchableOpacity>

              <Button
                title="Xác nhận"
                onPress={handleVerifyOTP}
                loading={loading}
                style={styles.button}
              />
            </>
          )}

          {step === 'password' && (
            <>
              <Input
                placeholder="Mật khẩu mới"
                value={newPassword}
                onChangeText={(text) => {
                  setNewPassword(text);
                  if (errors.newPassword) {
                    setErrors({ ...errors, newPassword: undefined });
                  }
                }}
                secureTextEntry
                showPasswordToggle
                error={errors.newPassword}
              />

              <Input
                placeholder="Xác nhận mật khẩu"
                value={confirmPassword}
                onChangeText={(text) => {
                  setConfirmPassword(text);
                  if (errors.confirmPassword) {
                    setErrors({ ...errors, confirmPassword: undefined });
                  }
                }}
                secureTextEntry
                showPasswordToggle
                error={errors.confirmPassword}
              />

              <Button
                title="Đặt lại mật khẩu"
                onPress={handleResetPassword}
                loading={loading}
                style={styles.button}
              />
            </>
          )}

          <TouchableOpacity
            onPress={() => navigation.navigate('Login')}
            style={styles.backLink}
          >
            <Text style={styles.backText}>Quay lại đăng nhập</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  header: {
    marginBottom: 40,
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  form: {
    width: '100%',
  },
  phoneDisplay: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    padding: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
  },
  phoneDisplayText: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '500',
  },
  changePhoneText: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '500',
  },
  resendLink: {
    alignSelf: 'flex-end',
    marginTop: 8,
    marginBottom: 16,
  },
  resendText: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '500',
  },
  button: {
    marginTop: 20,
  },
  backLink: {
    marginTop: 20,
    alignItems: 'center',
  },
  backText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
});

