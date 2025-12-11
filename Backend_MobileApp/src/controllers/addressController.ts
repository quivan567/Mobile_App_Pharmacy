import { Request, Response } from 'express';
import { Address } from '../models/schema';
import { AuthenticatedRequest } from '../middleware/auth';

export class AddressController {
  // Get all addresses for the authenticated user
  static async getAddresses(req: AuthenticatedRequest, res: Response) {
    try {
      const addresses = await Address.find({ userId: req.user!.id })
        .sort({ isDefault: -1, createdAt: -1 })
        .lean();

      res.json({
        success: true,
        data: addresses,
      });
    } catch (error) {
      console.error('Get addresses error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }

  // Get a single address by ID
  static async getAddress(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      const address = await Address.findOne({
        _id: id,
        userId: req.user!.id,
      }).lean();

      if (!address) {
        return res.status(404).json({
          success: false,
          message: 'Address not found',
        });
      }

      res.json({
        success: true,
        data: address,
      });
    } catch (error) {
      console.error('Get address error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }

  // Create a new address
  static async createAddress(req: AuthenticatedRequest, res: Response) {
    try {
      const {
        receiverName,
        receiverPhone,
        province,
        provinceName,
        district,
        districtName,
        ward,
        wardName,
        address: addressDetail,
        addressType,
        isDefault,
      } = req.body;

      // Validate required fields
      if (!receiverName || !receiverPhone || !province || !district || !ward || !addressDetail) {
        return res.status(400).json({
          success: false,
          message: 'Vui lòng điền đầy đủ thông tin',
        });
      }

      // If this is set as default, unset other default addresses
      if (isDefault) {
        await Address.updateMany(
          { userId: req.user!.id },
          { $set: { isDefault: false } }
        );
      }

      const newAddress = new Address({
        userId: req.user!.id,
        receiverName,
        receiverPhone,
        province,
        provinceName,
        district,
        districtName,
        ward,
        wardName,
        address: addressDetail,
        addressType: addressType || 'home',
        isDefault: isDefault || false,
      });

      await newAddress.save();

      res.status(201).json({
        success: true,
        message: 'Địa chỉ đã được thêm thành công',
        data: newAddress,
      });
    } catch (error) {
      console.error('Create address error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }

  // Update an address
  static async updateAddress(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      const {
        receiverName,
        receiverPhone,
        province,
        provinceName,
        district,
        districtName,
        ward,
        wardName,
        address: addressDetail,
        addressType,
        isDefault,
      } = req.body;

      const address = await Address.findOne({
        _id: id,
        userId: req.user!.id,
      });

      if (!address) {
        return res.status(404).json({
          success: false,
          message: 'Address not found',
        });
      }

      // If this is set as default, unset other default addresses
      if (isDefault && !address.isDefault) {
        await Address.updateMany(
          { userId: req.user!.id, _id: { $ne: id } },
          { $set: { isDefault: false } }
        );
      }

      // Update fields
      if (receiverName) address.receiverName = receiverName;
      if (receiverPhone) address.receiverPhone = receiverPhone;
      if (province) address.province = province;
      if (provinceName) address.provinceName = provinceName;
      if (district) address.district = district;
      if (districtName) address.districtName = districtName;
      if (ward) address.ward = ward;
      if (wardName) address.wardName = wardName;
      if (addressDetail) address.address = addressDetail;
      if (addressType) address.addressType = addressType;
      if (typeof isDefault === 'boolean') address.isDefault = isDefault;

      await address.save();

      res.json({
        success: true,
        message: 'Địa chỉ đã được cập nhật thành công',
        data: address,
      });
    } catch (error) {
      console.error('Update address error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }

  // Delete an address
  static async deleteAddress(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      const address = await Address.findOneAndDelete({
        _id: id,
        userId: req.user!.id,
      });

      if (!address) {
        return res.status(404).json({
          success: false,
          message: 'Address not found',
        });
      }

      res.json({
        success: true,
        message: 'Địa chỉ đã được xóa thành công',
      });
    } catch (error) {
      console.error('Delete address error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }

  // Set an address as default
  static async setDefaultAddress(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;

      // Unset all other default addresses
      await Address.updateMany(
        { userId: req.user!.id },
        { $set: { isDefault: false } }
      );

      // Set this address as default
      const address = await Address.findOneAndUpdate(
        { _id: id, userId: req.user!.id },
        { $set: { isDefault: true } },
        { new: true }
      );

      if (!address) {
        return res.status(404).json({
          success: false,
          message: 'Address not found',
        });
      }

      res.json({
        success: true,
        message: 'Đã đặt làm địa chỉ mặc định',
        data: address,
      });
    } catch (error) {
      console.error('Set default address error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }
}

