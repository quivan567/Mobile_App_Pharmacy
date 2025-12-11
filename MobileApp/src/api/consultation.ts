import { apiClient } from './client';

export interface ConsultationPrescription {
  _id: string;
  userId: string;
  doctorName?: string;
  hospitalName?: string;
  prescriptionImage?: string;
  status: 'pending' | 'processing' | 'completed' | 'cancelled';
  notes?: string;
  analysisResult?: any;
  createdAt: string;
  updatedAt?: string;
}

export interface ConsultationHistory {
  _id: string;
  prescriptionId: string;
  type: 'order' | 'save' | 'analysis';
  status: string;
  createdAt: string;
}

export interface AnalyzePrescriptionRequest {
  imageUrl?: string | { uri: string; type?: string; name?: string }; // Local file URI or ImagePicker result object
  prescriptionId?: string; // ID from database - image already saved
  prescriptionText?: string; // Optional text input
  notes?: string;
  doctorName?: string; // Optional - used when auto-saving prescription
  hospitalName?: string; // Optional - used when auto-saving prescription
}

export interface AnalyzePrescriptionResponse {
  foundMedicines: Array<{
    productId: string;
    productName: string;
    price: number;
    unit: string;
    inStock: boolean;
    stockQuantity: number;
    requiresPrescription: boolean;
    confidence: number;
    originalText: string;
    quantity?: number;
  }>;
  notFoundMedicines: Array<{
    originalText: string;
    suggestions: Array<{
      productId: string;
      productName: string;
      price: number;
      unit: string;
      confidence?: number;
      matchReason?: string;
    }>;
  }>;
  totalEstimatedPrice: number;
  requiresConsultation: boolean;
  analysisNotes: string[];
  confidence: number;
  analysisTimestamp: string;
  aiModel: string;
  prescriptionId?: string;
  orderItems?: Array<{
    productId: string;
    quantity: number;
    productName: string;
    price: number;
  }>;
  extractedInfo?: {
    customerName?: string;
    phoneNumber?: string;
    doctorName?: string;
    hospitalName?: string;
    examinationDate?: string;
    diagnosis?: string;
    notes?: string;
    rawText?: string;
  };
}

