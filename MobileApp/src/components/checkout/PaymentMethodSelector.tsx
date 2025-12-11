import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../utils/constants';

interface PaymentMethod {
  id: string;
  name: string;
  icon: keyof typeof Ionicons.glyphMap;
  description?: string;
}

const paymentMethods: PaymentMethod[] = [
  {
    id: 'cash',
    name: 'Thanh toán khi nhận hàng',
    icon: 'cash-outline',
    description: 'Thanh toán bằng tiền mặt khi nhận hàng',
  },
  {
    id: 'momo',
    name: 'Ví MoMo',
    icon: 'phone-portrait-outline',
    description: 'Thanh toán qua ví điện tử MoMo',
  },
];

interface PaymentMethodSelectorProps {
  selectedMethod: string;
  onSelect: (methodId: string) => void;
}

export const PaymentMethodSelector: React.FC<PaymentMethodSelectorProps> = ({
  selectedMethod,
  onSelect,
}) => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Phương thức thanh toán</Text>
      {paymentMethods.map((method) => (
        <TouchableOpacity
          key={method.id}
          style={[
            styles.methodItem,
            selectedMethod === method.id && styles.methodItemSelected,
          ]}
          onPress={() => onSelect(method.id)}
        >
          <View style={styles.methodContent}>
            <Ionicons
              name={method.icon}
              size={24}
              color={selectedMethod === method.id ? COLORS.primary : COLORS.text}
            />
            <View style={styles.methodInfo}>
              <Text
                style={[
                  styles.methodName,
                  selectedMethod === method.id && styles.methodNameSelected,
                ]}
              >
                {method.name}
              </Text>
              {method.description && (
                <Text style={styles.methodDescription}>{method.description}</Text>
              )}
            </View>
          </View>
          <View
            style={[
              styles.radio,
              selectedMethod === method.id && styles.radioSelected,
            ]}
          >
            {selectedMethod === method.id && (
              <View style={styles.radioInner} />
            )}
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    padding: 16,
    marginTop: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 16,
  },
  methodItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    marginBottom: 12,
  },
  methodItemSelected: {
    borderColor: COLORS.primary,
    backgroundColor: '#f0f7ff',
  },
  methodContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  methodInfo: {
    marginLeft: 12,
    flex: 1,
  },
  methodName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  methodNameSelected: {
    color: COLORS.primary,
  },
  methodDescription: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: COLORS.primary,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.primary,
  },
});

