import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { prescriptionsApi } from '../../api/prescriptions';
import { COLORS } from '../../utils/constants';
import { Loading } from '../../components/common/Loading';
import { Button } from '../../components/common/Button';
import { API_BASE_URL } from '../../utils/constants';
import Toast from 'react-native-toast-message';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

export default function PrescriptionDetailScreen({ route }: any) {
  const navigation = useNavigation();
  const { prescriptionId } = route.params;
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['prescription', prescriptionId],
    queryFn: () => prescriptionsApi.getPrescriptionById(prescriptionId),
    retry: 2,
    retryDelay: 1000,
  });

  const deleteMutation = useMutation({
    mutationFn: () => prescriptionsApi.deletePrescription(prescriptionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prescriptions'] });
      queryClient.invalidateQueries({ queryKey: ['prescriptionStats'] });
      Toast.show({
        type: 'success',
        text1: 'Thành công',
        text2: 'Đã xóa đơn thuốc',
      });
      (navigation as any).goBack();
    },
    onError: (error: any) => {
      Toast.show({
        type: 'error',
        text1: 'Lỗi',
        text2: error.response?.data?.message || 'Không thể xóa đơn thuốc',
      });
    },
  });

  if (isLoading) {
    return <Loading />;
  }

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={64} color={COLORS.error} />
          <Text style={styles.errorText}>Không thể tải đơn thuốc</Text>
          <Text style={styles.errorSubtext}>
            Vui lòng thử lại sau
          </Text>
        </View>
      </View>
    );
  }

  const prescription = data?.data;

  if (!prescription) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="document-text-outline" size={64} color={COLORS.textSecondary} />
          <Text style={styles.errorText}>Không tìm thấy đơn thuốc</Text>
        </View>
      </View>
    );
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending':
        return 'Chờ xử lý';
      case 'processing':
        return 'Đang xử lý';
      case 'completed':
        return 'Hoàn thành';
      case 'cancelled':
        return 'Đã hủy';
      default:
        return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return COLORS.success;
      case 'cancelled':
        return COLORS.error;
      case 'processing':
        return COLORS.warning;
      default:
        return COLORS.primary;
    }
  };

  const imageUrl = prescription.prescriptionImage || '';
  const fullImageUrl = imageUrl?.startsWith('http')
    ? imageUrl
    : `${API_BASE_URL}/${imageUrl}`;

  const handleDelete = () => {
    Alert.alert(
      'Xóa đơn thuốc',
      'Bạn có chắc chắn muốn xóa đơn thuốc này?',
      [
        { text: 'Không', style: 'cancel' },
        {
          text: 'Có',
          style: 'destructive',
          onPress: () => deleteMutation.mutate(),
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.container}>
      {/* Status Badge */}
      <View style={styles.statusContainer}>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(prescription.status) }]}>
          <Text style={styles.statusText}>{getStatusText(prescription.status)}</Text>
        </View>
      </View>

      {/* Prescription Image */}
      {imageUrl && (
        <View style={styles.imageContainer}>
          <Image
            source={{ uri: fullImageUrl }}
            style={styles.image}
            resizeMode="contain"
          />
        </View>
      )}

      {/* Prescription Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Thông tin đơn thuốc</Text>
        
        {prescription.hospitalName && (
          <View style={styles.infoRow}>
            <Ionicons name="business-outline" size={20} color={COLORS.textSecondary} />
            <View style={styles.infoContent}>
              <Text style={styles.label}>Bệnh viện/Phòng khám:</Text>
              <Text style={styles.value}>{prescription.hospitalName}</Text>
            </View>
          </View>
        )}

        {prescription.doctorName && (
          <View style={styles.infoRow}>
            <Ionicons name="person-outline" size={20} color={COLORS.textSecondary} />
            <View style={styles.infoContent}>
              <Text style={styles.label}>Bác sĩ:</Text>
              <Text style={styles.value}>{prescription.doctorName}</Text>
            </View>
          </View>
        )}

        <View style={styles.infoRow}>
          <Ionicons name="calendar-outline" size={20} color={COLORS.textSecondary} />
          <View style={styles.infoContent}>
            <Text style={styles.label}>Ngày tạo:</Text>
            <Text style={styles.value}>
              {new Date(prescription.createdAt).toLocaleString('vi-VN')}
            </Text>
          </View>
        </View>

        {prescription.notes && (
          <View style={styles.infoRow}>
            <Ionicons name="document-text-outline" size={20} color={COLORS.textSecondary} />
            <View style={styles.infoContent}>
              <Text style={styles.label}>Ghi chú:</Text>
              <Text style={styles.value}>{prescription.notes}</Text>
            </View>
          </View>
        )}
      </View>

      {/* Actions */}
      {prescription.status === 'pending' && (
        <View style={styles.actionsContainer}>
          <Button
            title="Xóa đơn thuốc"
            onPress={handleDelete}
            variant="outline"
            style={[styles.actionButton, styles.deleteButton]}
            loading={deleteMutation.isPending}
          />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  statusContainer: {
    backgroundColor: '#fff',
    padding: 16,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  statusBadge: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
  },
  statusText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  imageContainer: {
    backgroundColor: '#fff',
    marginTop: 12,
    padding: 16,
    alignItems: 'center',
  },
  image: {
    width: '100%',
    height: 400,
    backgroundColor: COLORS.border,
    borderRadius: 8,
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
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  infoContent: {
    flex: 1,
    marginLeft: 12,
  },
  label: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  value: {
    fontSize: 16,
    color: COLORS.text,
    fontWeight: '600',
  },
  actionsContainer: {
    padding: 16,
    backgroundColor: '#fff',
    marginTop: 12,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 8,
  },
  actionButton: {
    marginBottom: 12,
  },
  deleteButton: {
    borderColor: COLORS.error,
  },
  errorText: {
    fontSize: 18,
    color: COLORS.error,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 16,
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
  },
});