export const consultationApi = {
  scanPrescription: async (data: {
    prescriptionImage: any;
  }): Promise<{ success: boolean; data: any; message?: string }> => {
    if (!data.prescriptionImage) {
      throw new Error('Prescription image is required');
    }

    // Check if imageUrl is a string (URI) or object (from ImagePicker)
    let imageFile: any;
    if (typeof data.prescriptionImage === 'string') {
      // If it's a string URI, convert to object format for FormData
      imageFile = {
        uri: data.prescriptionImage,
        type: 'image/jpeg',
        name: 'prescription.jpg',
      };
    } else if (typeof data.prescriptionImage === 'object' && data.prescriptionImage !== null) {
      // If it's already an object (from ImagePicker), use it directly
      imageFile = data.prescriptionImage;
    } else {
      throw new Error('Invalid prescriptionImage format. Expected string URI or object with uri, type, name');
    }

    // Convert to FormData for upload
    const formData = new FormData();
    formData.append('prescriptionImage', {
      uri: imageFile.uri,
      type: imageFile.type || 'image/jpeg',
      name: imageFile.name || 'prescription.jpg',
    } as any);

    // Use fetch API instead of axios for FormData in React Native
    // React Native's fetch API handles FormData better than axios
    const token = await (await import('../utils/storage')).authStorage.getToken();
    const { API_BASE_URL } = await import('../utils/constants');

    // Build headers
    const headers: any = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    // Don't set Content-Type - fetch will set it automatically with boundary for FormData

    // Use fetch API for FormData upload in React Native
    console.log('=== scanPrescription API Call ===');
    console.log('URL:', `${API_BASE_URL}/api/consultation/scan`);
    console.log('Method: POST');
    console.log('Has token:', !!token);
    console.log('Image file:', {
      uri: imageFile.uri,
      type: imageFile.type,
      name: imageFile.name,
    });

    try {
      const response = await fetch(`${API_BASE_URL}/api/consultation/scan`, {
        method: 'POST',
        headers,
        body: formData,
      });

      console.log('Response status:', response.status);
      console.log('Response ok:', response.ok);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
        console.error('Error response:', errorData);
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }

      const responseData = await response.json();
      console.log('Success response:', responseData);
      return {
        success: responseData.success,
        data: responseData.data,
        message: responseData.message,
      };
    } catch (error: any) {
      console.error('=== scanPrescription Error ===');
      console.error('Error type:', error?.name);
      console.error('Error message:', error?.message);
      console.error('API_BASE_URL:', API_BASE_URL);
      
      // Provide more helpful error messages
      if (error?.message === 'Network request failed' || error?.name === 'TypeError') {
        const isLocalhost = API_BASE_URL.includes('localhost') || API_BASE_URL.includes('127.0.0.1');
        let errorMessage = 'Không thể kết nối đến server.';
        
        if (isLocalhost) {
          errorMessage += '\n\nNếu bạn đang test trên điện thoại thật, vui lòng:';
          errorMessage += '\n1. Kiểm tra Backend đang chạy';
          errorMessage += '\n2. Thay localhost bằng IP máy tính trong file .env';
          errorMessage += '\n3. Đảm bảo điện thoại và máy tính cùng mạng WiFi';
        } else {
          errorMessage += '\n\nVui lòng kiểm tra:';
          errorMessage += '\n1. Backend đang chạy';
          errorMessage += '\n2. API URL: ' + API_BASE_URL;
          errorMessage += '\n3. Kết nối mạng';
        }
        
        throw new Error(errorMessage);
      }
      
      throw error;
    }
  },
  createPrescriptionOrder: async (data: {
    prescriptionImage: any;
    doctorName?: string;
    hospitalName?: string;
    notes?: string;
    customerName?: string;
    phoneNumber?: string;
  }): Promise<{ success: boolean; data: ConsultationPrescription; message?: string }> => {
    const formData = new FormData();
    if (data.doctorName) formData.append('doctorName', data.doctorName);
    if (data.hospitalName) formData.append('hospitalName', data.hospitalName);
    if (data.notes) formData.append('notes', data.notes);
    if (data.customerName) formData.append('customerName', data.customerName);
    if (data.phoneNumber) formData.append('phoneNumber', data.phoneNumber);
    if (data.prescriptionImage) {
      formData.append('prescriptionImage', {
        uri: data.prescriptionImage.uri,
        type: data.prescriptionImage.type || 'image/jpeg',
        name: data.prescriptionImage.name || 'prescription.jpg',
      } as any);
    }
    
    return apiClient.post('/api/consultation/order', formData);
  },

  savePrescription: async (data: {
    prescriptionImage: any;
    doctorName?: string;
    hospitalName?: string;
    notes?: string;
    suggestedMedicines?: Array<{
      productId: string;
      productName: string;
      price: number;
      unit: string;
      confidence?: number;
      matchReason?: string;
      originalText?: string;
    }>;
  }): Promise<{ success: boolean; data: ConsultationPrescription; message?: string }> => {
    const formData = new FormData();
    if (data.doctorName) formData.append('doctorName', data.doctorName);
    if (data.hospitalName) formData.append('hospitalName', data.hospitalName);
    if (data.notes) formData.append('notes', data.notes);
    if (data.suggestedMedicines && data.suggestedMedicines.length > 0) {
      formData.append('suggestedMedicines', JSON.stringify(data.suggestedMedicines));
    }
    if (data.prescriptionImage) {
      formData.append('prescriptionImage', {
        uri: data.prescriptionImage.uri,
        type: data.prescriptionImage.type || 'image/jpeg',
        name: data.prescriptionImage.name || 'prescription.jpg',
      } as any);
    }
    
    return apiClient.post('/api/consultation/save', formData);
  },

  getUserPrescriptions: async (params?: {
    page?: number;
    limit?: number;
  }): Promise<{ success: boolean; data: ConsultationPrescription[]; total?: number }> => {
    return apiClient.get('/api/consultation/prescriptions', { params });
  },

  getConsultationHistory: async (params?: {
    page?: number;
    limit?: number;
  }): Promise<{ success: boolean; data: ConsultationHistory[]; total?: number }> => {
    return apiClient.get('/api/consultation/history', { params });
  },

  getPrescriptionById: async (id: string): Promise<{ success: boolean; data: ConsultationPrescription }> => {
    return apiClient.get(`/api/consultation/prescriptions/${id}`);
  },

  updatePrescription: async (id: string, data: {
    doctorName?: string;
    hospitalName?: string;
    notes?: string;
    suggestedMedicines?: Array<{
      productId: string;
      productName: string;
      price: number;
      unit: string;
      confidence?: number;
      matchReason?: string;
      originalText?: string;
    }>;
  }): Promise<{ success: boolean; data: ConsultationPrescription; message?: string }> => {
    return apiClient.put(`/api/consultation/prescriptions/${id}`, data);
  },

  deletePrescription: async (id: string): Promise<{ success: boolean; message?: string }> => {
    return apiClient.delete(`/api/consultation/prescriptions/${id}`);
  },

  getPrescriptionImage: async (id: string): Promise<{ success: boolean; data: { imageUrl: string } }> => {
    return apiClient.get(`/api/consultation/prescriptions/${id}/image`);
  },

  analyzePrescription: async (data: AnalyzePrescriptionRequest): Promise<{ success: boolean; data: AnalyzePrescriptionResponse; message?: string }> => {
    // Option 1: Send file directly (upload and analyze in one request)
    // imageUrl should be an object with uri, type, name (from ImagePicker)
    if (data.imageUrl && !data.prescriptionId) {
      console.log('analyzePrescription - input data:', {
        imageUrl: data.imageUrl,
        imageUrlType: typeof data.imageUrl,
        isObject: typeof data.imageUrl === 'object' && data.imageUrl !== null,
        imageUrlKeys: typeof data.imageUrl === 'object' ? Object.keys(data.imageUrl) : null,
      });
      
      // Check if imageUrl is a string (URI) or object (from ImagePicker)
      let imageFile: any;
      if (typeof data.imageUrl === 'string') {
        // If it's a string URI, convert to object format for FormData
        imageFile = {
          uri: data.imageUrl,
          type: 'image/jpeg',
          name: 'prescription.jpg',
        };
        console.log('Converted string URI to image file object:', imageFile);
      } else if (typeof data.imageUrl === 'object' && data.imageUrl !== null) {
        // If it's already an object (from ImagePicker), use it directly
        imageFile = data.imageUrl;
        console.log('Using image object directly:', imageFile);
      } else {
        throw new Error('Invalid imageUrl format. Expected string URI or object with uri, type, name');
      }
      
      // Convert to FormData for upload
      // In React Native, FormData requires specific format for file uploads
      const formData = new FormData();
      
      // React Native FormData format: { uri, type, name }
      // IMPORTANT: In React Native, FormData.append for files requires the object format
      formData.append('prescriptionImage', {
        uri: imageFile.uri,
        type: imageFile.type || 'image/jpeg',
        name: imageFile.name || 'prescription.jpg',
      } as any);
      
      if (data.prescriptionText) formData.append('prescriptionText', data.prescriptionText);
      if (data.notes) formData.append('notes', data.notes);
      if (data.doctorName) formData.append('doctorName', data.doctorName);
      if (data.hospitalName) formData.append('hospitalName', data.hospitalName);
      
      // Debug: Check FormData structure
      console.log('=== FormData Creation ===');
      console.log('Image file:', {
        uri: imageFile.uri,
        type: imageFile.type || 'image/jpeg',
        name: imageFile.name || 'prescription.jpg',
      });
      console.log('FormData instance:', formData);
      console.log('Is FormData:', formData instanceof FormData);
      console.log('FormData _parts:', (formData as any)._parts);
      console.log('FormData _blob:', (formData as any)._blob);
      
      // Use fetch API instead of axios for FormData in React Native
      // React Native's fetch API handles FormData better than axios
      const token = await (await import('../utils/storage')).authStorage.getToken();
      const { API_BASE_URL } = await import('../utils/constants');
      
      console.log('=== Sending Request (using fetch) ===');
      console.log('URL:', `${API_BASE_URL}/api/consultation/analyze`);
      console.log('Method: POST');
      console.log('Data type:', typeof formData);
      console.log('Is FormData:', formData instanceof FormData);
      
      // Build headers
      const headers: any = {};
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      // Don't set Content-Type - fetch will set it automatically with boundary for FormData
      
      console.log('Request headers:', headers);
      
      // Use fetch API for FormData upload in React Native
      const response = await fetch(`${API_BASE_URL}/api/consultation/analyze`, {
        method: 'POST',
        headers,
        body: formData,
      });
      
      console.log('Response status:', response.status);
      console.log('Response ok:', response.ok);
      console.log('Response headers:', Object.fromEntries(response.headers.entries()));
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }
      
      const responseData = await response.json();
      console.log('Response data:', responseData);
      
      return {
        success: responseData.success,
        data: responseData.data,
        message: responseData.message,
      };
    }
    
    // Option 2: Send prescriptionId (image already in database)
    if (data.prescriptionId) {
      console.log('Sending analyze request with prescriptionId:', data.prescriptionId);
      return apiClient.post('/api/consultation/analyze', {
        prescriptionId: data.prescriptionId,
        prescriptionText: data.prescriptionText,
        notes: data.notes,
      });
    }

    throw new Error('Either prescriptionId or imageUrl is required');
  },

  createOrderFromPrescription: async (data: {
    prescriptionId: string;
    items: Array<{ productId: string; quantity: number }>;
    shippingAddress?: string;
    shippingPhone?: string;
    paymentMethod?: string;
    notes?: string;
    couponCode?: string;
  }): Promise<{ success: boolean; data: any; message?: string }> => {
    return apiClient.post('/api/consultation/create-order', data);
  },
};

