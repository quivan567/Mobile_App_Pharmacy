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
import { Input } from '../../components/common/Input';
import { Button } from '../../components/common/Button';
import { COLORS } from '../../utils/constants';
import { authApi } from '../../api/auth';
import Toast from 'react-native-toast-message';

export default function RegisterScreen({ navigation }: any) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);

  const handleSendOTP = async () => {
    if (!phone) {
      Toast.show({
        type: 'error',
        text1: 'Lỗi',
        text2: 'Vui lòng nhập số điện thoại',
      });
      return;
    }

    try {
      const response = await authApi.sendOTP(phone);
      if (response.success) {
        setOtpSent(true);
        Toast.show({
          type: 'success',
          text1: 'Thành công',
          text2: 'Mã OTP đã được gửi đến số điện thoại của bạn',
        });
      }
    } catch (error: any) {
      Toast.show({
        type: 'error',
        text1: 'Lỗi',
        text2: error.response?.data?.message || 'Không thể gửi OTP',
      });
    }
  };

  const handleRegister = async () => {
    if (!firstName || !lastName || !email || !phone || !password || !otp) {
      Toast.show({
        type: 'error',
        text1: 'Lỗi',
        text2: 'Vui lòng điền đầy đủ thông tin',
      });
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      Toast.show({
        type: 'error',
        text1: 'Lỗi',
        text2: 'Email không hợp lệ',
      });
      return;
    }

    setLoading(true);
    try {
      const response = await authApi.register({
        firstName,
        lastName,
        email,
        phone,
        password,
        otp,
      });
      if (response.success) {
        Toast.show({
          type: 'success',
          text1: 'Đăng ký thành công',
        });
        navigation.navigate('Login');
      }
    } catch (error: any) {
      Toast.show({
        type: 'error',
        text1: 'Lỗi',
        text2: error.response?.data?.message || 'Đăng ký thất bại',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>Đăng ký</Text>
          <Text style={styles.subtitle}>Tạo tài khoản mới</Text>
        </View>

        <View style={styles.form}>
          <Input
            label="Họ"
            placeholder="Nhập họ"
            value={firstName}
            onChangeText={setFirstName}
          />

          <Input
            label="Tên"
            placeholder="Nhập tên"
            value={lastName}
            onChangeText={setLastName}
          />

          <Input
            label="Email"
            placeholder="Nhập email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Input
            label="Số điện thoại"
            placeholder="Nhập số điện thoại"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />

          {!otpSent ? (
            <Button
              title="Gửi mã OTP"
              onPress={handleSendOTP}
              style={styles.otpButton}
            />
          ) : (
            <>
              <Input
                label="Mã OTP"
                placeholder="Nhập mã OTP"
                value={otp}
                onChangeText={setOtp}
                keyboardType="number-pad"
              />
              <TouchableOpacity onPress={handleSendOTP}>
                <Text style={styles.resendOtp}>Gửi lại mã OTP</Text>
              </TouchableOpacity>
            </>
          )}

          <Input
            label="Mật khẩu"
            placeholder="Nhập mật khẩu"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <Button
            title="Đăng ký"
            onPress={handleRegister}
            loading={loading}
            disabled={!otpSent}
            style={styles.registerButton}
          />

          <TouchableOpacity
            onPress={() => navigation.navigate('Login')}
            style={styles.loginLink}
          >
            <Text style={styles.loginText}>
              Đã có tài khoản? <Text style={styles.loginTextBold}>Đăng nhập</Text>
            </Text>
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
  },
  form: {
    width: '100%',
  },
  otpButton: {
    marginTop: 10,
    marginBottom: 10,
  },
  resendOtp: {
    fontSize: 14,
    color: COLORS.primary,
    textAlign: 'right',
    marginBottom: 16,
  },
  registerButton: {
    marginTop: 20,
  },
  loginLink: {
    marginTop: 20,
    alignItems: 'center',
  },
  loginText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  loginTextBold: {
    color: COLORS.primary,
    fontWeight: '600',
  },
});

