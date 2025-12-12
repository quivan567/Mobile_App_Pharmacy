import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  Modal,
  FlatList,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { consultationApi, AnalyzePrescriptionResponse } from '../../api/consultation';
import { COLORS } from '../../utils/constants';
import { Loading } from '../../components/common/Loading';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { AddressForm } from '../../components/checkout/AddressForm';
import { PaymentMethodSelector } from '../../components/checkout/PaymentMethodSelector';
import { CouponSelector } from '../../components/checkout/CouponSelector';
import { Address, LegacyAddress, addressesApi } from '../../api/addresses';
import Toast from 'react-native-toast-message';
import { Ionicons } from '@expo/vector-icons';
import { API_BASE_URL } from '../../utils/constants';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../contexts/AuthContext';
import { logger } from '../../utils/logger';

export default function ConsultationScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedImage, setSelectedImage] = useState<any>(null);
  const [doctorName, setDoctorName] = useState('');
  const [hospitalName, setHospitalName] = useState('');
  const [notes, setNotes] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalyzePrescriptionResponse | null>(null);
  const [showAnalysisModal, setShowAnalysisModal] = useState(false);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Array<{ productId: string; quantity: number }>>([]);
  const [prescriptionId, setPrescriptionId] = useState<string | null>(null);
  const [scannedInfo, setScannedInfo] = useState<any | null>(null);
  const [shippingAddress, setShippingAddress] = useState<LegacyAddress>({
    fullName: user?.firstName && user?.lastName 
      ? `${user.firstName} ${user.lastName}` 
      : '',
    phone: user?.phone || '',
    address: '',
    ward: '',
    district: '',
    province: '',
  });
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [appliedCoupon, setAppliedCoupon] = useState<any>(null);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [addressErrors, setAddressErrors] = useState<Partial<Record<keyof LegacyAddress, string>>>({});
  const [snapshotItems, setSnapshotItems] = useState<Array<{ productId: string; quantity: number }>>([]);
  const [showAddressPicker, setShowAddressPicker] = useState(false);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const imageScrollRef = useRef<ScrollView>(null);

  // Helper function to validate selected items
  const validateSelectedItems = (itemsToValidate?: Array<{ productId: string; quantity: number }>): { valid: boolean; errors: string[] } => {
    const items = itemsToValidate || selectedItems;
    const errors: string[] = [];
    
    if (items.length === 0) {
      errors.push('Vui lòng chọn ít nhất một sản phẩm');
      return { valid: false, errors };
    }
    
    if (!analysisResult) {
      errors.push('Không có kết quả phân tích. Vui lòng phân tích lại đơn thuốc.');
      return { valid: false, errors };
    }
    
    // Validate each item
    for (const item of items) {
      if (!item.productId) {
        errors.push('Có sản phẩm không hợp lệ (thiếu productId)');
        continue;
      }
      
      if (!item.quantity || item.quantity <= 0) {
        errors.push(`Số lượng sản phẩm phải lớn hơn 0`);
        continue;
      }
      
      // Check if product exists in foundMedicines or suggestions
      const medicine = getMedicineInfo(item.productId);
      if (!medicine) {
        errors.push(`Sản phẩm không tồn tại trong kết quả phân tích`);
        continue;
      }
      
      // Check stock (warning only, backend will validate)
      if (!medicine.inStock) {
        errors.push(`${medicine.productName} đã hết hàng`);
        continue;
      }
      
      // Only block when we have a real finite stock number; skip unknown/Infinity
      const hasFiniteStock = typeof medicine.stockQuantity === 'number' && Number.isFinite(medicine.stockQuantity);
      if (hasFiniteStock && medicine.stockQuantity < item.quantity) {
        errors.push(`${medicine.productName} chỉ còn ${medicine.stockQuantity} ${medicine.unit || 'sản phẩm'}`);
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  };

  // Helper function to get medicine info from selectedItems (from foundMedicines or suggestions)
  const getMedicineInfo = (productId: string) => {
    if (!analysisResult) return null;
    
    // Tìm trong foundMedicines trước
    let medicine = analysisResult.foundMedicines.find(
      m => m.productId === productId
    );
    
    // Nếu không tìm thấy, tìm trong suggestions của notFoundMedicines
    if (!medicine) {
      for (const notFound of analysisResult.notFoundMedicines) {
        const suggestion = notFound.suggestions?.find(
          s => s?.productId === productId
        );
        if (suggestion) {
          const fallbackStock = suggestion.stockQuantity ?? Infinity; // If stock unknown, don't block client-side
          medicine = {
            productId: suggestion.productId,
            productName: suggestion.productName,
            price: suggestion.price,
            unit: suggestion.unit,
            inStock: suggestion.inStock ?? true, // default to true unless explicitly false
            stockQuantity: fallbackStock,
            requiresPrescription: false,
            confidence: suggestion.confidence || 0.7,
            originalText: notFound.originalText || suggestion.productName, // Use originalText from notFound or fallback to productName
          };
          break;
        }
      }
    }
    
    return medicine;
  };

  const { data: prescriptionsData, isLoading } = useQuery({
    queryKey: ['consultationPrescriptions'],
    queryFn: () => consultationApi.getUserPrescriptions({ limit: 5 }),
  });

  const { data: addressesData } = useQuery({
    queryKey: ['addresses'],
    queryFn: () => addressesApi.getAddresses(),
  });

  useEffect(() => {
    if (!addressesData?.data || addressesData.data.length === 0) return;
    // Prefer default address; fallback to first
    const defaultAddr = addressesData.data.find(addr => addr.isDefault) || addressesData.data[0];
    if (!defaultAddr) return;
    setSelectedAddressId(prev => prev || defaultAddr._id || null);
    // Only auto-fill if user chưa nhập gì
    if (!shippingAddress.fullName && !shippingAddress.address && !shippingAddress.province) {
      setShippingAddress(addressToLegacy(defaultAddr));
    }
  }, [addressesData, shippingAddress.fullName, shippingAddress.address, shippingAddress.province]);

  // Helper functions to convert between LegacyAddress and Address
  const legacyToAddress = (legacy: LegacyAddress): Address => ({
    receiverName: legacy.fullName,
    receiverPhone: legacy.phone,
    // Provide fullName/phone for AddressForm compatibility
    fullName: legacy.fullName,
    phone: legacy.phone,
    province: legacy.province,
    provinceName: legacy.province,
    district: legacy.district,
    districtName: legacy.district,
    ward: legacy.ward,
    wardName: legacy.ward,
    address: legacy.address,
  });

  const addressToLegacy = (addr: Address): LegacyAddress => ({
  fullName: (addr as any).fullName || addr.receiverName || '',
  phone: (addr as any).phone || addr.receiverPhone || '',
  // Prefer human-readable name fields to avoid showing codes
  province: addr.provinceName || addr.province || '',
  district: addr.districtName || addr.district || '',
  ward: addr.wardName || addr.ward || '',
    address: addr.address || '',
  });

  const handleSelectQuickAddress = (addr: Address) => {
    setSelectedAddressId(addr._id || null);
    setShippingAddress(addressToLegacy(addr));
    setShowAddressPicker(false);
  };

  const renderAddressSummary = (addr: LegacyAddress) => {
    const parts = [
      addr.address,
      addr.ward,
      addr.district,
      addr.province,
    ].filter(Boolean);
    return parts.join(', ');
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Quyền truy cập',
        'Cần quyền truy cập thư viện ảnh để tải đơn thuốc'
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      // Bỏ aspect để cho phép điều chỉnh khung cắt tự do
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setSelectedImage({
        uri: result.assets[0].uri,
        type: 'image/jpeg',
        name: 'prescription.jpg',
      });
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Quyền truy cập',
        'Cần quyền truy cập camera để chụp đơn thuốc'
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      // Bỏ aspect để cho phép điều chỉnh khung cắt tự do
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setSelectedImage({
        uri: result.assets[0].uri,
        type: 'image/jpeg',
        name: 'prescription.jpg',
      });
    }
  };

  const showImagePicker = () => {
    Alert.alert(
      'Chọn ảnh đơn thuốc',
      'Bạn muốn chọn ảnh từ đâu?',
      [
        { text: 'Hủy', style: 'cancel' },
        { text: 'Chụp ảnh', onPress: takePhoto },
        { text: 'Chọn từ thư viện', onPress: pickImage },
      ]
    );
  };

  // Helper function to save prescription if needed
  const savePrescriptionIfNeeded = async (): Promise<string | null> => {
    // If prescription already exists, update it with current info and suggestions
    if (prescriptionId) {
      logger.log('Prescription already exists, updating with current info...');
      
      // Extract all suggestions from notFoundMedicines for update
      let suggestedMedicines: Array<{
        productId: string;
        productName: string;
        price: number;
        unit: string;
        confidence?: number;
        matchReason?: string;
        originalText?: string;
      }> = [];
      
      if (analysisResult && analysisResult.notFoundMedicines) {
        analysisResult.notFoundMedicines.forEach((notFound) => {
          if (notFound.suggestions && Array.isArray(notFound.suggestions)) {
            notFound.suggestions.forEach((suggestion) => {
              // Avoid duplicates by checking productId
              if (!suggestedMedicines.find(s => s.productId === suggestion.productId)) {
                suggestedMedicines.push({
                  productId: suggestion.productId,
                  productName: suggestion.productName,
                  price: suggestion.price,
                  unit: suggestion.unit,
                  confidence: suggestion.confidence,
                  matchReason: suggestion.matchReason,
                  originalText: notFound.originalText,
                });
              }
            });
          }
        });
      }
      
      try {
        // Update prescription with current info and suggestions
        // Note: Backend updatePrescription accepts any fields, so we can include suggestedMedicines
        const updateData: any = {
          doctorName,
          hospitalName,
          notes,
        };
        
        if (suggestedMedicines.length > 0) {
          updateData.suggestedMedicines = suggestedMedicines;
        }
        
        await consultationApi.updatePrescription(prescriptionId, updateData);
        logger.log(`Prescription updated successfully with ${suggestedMedicines.length} suggested medicines`);
        return prescriptionId;
      } catch (updateError: any) {
        logger.error('Error updating existing prescription:', updateError);
        // Continue to save as new if update fails
      }
    }

    if (!selectedImage) {
      return null;
    }

    try {
      logger.log('Attempting to save prescription before creating order...');
      
      // Extract all suggestions from notFoundMedicines
      let suggestedMedicines: Array<{
        productId: string;
        productName: string;
        price: number;
        unit: string;
        confidence?: number;
        matchReason?: string;
        originalText?: string;
      }> = [];
      
      if (analysisResult && analysisResult.notFoundMedicines) {
        analysisResult.notFoundMedicines.forEach((notFound) => {
          if (notFound.suggestions && Array.isArray(notFound.suggestions)) {
            notFound.suggestions.forEach((suggestion) => {
              // Avoid duplicates by checking productId
              if (!suggestedMedicines.find(s => s.productId === suggestion.productId)) {
                suggestedMedicines.push({
                  productId: suggestion.productId,
                  productName: suggestion.productName,
                  price: suggestion.price,
                  unit: suggestion.unit,
                  confidence: suggestion.confidence,
                  matchReason: suggestion.matchReason,
                  originalText: notFound.originalText,
                });
              }
            });
          }
        });
      }
      
      logger.log(`Saving prescription with ${suggestedMedicines.length} suggested medicines`);
      
      const response = await consultationApi.savePrescription({
        prescriptionImage: selectedImage,
        doctorName,
        hospitalName,
        notes,
        suggestedMedicines: suggestedMedicines.length > 0 ? suggestedMedicines : undefined,
      });

      if (response.success && response.data?._id) {
        const savedPrescriptionId = response.data._id;
        setPrescriptionId(savedPrescriptionId);
        logger.log('Prescription saved successfully with ID:', savedPrescriptionId);
        return savedPrescriptionId;
      }
      return null;
    } catch (error: any) {
      logger.error('Error saving prescription:', error);
      return null;
    }
  };

  const handleScanPrescription = async () => {
    if (!selectedImage) {
      Toast.show({
        type: 'error',
        text1: 'Lỗi',
        text2: 'Vui lòng chọn ảnh đơn thuốc',
      });
      return;
    }

    setIsProcessing(true);
    try {
      logger.log('=== FRONTEND: Scanning prescription (OCR) ===');
      const response = await consultationApi.scanPrescription({
        prescriptionImage: selectedImage,
      });

      logger.log('Scan response:', JSON.stringify(response, null, 2));

      if (!response.success || !response.data?._id) {
        Toast.show({
          type: 'error',
          text1: 'Lỗi',
          text2: response.message || 'Không thể tạo đơn thuốc từ ảnh',
        });
        return;
      }

      const newId = String(response.data._id); // Ensure it's a string
      setPrescriptionId(newId);
      logger.log('Prescription ID saved after scan:', newId);
      logger.log('Prescription ID type:', typeof newId);
      setScannedInfo(response.data.extractedInfo || null);

      // Cập nhật các state cũ để dùng lại trong flow đặt hàng
      if (response.data.extractedInfo) {
        const extracted = response.data.extractedInfo;
        if (extracted.doctorName) setDoctorName(extracted.doctorName);
        if (extracted.hospitalName) setHospitalName(extracted.hospitalName);
        if (extracted.notes) setNotes(extracted.notes);
      }

      Toast.show({
        type: 'success',
        text1: 'Thành công',
        text2: 'Đã tạo đơn thuốc từ ảnh. Bạn có thể bấm Phân tích đơn thuốc.',
      });
    } catch (error: any) {
      logger.error('Error scanning prescription:', error);
      Toast.show({
        type: 'error',
        text1: 'Lỗi',
        text2: error.message || 'Không thể tạo đơn thuốc từ ảnh',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAnalyze = async () => {
    if (!prescriptionId) {
      Toast.show({
        type: 'error',
        text1: 'Lỗi',
        text2: 'Vui lòng tạo đơn thuốc trước khi phân tích',
      });
      return;
    }

    setIsProcessing(true);
    try {
      logger.log('========================================');
      logger.log('=== FRONTEND: Starting Analysis ===');
      logger.log('========================================');
      logger.log('Prescription ID for analysis:', prescriptionId);
      logger.log('Prescription ID type:', typeof prescriptionId);
      logger.log('Prescription ID string:', String(prescriptionId));

      logger.log('=== Calling analyzePrescription API (by prescriptionId) ===');
      const response = await consultationApi.analyzePrescription({
        prescriptionId: String(prescriptionId), // Ensure it's a string
        notes,
        doctorName,
        hospitalName,
      });

      logger.log('========================================');
      logger.log('=== FRONTEND: Analysis Response ===');
      logger.log('========================================');
      logger.log('Response:', JSON.stringify(response, null, 2));
      
      if (response.success && response.data) {
        setAnalysisResult(response.data);
        
        // Log analysis result for debugging
        logger.log('=== Analysis Result ===');
        logger.log('Found medicines:', response.data.foundMedicines?.length || 0);
        logger.log('Not found medicines:', response.data.notFoundMedicines?.length || 0);
        if (response.data.notFoundMedicines) {
          response.data.notFoundMedicines.forEach((item: any, idx: number) => {
            logger.log(`  Not found ${idx + 1}: "${item.originalText}"`);
            logger.log(`    Suggestions: ${item.suggestions?.length || 0}`);
            if (item.suggestions && item.suggestions.length > 0) {
              item.suggestions.forEach((s: any, sIdx: number) => {
                logger.log(`      ${sIdx + 1}. ${s.productName} (ID: ${s.productId}, confidence: ${s.confidence})`);
              });
            }
          });
        }
        
        // Auto-fill form fields from OCR extracted info (only if fields are empty)
        let updatedDoctorName = doctorName;
        let updatedHospitalName = hospitalName;
        let updatedNotes = notes;
        let shouldUpdatePrescription = false;
        
        if (response.data.extractedInfo) {
          const extracted = response.data.extractedInfo;
          logger.log('Extracted info from OCR:', extracted);
          
          // Only auto-fill if field is currently empty
          if (extracted.doctorName && !doctorName.trim()) {
            updatedDoctorName = extracted.doctorName;
            setDoctorName(extracted.doctorName);
            logger.log('Auto-filled doctorName:', extracted.doctorName);
            shouldUpdatePrescription = true;
          }
          if (extracted.hospitalName && !hospitalName.trim()) {
            updatedHospitalName = extracted.hospitalName;
            setHospitalName(extracted.hospitalName);
            logger.log('Auto-filled hospitalName:', extracted.hospitalName);
            shouldUpdatePrescription = true;
          }
          if (extracted.notes && !notes.trim()) {
            updatedNotes = extracted.notes;
            setNotes(extracted.notes);
            logger.log('Auto-filled notes:', extracted.notes);
            shouldUpdatePrescription = true;
          }
        }
        
        // Update prescription with auto-filled info if prescription was auto-saved
        const currentPrescriptionId = response.data.prescriptionId || prescriptionId;
        if (shouldUpdatePrescription && currentPrescriptionId) {
          logger.log('Updating prescription with auto-filled OCR info:', {
            prescriptionId: currentPrescriptionId,
            doctorName: updatedDoctorName,
            hospitalName: updatedHospitalName,
            notes: updatedNotes,
          });
          
          try {
            await consultationApi.updatePrescription(currentPrescriptionId, {
              doctorName: updatedDoctorName,
              hospitalName: updatedHospitalName,
              notes: updatedNotes,
            });
            logger.log('Prescription updated successfully with OCR info');
          } catch (updateError: any) {
            logger.error('Error updating prescription with OCR info:', updateError);
            // Don't fail the analysis if update fails
          }
        }
        
        // Auto-select all found medicines
        if (response.data.orderItems && response.data.orderItems.length > 0) {
          setSelectedItems(response.data.orderItems.map((item: any) => ({
            productId: item.productId,
            quantity: item.quantity || 1,
          })));
        }
        setShowAnalysisModal(true);
      }
    } catch (error: any) {
      logger.log('========================================');
      logger.log('=== FRONTEND: Analysis Error ===');
      logger.log('========================================');
      logger.error('Error object:', error);
      logger.error('Error message:', error.message);
      logger.error('Error response:', error.response);
      logger.error('Error response data:', error.response?.data);
      logger.error('Error response status:', error.response?.status);
      logger.error('Error stack:', error.stack);
      Toast.show({
        type: 'error',
        text1: 'Lỗi',
        text2: error.response?.data?.message || error.message || 'Không thể phân tích đơn thuốc',
      });
    } finally {
      setIsProcessing(false);
      logger.log('========================================');
      logger.log('=== FRONTEND: Analysis Complete ===');
      logger.log('========================================');
    }
  };

  const handleCreateOrderFromAnalysis = async () => {
    // Validate selected items before opening order modal
    const validation = validateSelectedItems();
    if (!validation.valid) {
      Toast.show({
        type: 'error',
        text1: 'Lỗi',
        text2: validation.errors[0] || 'Vui lòng kiểm tra lại sản phẩm đã chọn',
      });
      // Show all errors if multiple
      if (validation.errors.length > 1) {
        setTimeout(() => {
          Toast.show({
            type: 'error',
            text1: 'Các lỗi khác',
            text2: validation.errors.slice(1).join(', '),
          });
        }, 2000);
      }
      return;
    }

    // Try to get prescriptionId, save if needed
    let currentPrescriptionId = prescriptionId;
    if (!currentPrescriptionId) {
      logger.log('PrescriptionId missing, attempting to save prescription...');
      setIsProcessing(true);
      try {
        const savedId = await savePrescriptionIfNeeded();
        if (savedId) {
          currentPrescriptionId = savedId;
          setPrescriptionId(savedId);
          logger.log('Prescription saved successfully with ID:', savedId);
        } else {
          Toast.show({
            type: 'error',
            text1: 'Lỗi',
            text2: 'Không thể lưu đơn thuốc. Vui lòng thử lại.',
          });
          setIsProcessing(false);
          return;
        }
      } catch (error: any) {
        logger.error('Error saving prescription:', error);
        Toast.show({
          type: 'error',
          text1: 'Lỗi',
          text2: 'Không thể lưu đơn thuốc. Vui lòng thử lại.',
        });
        setIsProcessing(false);
        return;
      } finally {
        setIsProcessing(false);
      }
    }

    if (!currentPrescriptionId) {
      Toast.show({
        type: 'error',
        text1: 'Lỗi',
        text2: 'Không tìm thấy đơn thuốc. Vui lòng phân tích lại đơn thuốc.',
      });
      return;
    }

    // Snapshot selectedItems to prevent race conditions
    const itemsSnapshot = [...selectedItems];
    setSnapshotItems(itemsSnapshot);
    logger.log('Snapshot items for order:', itemsSnapshot);
    
    setShowAnalysisModal(false);
    setShowOrderModal(true);
  };

  const validateAddress = (): boolean => {
    const errors: Partial<Record<keyof LegacyAddress, string>> = {};
    
    if (!shippingAddress.fullName.trim()) {
      errors.fullName = 'Vui lòng nhập họ và tên';
    }
    if (!shippingAddress.phone.trim()) {
      errors.phone = 'Vui lòng nhập số điện thoại';
    } else if (!/^[0-9]{10,11}$/.test(shippingAddress.phone)) {
      errors.phone = 'Số điện thoại không hợp lệ';
    }
    if (!shippingAddress.province.trim()) {
      errors.province = 'Vui lòng nhập tỉnh/thành phố';
    }
    if (!shippingAddress.district.trim()) {
      errors.district = 'Vui lòng nhập quận/huyện';
    }
    if (!shippingAddress.ward.trim()) {
      errors.ward = 'Vui lòng nhập phường/xã';
    }
    if (!shippingAddress.address.trim()) {
      errors.address = 'Vui lòng nhập địa chỉ chi tiết';
    }

    setAddressErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreateOrderFromPrescription = async () => {
    logger.log('========================================');
    logger.log('=== FRONTEND: Creating Order ===');
    logger.log('========================================');
    logger.log('Prescription ID:', prescriptionId);
    logger.log('Prescription ID type:', typeof prescriptionId);
    logger.log('Selected Items:', JSON.stringify(selectedItems, null, 2));
    logger.log('Selected Items count:', selectedItems.length);
    logger.log('Shipping Address:', shippingAddress);
    logger.log('Payment Method:', paymentMethod);
    logger.log('Applied Coupon:', appliedCoupon);

    if (!validateAddress()) {
      logger.log('Address validation failed:', addressErrors);
      Toast.show({
        type: 'error',
        text1: 'Lỗi',
        text2: 'Vui lòng điền đầy đủ thông tin địa chỉ',
      });
      return;
    }

    // Use snapshot items if available, otherwise use current selectedItems
    const itemsToUse = snapshotItems.length > 0 ? snapshotItems : selectedItems;
    
    // Validate items one more time before creating order (using snapshot if available)
    const validation = validateSelectedItems(itemsToUse);
    if (!validation.valid) {
      logger.error('Items validation failed:', validation.errors);
      Toast.show({
        type: 'error',
        text1: 'Lỗi',
        text2: validation.errors[0] || 'Vui lòng kiểm tra lại sản phẩm đã chọn',
      });
      // Show all errors if multiple
      if (validation.errors.length > 1) {
        setTimeout(() => {
          Toast.show({
            type: 'error',
            text1: 'Các lỗi khác',
            text2: validation.errors.slice(1).join(', '),
          });
        }, 2000);
      }
      return;
    }

    // Try to get prescriptionId, save if needed
    let currentPrescriptionId = prescriptionId;
    if (!currentPrescriptionId) {
      logger.warn('Prescription ID is missing, attempting to save prescription...');
      try {
        const savedId = await savePrescriptionIfNeeded();
        if (savedId) {
          currentPrescriptionId = savedId;
          setPrescriptionId(savedId);
          logger.log('Prescription saved successfully with ID:', savedId);
        } else {
          logger.error('Failed to save prescription as fallback');
          Toast.show({
            type: 'error',
            text1: 'Lỗi',
            text2: 'Không thể lưu đơn thuốc. Vui lòng phân tích lại đơn thuốc.',
          });
          return;
        }
      } catch (error: any) {
        logger.error('Error saving prescription as fallback:', error);
        Toast.show({
          type: 'error',
          text1: 'Lỗi',
          text2: 'Không thể lưu đơn thuốc. Vui lòng phân tích lại đơn thuốc.',
        });
        return;
      }
    }

    setIsProcessing(true);
    try {
      const fullAddress = `${shippingAddress.address}, ${shippingAddress.ward}, ${shippingAddress.district}, ${shippingAddress.province}`;
      
      logger.log('=== Calling createOrderFromPrescription API ===');
      // Use snapshot items if available, otherwise use current selectedItems
      const itemsToSend = snapshotItems.length > 0 ? snapshotItems : selectedItems;
      
      // Filter out invalid items (quantity > 0, productId exists)
      const validItems = itemsToSend.filter(item => {
        if (!item.productId || !item.quantity || item.quantity <= 0) {
          logger.warn('Filtering out invalid item:', item);
          return false;
        }
        const medicine = getMedicineInfo(item.productId);
        if (!medicine) {
          logger.warn('Filtering out item with missing medicine info:', item);
          return false;
        }
        return true;
      });
      
      if (validItems.length === 0) {
        logger.error('No valid items after filtering!');
        Toast.show({
          type: 'error',
          text1: 'Lỗi',
          text2: 'Không có sản phẩm hợp lệ để tạo đơn hàng',
        });
        return;
      }
      
      logger.log('Valid items to send:', validItems);
      
      const requestData = {
        prescriptionId: currentPrescriptionId,
        items: validItems,
        shippingAddress: fullAddress,
        shippingPhone: shippingAddress.phone,
        paymentMethod,
        notes: `Người nhận: ${shippingAddress.fullName}`,
        couponCode: appliedCoupon?.code || undefined,
      };
      logger.log('Request data:', JSON.stringify(requestData, null, 2));
      
      const response = await consultationApi.createOrderFromPrescription(requestData);

      logger.log('========================================');
      logger.log('=== FRONTEND: Order Response ===');
      logger.log('========================================');
      logger.log('Response:', JSON.stringify(response, null, 2));

      if (response.success) {
        logger.log('Order created successfully:', response.data);
        Toast.show({
          type: 'success',
          text1: 'Thành công',
          text2: 'Đã tạo đơn hàng từ đơn thuốc',
        });
        
        // Reset form
        setSelectedImage(null);
        setDoctorName('');
        setHospitalName('');
        setNotes('');
        setAnalysisResult(null);
        setSelectedItems([]);
        setSnapshotItems([]);
        setPrescriptionId(null);
        setAppliedCoupon(null);
        setDiscountAmount(0);
        setShowOrderModal(false);
        setShowAnalysisModal(false);
        
        // Invalidate queries
        queryClient.invalidateQueries({ queryKey: ['orders'] });
        queryClient.invalidateQueries({ queryKey: ['consultationPrescriptions'] });
        
        // Navigate to orders tab
        logger.log('Navigating to Orders tab...');
        (navigation as any).navigate('Orders');
      } else {
        logger.log('Order creation failed:', response.message);
        Toast.show({
          type: 'error',
          text1: 'Lỗi',
          text2: response.message || 'Không thể tạo đơn hàng',
        });
      }
    } catch (error: any) {
      logger.log('========================================');
      logger.log('=== FRONTEND: Order Creation Error ===');
      logger.log('========================================');
      logger.error('Error object:', error);
      logger.error('Error message:', error.message);
      logger.error('Error response:', error.response);
      logger.error('Error response data:', error.response?.data);
      logger.error('Error response status:', error.response?.status);
      logger.error('Error stack:', error.stack);
      Toast.show({
        type: 'error',
        text1: 'Lỗi',
        text2: error.response?.data?.message || error.message || 'Không thể tạo đơn hàng',
      });
    } finally {
      setIsProcessing(false);
      logger.log('========================================');
      logger.log('=== FRONTEND: Order Creation Complete ===');
      logger.log('========================================');
    }
  };

  const recentPrescriptions = prescriptionsData?.data || [];

  return (
    <ScrollView ref={imageScrollRef} style={styles.container}>

      {/* Image Picker */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Ảnh đơn thuốc</Text>
        {selectedImage ? (
          <View style={styles.imagePreview}>
            <Image
              source={{ uri: selectedImage.uri }}
              style={styles.previewImage}
              resizeMode="contain"
            />
            <TouchableOpacity
              style={styles.removeImageButton}
              onPress={() => setSelectedImage(null)}
            >
              <Ionicons name="close-circle" size={32} color={COLORS.error} />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.imagePicker} onPress={showImagePicker}>
            <Ionicons name="camera-outline" size={48} color={COLORS.primary} />
            <Text style={styles.imagePickerText}>Chọn ảnh đơn thuốc</Text>
            <Text style={styles.imagePickerSubtext}>
              Chụp ảnh hoặc chọn từ thư viện
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Thông tin đơn thuốc sau khi quét (chỉ hiển thị, không nhập tay) */}
      {scannedInfo && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Thông tin đơn thuốc</Text>
            <View style={styles.autoFillBadge}>
              <Ionicons name="checkmark-circle" size={14} color={COLORS.success} />
              <Text style={styles.autoFillText}>Đã quét từ ảnh (OCR)</Text>
            </View>
          </View>
          {scannedInfo.doctorName && (
            <Text style={styles.noteText}>Bác sĩ: {scannedInfo.doctorName}</Text>
          )}
          {scannedInfo.hospitalName && (
            <Text style={styles.noteText}>Bệnh viện/Phòng khám: {scannedInfo.hospitalName}</Text>
          )}
          {scannedInfo.diagnosis && (
            <Text style={styles.noteText}>Chẩn đoán: {scannedInfo.diagnosis}</Text>
          )}
          {scannedInfo.examinationDate && (
            <Text style={styles.noteText}>Ngày khám: {scannedInfo.examinationDate}</Text>
          )}
          {scannedInfo.notes && (
            <Text style={styles.noteText}>Ghi chú: {scannedInfo.notes}</Text>
          )}
        </View>
      )}

      {/* Actions */}
      <View style={styles.actionsContainer}>
        <Button
          title="Tạo đơn thuốc từ ảnh"
          onPress={handleScanPrescription}
          style={styles.actionButton}
          loading={isProcessing}
          disabled={!selectedImage}
        />
        <Button
          title="Phân tích đơn thuốc"
          onPress={handleAnalyze}
          variant="outline"
          style={styles.actionButton}
          loading={isProcessing}
          disabled={!prescriptionId}
        />
      </View>

      {/* Recent Prescriptions */}
      {recentPrescriptions.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Đơn thuốc gần đây</Text>
          {recentPrescriptions.map((prescription: any, index: number) => {
            if (!prescription || !prescription._id) return null;
            return (
              <TouchableOpacity
                key={prescription._id || `prescription-${index}`}
                style={styles.recentItem}
                onPress={() => {
                  (navigation as any).navigate('Prescriptions', {
                    screen: 'PrescriptionDetail',
                    params: { prescriptionId: prescription._id },
                  });
                }}
              >
                <Ionicons name="document-text-outline" size={24} color={COLORS.primary} />
                <View style={styles.recentItemInfo}>
                  <Text style={styles.recentItemTitle}>
                    {prescription.hospitalName || 'Không xác định'}
                  </Text>
                  <Text style={styles.recentItemDate}>
                    {prescription.createdAt
                      ? new Date(prescription.createdAt).toLocaleDateString('vi-VN')
                      : ''}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Analysis Result Modal */}
      <Modal
        visible={showAnalysisModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAnalysisModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Kết quả phân tích</Text>
            <View style={styles.modalHeaderActions}>
              {selectedImage && (
                <TouchableOpacity 
                  onPress={() => {
                    setShowAnalysisModal(false);
                    // Scroll to image section
                    setTimeout(() => {
                      imageScrollRef.current?.scrollTo({ y: 0, animated: true });
                    }, 100);
                  }}
                  style={styles.viewImageButton}
                >
                  <Ionicons name="image-outline" size={20} color={COLORS.primary} />
                  <Text style={styles.viewImageText}>Xem ảnh</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => setShowAnalysisModal(false)}>
                <Ionicons name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView style={styles.modalContent}>
            {analysisResult && (
              <>
                {/* Hiển thị analysisNotes (bao gồm Gemini notes) - Tinh gọn */}
                {analysisResult.analysisNotes && analysisResult.analysisNotes.length > 0 && (
                  <View style={styles.analysisNotesContainer}>
                    <Text style={styles.analysisNotesTitle}>Thông tin phân tích</Text>
                    {analysisResult.analysisNotes.map((note: string, idx: number) => {
                      // Loại bỏ prefix không cần thiết để hiển thị gọn hơn
                      let displayNote = note;
                      let iconName = 'information-circle';
                      let iconColor = COLORS.textSecondary;
                      
                      // Phân loại note và tinh gọn text
                      if (note.includes('🤖')) {
                        displayNote = note.replace('🤖 Tóm tắt từ Gemini: ', '').replace('🤖 ', '');
                        iconName = 'sparkles';
                        iconColor = COLORS.primary;
                      } else if (note.includes('⚠️')) {
                        displayNote = note.replace('⚠️ Lưu ý an toàn (Gemini): ', '').replace('⚠️ ', '');
                        iconName = 'warning';
                        iconColor = COLORS.warning;
                      } else if (note.includes('💡')) {
                        displayNote = note.replace('💡 Gợi ý (Gemini): ', '').replace('💡 ', '');
                        iconName = 'bulb';
                        iconColor = COLORS.primary;
                      } else if (note.includes('✅')) {
                        displayNote = note.replace('✅ ', '');
                        iconName = 'checkmark-circle';
                        iconColor = COLORS.success;
                      }
                      
                      return (
                        <View key={idx} style={styles.analysisNoteItem}>
                          <Ionicons name={iconName as any} size={16} color={iconColor} />
                          <Text style={[
                            styles.analysisNoteText,
                            iconColor === COLORS.primary && styles.geminiNoteText,
                            iconColor === COLORS.warning && styles.geminiSafetyText,
                            iconColor === COLORS.success && { color: COLORS.success },
                          ]}>
                            {displayNote}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                )}

                {/* Hiển thị thuốc đã tìm thấy (trùng khớp) */}
                {analysisResult.foundMedicines.length > 0 && (
                  <View style={styles.medicinesContainer}>
                    <View style={styles.sectionHeader}>
                      <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
                      <Text style={styles.sectionTitle}>Thuốc đã tìm thấy ({analysisResult.foundMedicines.length})</Text>
                    </View>
                    {analysisResult.foundMedicines.map((medicine, index) => {
                      if (!medicine) return null;
                      const isSelected = selectedItems.some(
                        item => item.productId === medicine.productId
                      );
                      const selectedItem = selectedItems.find(
                        item => item.productId === medicine.productId
                      );
                      
                      return (
                        <View key={index} style={styles.medicineItem}>
                          <View style={styles.medicineInfo}>
                            <Text style={styles.medicineName}>{medicine.productName || 'Không xác định'}</Text>
                            {medicine.originalText && medicine.originalText !== medicine.productName && (
                              <Text style={styles.originalText}>
                                Trong đơn: {medicine.originalText}
                              </Text>
                            )}
                            <View style={styles.medicineMeta}>
                              <Text style={styles.medicinePrice}>
                                {medicine.price ? medicine.price.toLocaleString('vi-VN') : '0'} ₫ / {medicine.unit || 'sản phẩm'}
                              </Text>
                              {medicine.confidence !== undefined && (
                                <View style={styles.confidenceBadge}>
                                  <Ionicons 
                                    name="checkmark-circle" 
                                    size={14} 
                                    color={medicine.confidence >= 0.8 ? COLORS.success : medicine.confidence >= 0.6 ? COLORS.warning : COLORS.error} 
                                  />
                                  <Text style={[
                                    styles.confidenceText,
                                    { color: medicine.confidence >= 0.8 ? COLORS.success : medicine.confidence >= 0.6 ? COLORS.warning : COLORS.error }
                                  ]}>
                                    {(medicine.confidence * 100).toFixed(0)}%
                                  </Text>
                                </View>
                              )}
                            </View>
                            {medicine.requiresPrescription && (
                              <View style={styles.prescriptionBadge}>
                                <Ionicons name="document-text" size={12} color={COLORS.warning} />
                                <Text style={styles.prescriptionText}>Cần đơn bác sĩ</Text>
                              </View>
                            )}
                            {!medicine.inStock && (
                              <Text style={styles.outOfStockText}>Hết hàng</Text>
                            )}
                          </View>
                          {medicine.inStock && (
                            <View style={styles.quantitySelector}>
                              <TouchableOpacity
                                style={styles.quantityButton}
                                onPress={() => {
                                  if (isSelected && selectedItem) {
                                    if (selectedItem.quantity > 1) {
                                      setSelectedItems(selectedItems.map(item =>
                                        item.productId === medicine.productId
                                          ? { ...item, quantity: item.quantity - 1 }
                                          : item
                                      ));
                                    } else {
                                      setSelectedItems(selectedItems.filter(
                                        item => item.productId !== medicine.productId
                                      ));
                                    }
                                  }
                                }}
                                disabled={!isSelected}
                              >
                                <Ionicons name="remove" size={16} color={COLORS.text} />
                              </TouchableOpacity>
                              <Text style={styles.quantityText}>
                                {selectedItem?.quantity || 0}
                              </Text>
                              <TouchableOpacity
                                style={styles.quantityButton}
                                onPress={() => {
                                  if (isSelected) {
                                    setSelectedItems(selectedItems.map(item =>
                                      item.productId === medicine.productId
                                        ? { ...item, quantity: item.quantity + 1 }
                                        : item
                                    ));
                                  } else {
                                    setSelectedItems([...selectedItems, {
                                      productId: medicine.productId,
                                      quantity: 1,
                                    }]);
                                  }
                                }}
                              >
                                <Ionicons name="add" size={16} color={COLORS.text} />
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>
                )}

                {/* Hiển thị thuốc đề xuất (chỉ khi không có thuốc trùng khớp) */}
                {analysisResult.foundMedicines.length === 0 && (() => {
                  // Lọc chỉ lấy các notFoundMedicines có suggestions
                  const notFoundWithSuggestions = analysisResult.notFoundMedicines?.filter(
                    item => item && item.suggestions && Array.isArray(item.suggestions) && item.suggestions.length > 0
                  ) || [];
                  
                  // Debug logging
                  logger.log('=== Rendering Suggestions ===');
                  logger.log('foundMedicines.length:', analysisResult.foundMedicines?.length || 0);
                  logger.log('notFoundMedicines.length:', analysisResult.notFoundMedicines?.length || 0);
                  logger.log('notFoundWithSuggestions.length:', notFoundWithSuggestions.length);
                  notFoundWithSuggestions.forEach((item, idx) => {
                    console.log(`  Item ${idx + 1}: "${item.originalText}", suggestions: ${item.suggestions?.length || 0}`);
                  });
                  
                  if (notFoundWithSuggestions.length === 0) {
                    console.log('⚠️ No suggestions to display');
                    return null;
                  }
                  
                  // Flatten all suggestions from all notFoundMedicines
                  const allSuggestions: any[] = [];
                  notFoundWithSuggestions.forEach(item => {
                    if (item.suggestions && Array.isArray(item.suggestions)) {
                      item.suggestions.forEach(suggestion => {
                        if (suggestion && suggestion.productId) {
                          // Avoid duplicates
                          if (!allSuggestions.find(s => s.productId === suggestion.productId)) {
                            allSuggestions.push(suggestion);
                          }
                        }
                      });
                    }
                  });
                  
                  console.log(`✅ Total unique suggestions to display: ${allSuggestions.length}`);
                  
                  if (allSuggestions.length === 0) {
                    console.log('⚠️ No valid suggestions after flattening');
                    return null;
                  }
                  
                  return (
                    <View style={styles.medicinesContainer}>
                      <View style={styles.sectionHeader}>
                        <Ionicons name="search" size={20} color={COLORS.warning} />
                        <Text style={styles.sectionTitle}>Đề xuất thuốc tương tự ({allSuggestions.length})</Text>
                      </View>
                      {allSuggestions.map((suggestion, sIndex) => {
                        if (!suggestion || !suggestion.productId) {
                          console.log(`⚠️ Skipping invalid suggestion at index ${sIndex}`);
                          return null;
                        }
                        
                        const isSelected = selectedItems.some(
                          item => item.productId === suggestion.productId
                        );
                        const selectedItem = selectedItems.find(
                          item => item.productId === suggestion.productId
                        );
                        
                        return (
                          <View key={`suggestion-${suggestion.productId}-${sIndex}`} style={styles.suggestionCard}>
                            <View style={styles.suggestionInfo}>
                              <Text style={styles.suggestionName}>{suggestion.productName || 'Không xác định'}</Text>
                              <Text style={styles.suggestionPrice}>
                                {suggestion.price ? suggestion.price.toLocaleString('vi-VN') : '0'} ₫ / {suggestion.unit || 'sản phẩm'}
                              </Text>
                              <View style={styles.suggestionMeta}>
                                {suggestion.confidence !== undefined && (
                                  <View style={styles.confidenceBadge}>
                                    <Ionicons 
                                      name="checkmark-circle" 
                                      size={12} 
                                      color={suggestion.confidence >= 0.8 ? COLORS.success : suggestion.confidence >= 0.6 ? COLORS.warning : COLORS.error} 
                                    />
                                    <Text style={[
                                      styles.confidenceText,
                                      { color: suggestion.confidence >= 0.8 ? COLORS.success : suggestion.confidence >= 0.6 ? COLORS.warning : COLORS.error }
                                    ]}>
                                      {(suggestion.confidence * 100).toFixed(0)}% khớp
                                    </Text>
                                  </View>
                                )}
                                {suggestion.matchReason && (
                                  <Text style={styles.matchReason}>
                                    {suggestion.matchReason === 'same_name_same_dosage' && 'Cùng tên, cùng liều'}
                                    {suggestion.matchReason === 'same_name_different_dosage' && 'Cùng tên, khác liều'}
                                    {suggestion.matchReason === 'similar_name' && 'Tên tương tự'}
                                    {suggestion.matchReason === 'partial_name_match' && 'Tên gần giống'}
                                    {suggestion.matchReason === 'keyword_match' && 'Khớp từ khóa'}
                                    {suggestion.matchReason === 'popular_medicine' && 'Thuốc phổ biến'}
                                    {suggestion.matchReason === 'general_suggestion' && 'Đề xuất chung'}
                                  </Text>
                                )}
                              </View>
                            </View>
                            <View style={styles.suggestionActions}>
                              {isSelected ? (
                                <View style={styles.quantitySelector}>
                                  <TouchableOpacity
                                    style={styles.quantityButton}
                                    onPress={() => {
                                      if (selectedItem && selectedItem.quantity > 1) {
                                        setSelectedItems(selectedItems.map(item =>
                                          item.productId === suggestion.productId
                                            ? { ...item, quantity: item.quantity - 1 }
                                            : item
                                        ));
                                      } else {
                                        setSelectedItems(selectedItems.filter(
                                          item => item.productId !== suggestion.productId
                                        ));
                                      }
                                    }}
                                  >
                                    <Ionicons name="remove" size={16} color={COLORS.text} />
                                  </TouchableOpacity>
                                  <Text style={styles.quantityText}>
                                    {selectedItem?.quantity || 0}
                                  </Text>
                                  <TouchableOpacity
                                    style={styles.quantityButton}
                                    onPress={() => {
                                      setSelectedItems(selectedItems.map(item =>
                                        item.productId === suggestion.productId
                                          ? { ...item, quantity: item.quantity + 1 }
                                          : item
                                      ));
                                    }}
                                  >
                                    <Ionicons name="add" size={16} color={COLORS.text} />
                                  </TouchableOpacity>
                                </View>
                              ) : (
                                <TouchableOpacity
                                  style={styles.addSuggestionButton}
                                  onPress={() => {
                                    setSelectedItems([...selectedItems, {
                                      productId: suggestion.productId,
                                      quantity: 1,
                                    }]);
                                  }}
                                >
                                  <Ionicons name="add" size={16} color={COLORS.primary} />
                                  <Text style={styles.addSuggestionText}>Thêm</Text>
                                </TouchableOpacity>
                              )}
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  );
                })()}

              </>
            )}
          </ScrollView>

          <View style={styles.modalFooter}>
            <Button
              title="Đóng"
              onPress={() => setShowAnalysisModal(false)}
              variant="outline"
              style={styles.modalButton}
            />
            <Button
              title="Tạo đơn hàng"
              onPress={handleCreateOrderFromAnalysis}
              style={styles.modalButton}
              disabled={selectedItems.length === 0}
            />
          </View>
        </View>
      </Modal>

      {/* Order Form Modal */}
      <Modal
        visible={showOrderModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setShowOrderModal(false);
          // Clear snapshot when closing modal (user might want to change items)
          // setSnapshotItems([]);
        }}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Tạo đơn hàng</Text>
            <TouchableOpacity onPress={() => setShowOrderModal(false)}>
              <Ionicons name="close" size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            <View style={styles.orderSummary}>
              <Text style={styles.summaryTitle}>Sản phẩm đã chọn:</Text>
              {analysisResult && (snapshotItems.length > 0 ? snapshotItems : selectedItems).map((item, index) => {
                const medicine = getMedicineInfo(item.productId);
                if (!medicine) return null;
                return (
                  <View key={index} style={styles.orderItem}>
                    <Text style={styles.orderItemName}>{medicine.productName}</Text>
                    <Text style={styles.orderItemQuantity}>
                      {item.quantity} x {medicine.price.toLocaleString('vi-VN')} ₫
                    </Text>
                  </View>
                );
              })}
              {discountAmount > 0 && (
                <View style={styles.orderDiscount}>
                  <Text style={styles.discountLabel}>Giảm giá:</Text>
                  <Text style={styles.discountAmount}>
                    -{discountAmount.toLocaleString('vi-VN')} ₫
                  </Text>
                </View>
              )}
              <View style={styles.orderTotal}>
                <Text style={styles.totalLabel}>Tổng tiền:</Text>
                <Text style={styles.totalAmount}>
                  {analysisResult && ((snapshotItems.length > 0 ? snapshotItems : selectedItems).reduce((sum, item) => {
                    if (!item.productId || !item.quantity || item.quantity <= 0) return sum;
                    const medicine = getMedicineInfo(item.productId);
                    if (!medicine) return sum;
                    return sum + (medicine.price * item.quantity);
                  }, 0) - discountAmount).toLocaleString('vi-VN')} ₫
                </Text>
              </View>
            </View>

            {/* Quick address picker */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Địa chỉ giao hàng</Text>
                <TouchableOpacity onPress={() => setShowAddressPicker(true)}>
                  <Text style={styles.quickSelectText}>Chọn nhanh</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.quickAddressCard}>
                <Text style={styles.quickAddressName}>{shippingAddress.fullName || 'Chưa chọn'}</Text>
                {shippingAddress.phone ? (
                  <Text style={styles.quickAddressPhone}>{shippingAddress.phone}</Text>
                ) : null}
                <Text style={styles.quickAddressAddress}>
                  {renderAddressSummary(shippingAddress) || 'Vui lòng chọn địa chỉ'}
                </Text>
              </View>
            </View>

            <AddressForm
              address={legacyToAddress(shippingAddress)}
              onChange={(addr) => setShippingAddress(addressToLegacy(addr))}
              errors={addressErrors as Partial<Record<keyof Address, string>>}
            />

            <View style={styles.paymentSection}>
              <CouponSelector
                appliedCoupon={appliedCoupon}
                onCouponApplied={(coupon, discount) => {
                  setAppliedCoupon(coupon);
                  setDiscountAmount(discount);
                }}
                onCouponRemoved={() => {
                  setAppliedCoupon(null);
                  setDiscountAmount(0);
                }}
                subtotal={analysisResult && (snapshotItems.length > 0 ? snapshotItems : selectedItems).reduce((sum, item) => {
                  if (!item.productId || !item.quantity || item.quantity <= 0) return sum;
                  const medicine = getMedicineInfo(item.productId);
                  if (!medicine) return sum;
                  return sum + (medicine.price * item.quantity);
                }, 0) || 0}
              />
            </View>

            <View style={styles.paymentSection}>
              <PaymentMethodSelector
                selectedMethod={paymentMethod}
                onSelect={setPaymentMethod}
              />
            </View>
          </ScrollView>

          <View style={styles.modalFooter}>
            <Button
              title="Hủy"
              onPress={() => setShowOrderModal(false)}
              variant="outline"
              style={styles.modalButton}
            />
            <Button
              title="Xác nhận đặt hàng"
              onPress={handleCreateOrderFromPrescription}
              style={styles.modalButton}
              loading={isProcessing}
            />
          </View>
        </View>
      </Modal>

      {/* Quick Address Picker Modal */}
      <Modal
        visible={showAddressPicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAddressPicker(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Chọn địa chỉ</Text>
            <TouchableOpacity onPress={() => setShowAddressPicker(false)}>
              <Ionicons name="close" size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            {addressesData?.data && addressesData.data.length > 0 ? (
              addressesData.data.map((addr: Address) => {
                const isSelected = selectedAddressId === addr._id;
                const summary = renderAddressSummary(addressToLegacy(addr));
                return (
                  <TouchableOpacity
                    key={addr._id || summary}
                    style={[
                      styles.addressOption,
                      isSelected && styles.addressOptionSelected,
                    ]}
                    onPress={() => handleSelectQuickAddress(addr)}
                  >
                    <View style={styles.addressOptionContent}>
                      <View style={styles.addressOptionHeader}>
                        <Text style={styles.addressOptionName}>{addr.receiverName}</Text>
                        {addr.isDefault && (
                          <View style={styles.defaultBadge}>
                            <Text style={styles.defaultBadgeText}>Mặc định</Text>
                          </View>
                        )}
                      </View>
                      {addr.receiverPhone ? (
                        <Text style={styles.addressOptionPhone}>{addr.receiverPhone}</Text>
                      ) : null}
                      {summary ? (
                        <Text style={styles.addressOptionAddress}>{summary}</Text>
                      ) : null}
                      {addr.addressType && (
                        <Text style={styles.addressOptionType}>
                          {addr.addressType === 'home' ? '🏠 Nhà riêng' : '🏢 Công ty'}
                        </Text>
                      )}
                    </View>
                    {isSelected && (
                      <Ionicons name="checkmark-circle" size={24} color={COLORS.primary} />
                    )}
                  </TouchableOpacity>
                );
              })
            ) : (
              <View style={styles.emptyAddressList}>
                <Text style={styles.emptyAddressText}>Chưa có địa chỉ nào</Text>
                <TouchableOpacity
                  style={styles.addAddressButton}
                  onPress={() => {
                    setShowAddressPicker(false);
                    (navigation as any).navigate('AddressList');
                  }}
                >
                  <Text style={styles.addAddressButtonText}>Thêm địa chỉ</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>

          <View style={styles.modalFooter}>
            <Button
              title="Đóng"
              variant="outline"
              onPress={() => setShowAddressPicker(false)}
              style={styles.modalButton}
            />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    backgroundColor: COLORS.primary,
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.9,
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
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  autoFillBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.success + '15',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  autoFillText: {
    fontSize: 11,
    color: COLORS.success,
    fontWeight: '500',
  },
  imagePicker: {
    borderWidth: 2,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    borderRadius: 8,
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
  },
  imagePickerText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.primary,
    marginTop: 12,
  },
  imagePickerSubtext: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  imagePreview: {
    position: 'relative',
    borderRadius: 8,
    overflow: 'hidden',
  },
  previewImage: {
    width: '100%',
    height: 300,
    backgroundColor: COLORS.border,
  },
  removeImageButton: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  actionsContainer: {
    padding: 16,
    marginTop: 12,
  },
  actionButton: {
    marginBottom: 12,
  },
  recentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: COLORS.background,
    borderRadius: 8,
    marginBottom: 8,
  },
  recentItemInfo: {
    flex: 1,
    marginLeft: 12,
  },
  recentItemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
  },
  recentItemDate: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  modalHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  viewImageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: COLORS.background,
    borderRadius: 8,
  },
  viewImageText: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '500',
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  modalFooter: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: 12,
  },
  modalButton: {
    flex: 1,
  },
  analysisSummary: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
  },
  summaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  summaryText: {
    marginLeft: 8,
    fontSize: 14,
    color: COLORS.text,
  },
  notesContainer: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
  },
  notesTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 8,
  },
  noteText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  analysisNotesContainer: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
  },
  analysisNotesTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 12,
  },
  analysisNoteItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
    gap: 8,
  },
  analysisNoteText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 20,
  },
  geminiNoteText: {
    color: COLORS.primary,
    fontWeight: '500',
  },
  geminiSafetyText: {
    color: COLORS.warning,
    fontWeight: '500',
  },
  geminiRecommendationText: {
    color: COLORS.primary,
    fontStyle: 'italic',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  medicinesContainer: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
  },
  medicineItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  medicineInfo: {
    flex: 1,
  },
  medicineName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
  },
  medicinePrice: {
    fontSize: 14,
    color: COLORS.primary,
    marginBottom: 4,
  },
  originalText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
    marginTop: 2,
    marginBottom: 4,
  },
  medicineMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  confidenceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.background,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  confidenceText: {
    fontSize: 11,
    fontWeight: '600',
  },
  prescriptionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff3cd',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  prescriptionText: {
    fontSize: 12,
    color: COLORS.warning,
    marginLeft: 4,
  },
  outOfStockText: {
    fontSize: 12,
    color: COLORS.error,
    marginTop: 4,
  },
  quantitySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: 8,
    padding: 4,
  },
  quantityButton: {
    padding: 8,
  },
  quantityText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    minWidth: 30,
    textAlign: 'center',
  },
  notFoundContainer: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
  },
  notFoundItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    marginBottom: 12,
  },
  notFoundHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  notFoundText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    flex: 1,
  },
  suggestionsContainer: {
    marginTop: 8,
    paddingLeft: 4,
  },
  suggestionsTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  suggestionCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  suggestionInfo: {
    flex: 1,
    marginRight: 12,
  },
  suggestionName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
  },
  suggestionPrice: {
    fontSize: 13,
    color: COLORS.primary,
    marginBottom: 6,
  },
  suggestionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  matchReason: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
  },
  suggestionActions: {
    alignItems: 'center',
  },
  addSuggestionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: COLORS.primary + '15',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  addSuggestionText: {
    fontSize: 13,
    color: COLORS.primary,
    fontWeight: '600',
  },
  orderSummary: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 12,
  },
  orderItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  orderItemName: {
    fontSize: 14,
    color: COLORS.text,
    flex: 1,
  },
  orderItemQuantity: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  orderTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 2,
    borderTopColor: COLORS.primary,
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  totalAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  quickSelectText: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  quickAddressCard: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: 8,
  },
  quickAddressName: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  quickAddressPhone: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  quickAddressAddress: {
    fontSize: 13,
    color: COLORS.text,
    marginTop: 4,
  },
  orderDiscount: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 8,
  },
  discountLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  discountAmount: {
    fontSize: 14,
    color: COLORS.success || '#28a745',
    fontWeight: '600',
  },
  addressOption: {
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 12,
  },
  addressOptionSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + '10',
  },
  addressOptionContent: {
    gap: 6,
  },
  addressOptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addressOptionName: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    flex: 1,
  },
  addressOptionPhone: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  addressOptionAddress: {
    fontSize: 13,
    color: COLORS.text,
  },
  addressOptionType: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  emptyAddressList: {
    alignItems: 'center',
    padding: 24,
    gap: 12,
  },
  emptyAddressText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  addAddressButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: COLORS.primary,
    borderRadius: 8,
  },
  addAddressButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  paymentSection: {
    marginTop: 16,
  },
});

