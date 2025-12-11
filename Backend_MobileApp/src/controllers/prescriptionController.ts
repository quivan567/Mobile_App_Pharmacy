import { Request, Response } from 'express';
import { Prescription, User } from '../models/schema.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { config } from '../config/index.js';

export class PrescriptionController {
  // Create new prescription (authenticated)
  static async createPrescription(req: AuthenticatedRequest, res: Response) {
    try {
      const { 
        customerName, 
        phoneNumber, 
        note, 
        imageUrl,
        doctorName,
        hospitalName,
        examinationDate
      } = req.body;

      // Validate required fields
      if (!customerName || !phoneNumber || !imageUrl || !doctorName || !hospitalName || !examinationDate) {
        return res.status(400).json({
          success: false,
          message: 'Customer name, phone number, image URL, doctor name, hospital name, and examination date are required',
        });
      }

      // Get userId from authenticated request - REQUIRED
      if (!req.user?.id) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
      }

      const userId = req.user.id;

      // Create prescription
      const prescription = await Prescription.create({
        userId: userId,
        customerName: customerName,
        phoneNumber: phoneNumber,
        doctorName: doctorName,
        hospitalName: hospitalName,
        prescriptionImage: imageUrl,
        examinationDate: examinationDate ? new Date(examinationDate) : undefined,
        status: 'pending',
        notes: note || '',
      });

      res.status(201).json({
        success: true,
        message: 'Prescription created successfully',
        data: {
          id: prescription._id.toString(),
          customerName: prescription.customerName,
          phoneNumber: prescription.phoneNumber,
          note: prescription.notes || '',
          imageUrl: prescription.prescriptionImage,
          doctorName: prescription.doctorName,
          hospitalName: prescription.hospitalName,
          examinationDate: prescription.examinationDate?.toISOString().split('T')[0],
          createdAt: prescription.createdAt.toLocaleString('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          }),
          status: 'Chờ tư vấn'
        },
      });
    } catch (error) {
      console.error('Create prescription error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }

  // Get user's prescriptions (authenticated)
  static async getUserPrescriptions(req: AuthenticatedRequest, res: Response) {
    try {
      const { page = 1, limit = 20, status } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      // Get userId from authenticated request - REQUIRED
      if (!req.user?.id) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
      }

      const userId = req.user.id;

      // Build filter
      const filter: any = { userId };
      if (status) {
        filter.status = status;
      }

      const prescriptions = await Prescription.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit));

      const total = await Prescription.countDocuments(filter);

      // Transform prescriptions to match frontend format with actual data
      const transformedPrescriptions = prescriptions.map(prescription => {
        // Convert file path to accessible URL if it's a local path
        let imageUrl = prescription.prescriptionImage;
        if (imageUrl && !imageUrl.startsWith('http') && !imageUrl.startsWith('blob:')) {
          // If it's a local file path, convert to accessible URL
          if (imageUrl.startsWith('uploads/prescriptions/')) {
            imageUrl = `${config.baseUrl || 'http://localhost:5000'}/${imageUrl}`;
          } else if (imageUrl.startsWith('/')) {
            imageUrl = `${config.baseUrl || 'http://localhost:5000'}${imageUrl}`;
          }
        }

        return {
          id: prescription._id.toString(),
          customerName: prescription.customerName || 'Không xác định',
          phoneNumber: prescription.phoneNumber || 'Không có',
          note: prescription.notes || '',
          imageUrl: imageUrl,
          doctorName: prescription.doctorName || 'Không xác định',
          hospitalName: prescription.hospitalName || 'Không xác định',
          examinationDate: prescription.examinationDate?.toISOString().split('T')[0],
          createdAt: prescription.createdAt.toLocaleString('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          }),
          status: prescription.status === 'pending' ? 'Chờ tư vấn' :
                  prescription.status === 'approved' ? 'Đã tư vấn' :
                  prescription.status === 'rejected' ? 'Đã từ chối' : 'Đã lưu',
          rejectionReason: prescription.rejectionReason || (prescription.status === 'rejected' ? 'Đơn thuốc không hợp lệ' : undefined)
        };
      });

      res.json({
        success: true,
        data: transformedPrescriptions,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit)),
        },
      });
    } catch (error) {
      console.error('Get user prescriptions error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }

  // Get prescription by ID (authenticated)
  static async getPrescriptionById(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;

      // Get userId from authenticated request - REQUIRED
      if (!req.user?.id) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
      }

      const userId = req.user.id;

      const prescription = await Prescription.findOne({ 
        _id: id, 
        userId: userId 
      });

      if (!prescription) {
        return res.status(404).json({
          success: false,
          message: 'Prescription not found',
        });
      }

      // Transform prescription to match frontend format with actual data from database
      // Convert file path to accessible URL if it's a local path
      let imageUrl = prescription.prescriptionImage;
      if (imageUrl && !imageUrl.startsWith('http') && !imageUrl.startsWith('blob:')) {
        // If it's a local file path, convert to accessible URL
        const baseUrl = process.env.BASE_URL || `http://localhost:${config.port}`;
        if (imageUrl.startsWith('uploads/prescriptions/')) {
          imageUrl = `${baseUrl}/${imageUrl}`;
        } else if (imageUrl.startsWith('/')) {
          imageUrl = `${baseUrl}${imageUrl}`;
        }
      }

      const transformedPrescription = {
        id: prescription._id.toString(),
        customerName: prescription.customerName || 'Không xác định',
        phoneNumber: prescription.phoneNumber || 'Không có',
        note: prescription.notes || '',
        imageUrl: imageUrl,
        doctorName: prescription.doctorName || 'Không xác định',
        hospitalName: prescription.hospitalName || 'Không xác định',
        examinationDate: prescription.examinationDate?.toISOString().split('T')[0],
        createdAt: prescription.createdAt.toLocaleString('vi-VN', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        }),
        status: prescription.status === 'pending' ? 'Chờ tư vấn' :
                prescription.status === 'approved' ? 'Đã tư vấn' :
                prescription.status === 'rejected' ? 'Đã từ chối' : 'Đã lưu',
        rejectionReason: prescription.rejectionReason || (prescription.status === 'rejected' ? 'Đơn thuốc không hợp lệ' : undefined)
      };

      res.json({
        success: true,
        data: transformedPrescription,
      });
    } catch (error) {
      console.error('Get prescription by ID error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }

  // Update prescription status (authenticated)
  static async updatePrescriptionStatus(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      const { status, rejectionReason } = req.body;

      if (!status || !['pending', 'approved', 'rejected', 'saved'].includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Valid status is required',
        });
      }

      const prescription = await Prescription.findOne({ 
        _id: id, 
        userId: req.user!.id 
      });

      if (!prescription) {
        return res.status(404).json({
          success: false,
          message: 'Prescription not found',
        });
      }

      const updateData: any = { status };
      if (rejectionReason) {
        updateData.rejectionReason = rejectionReason;
      }

      const updatedPrescription = await Prescription.findByIdAndUpdate(
        id,
        updateData,
        { new: true }
      );

      res.json({
        success: true,
        message: 'Prescription status updated successfully',
        data: updatedPrescription,
      });
    } catch (error) {
      console.error('Update prescription status error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }

  // Delete prescription (authenticated)
  static async deletePrescription(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;

      const prescription = await Prescription.findOne({ 
        _id: id, 
        userId: req.user!.id 
      });

      if (!prescription) {
        return res.status(404).json({
          success: false,
          message: 'Prescription not found',
        });
      }

      await Prescription.findByIdAndDelete(id);

      res.json({
        success: true,
        message: 'Prescription deleted successfully',
      });
    } catch (error) {
      console.error('Delete prescription error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }

  // Get prescription statistics (authenticated)
  static async getPrescriptionStats(req: AuthenticatedRequest, res: Response) {
    try {
      // Get userId from authenticated request - REQUIRED
      if (!req.user?.id) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
      }

      const userId = req.user.id;

      const stats = await Prescription.aggregate([
        { $match: { userId: userId } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]);

      const result: any = {
        total: 0,
        pending: 0,
        approved: 0,
        rejected: 0,
        saved: 0
      };

      stats.forEach(stat => {
        result.total += stat.count;
        if (stat._id && result.hasOwnProperty(stat._id)) {
          result[stat._id] = stat.count;
        }
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('Get prescription stats error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }
}
