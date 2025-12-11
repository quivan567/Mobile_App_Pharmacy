import { apiClient } from './client';

export interface Prescription {
  _id: string;
  userId: string;
  doctorName?: string;
  hospitalName?: string;
  prescriptionImage?: string;
  status: 'pending' | 'processing' | 'completed' | 'cancelled';
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface PrescriptionStats {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  cancelled: number;
}

export interface CreatePrescriptionRequest {
  doctorName?: string;
  hospitalName?: string;
  notes?: string;
  prescriptionImage?: any; // File/FormData
}

// Helper function to map backend status to frontend status
const mapStatusToFrontend = (status: string): 'pending' | 'processing' | 'completed' | 'cancelled' => {
  switch (status) {
    case 'pending':
    case 'Chờ tư vấn':
      return 'pending';
    case 'approved':
    case 'Đã tư vấn':
      return 'processing';
    case 'saved':
    case 'Đã lưu':
      return 'completed';
    case 'rejected':
    case 'Đã từ chối':
      return 'cancelled';
    default:
      return 'pending';
  }
};

export const prescriptionsApi = {
  createPrescription: async (data: CreatePrescriptionRequest): Promise<{ success: boolean; data: Prescription; message?: string }> => {
    // For file upload, we'll need to use FormData
    const formData = new FormData();
    if (data.doctorName) formData.append('doctorName', data.doctorName);
    if (data.hospitalName) formData.append('hospitalName', data.hospitalName);
    if (data.notes) formData.append('notes', data.notes);
    if (data.prescriptionImage) {
      formData.append('prescriptionImage', {
        uri: data.prescriptionImage.uri,
        type: data.prescriptionImage.type || 'image/jpeg',
        name: data.prescriptionImage.name || 'prescription.jpg',
      } as any);
    }
    
    return apiClient.post('/api/prescriptions', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },

  getUserPrescriptions: async (params?: {
    page?: number;
    limit?: number;
    status?: string;
  }): Promise<{ success: boolean; data: Prescription[]; total?: number }> => {
    const response = await apiClient.get<any>('/api/prescriptions', { params });
    // Transform backend response to frontend format
    if (response.success && response.data) {
      const transformedData = response.data.map((item: any) => ({
        _id: item.id || item._id,
        userId: item.userId || '',
        doctorName: item.doctorName,
        hospitalName: item.hospitalName,
        prescriptionImage: item.imageUrl || item.prescriptionImage,
        status: mapStatusToFrontend(item.status),
        notes: item.note || item.notes,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      }));
      return {
        success: true,
        data: transformedData,
        total: response.pagination?.total || response.total || transformedData.length,
      };
    }
    return response;
  },

  getPrescriptionStats: async (): Promise<{ success: boolean; data: PrescriptionStats }> => {
    const response = await apiClient.get<any>('/api/prescriptions/stats');
    // Transform backend stats to frontend format
    if (response.success && response.data) {
      return {
        success: true,
        data: {
          total: response.data.total || 0,
          pending: response.data.pending || 0,
          processing: response.data.approved || 0, // Map approved to processing
          completed: response.data.saved || 0, // Map saved to completed
          cancelled: response.data.rejected || 0, // Map rejected to cancelled
        },
      };
    }
    return response;
  },

  getPrescriptionById: async (id: string): Promise<{ success: boolean; data: Prescription }> => {
    const response = await apiClient.get<any>(`/api/prescriptions/${id}`);
    // Transform backend response to frontend format
    if (response.success && response.data) {
      const item = response.data;
      return {
        success: true,
        data: {
          _id: item.id || item._id,
          userId: item.userId || '',
          doctorName: item.doctorName,
          hospitalName: item.hospitalName,
          prescriptionImage: item.imageUrl || item.prescriptionImage,
          status: mapStatusToFrontend(item.status),
          notes: item.note || item.notes,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        },
      };
    }
    return response;
  },

  updatePrescriptionStatus: async (id: string, status: string): Promise<{ success: boolean; data: Prescription; message?: string }> => {
    return apiClient.put(`/api/prescriptions/${id}/status`, { status });
  },

  deletePrescription: async (id: string): Promise<{ success: boolean; message?: string }> => {
    return apiClient.delete(`/api/prescriptions/${id}`);
  },
};

