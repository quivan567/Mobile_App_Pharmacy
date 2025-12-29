import { Response } from 'express';
import { Notification } from '../models/schema';
import { AuthenticatedRequest } from '../middleware/auth';
import { socketService } from '../services/socketService.js';
import { publishRealtimeEvent } from '../services/supabaseService.js';

export class NotificationController {
  // Get user's notifications
  static async getNotifications(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user!.id;
      const { type, isRead, limit = 50, offset = 0 } = req.query;

      const query: any = { userId };

      // Filter by type
      if (type && ['order', 'brand', 'promotion', 'health', 'news', 'system'].includes(type as string)) {
        query.type = type;
      }

      // Filter by read status
      if (isRead !== undefined) {
        query.isRead = isRead === 'true';
      }

      const notifications = await Notification.find(query)
        .sort({ createdAt: -1 })
        .limit(Number(limit))
        .skip(Number(offset))
        .lean();

      const total = await Notification.countDocuments(query);
      const unreadCount = await Notification.countDocuments({ userId, isRead: false });

      res.json({
        success: true,
        data: {
          notifications,
          total,
          unreadCount,
          limit: Number(limit),
          offset: Number(offset),
        }
      });
    } catch (error) {
      console.error('Get notifications error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Mark notification as read
  static async markAsRead(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user!.id;
      const { notificationId } = req.params;

      const notification = await Notification.findOne({
        _id: notificationId,
        userId,
      });

      if (!notification) {
        return res.status(404).json({
          success: false,
          message: 'Notification not found'
        });
      }

      notification.isRead = true;
      await notification.save();

      res.json({
        success: true,
        message: 'Notification marked as read',
        data: notification
      });
    } catch (error) {
      console.error('Mark notification as read error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Mark all notifications as read
  static async markAllAsRead(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user!.id;
      const { type } = req.body;

      const query: any = { userId, isRead: false };
      if (type && ['order', 'brand', 'promotion', 'health', 'news', 'system'].includes(type)) {
        query.type = type;
      }

      const result = await Notification.updateMany(query, { isRead: true });

      res.json({
        success: true,
        message: 'All notifications marked as read',
        data: {
          updatedCount: result.modifiedCount
        }
      });
    } catch (error) {
      console.error('Mark all notifications as read error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Get unread count
  static async getUnreadCount(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user!.id;

      const unreadCount = await Notification.countDocuments({
        userId,
        isRead: false,
      });

      res.json({
        success: true,
        data: {
          unreadCount
        }
      });
    } catch (error) {
      console.error('Get unread count error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Create notification (for system use)
  static async createNotification(
    userId: string,
    type: 'order' | 'brand' | 'promotion' | 'health' | 'news' | 'system',
    title: string,
    content: string,
    link?: string,
    metadata?: any
  ) {
    try {
      const notification = await Notification.create({
        userId: userId as any,
        type,
        title,
        content,
        link,
        metadata: metadata || {},
        isRead: false,
      });

      // Emit real-time event for new notification via Socket.IO
      socketService.emitToUser(userId, 'notification:new', {
        notification: notification.toObject(),
        message: title,
      });

      // Publish to Supabase real-time (if configured)
      await publishRealtimeEvent(
        `user:${userId}`,
        'notification:new',
        {
          notification: notification.toObject(),
          message: title,
        }
      );

      return notification;
    } catch (error: any) {
      console.error('Create notification error:', {
        error: error?.message || error,
        stack: error?.stack,
        userId,
        type,
        title,
      });
      return null;
    }
  }

  // Create notification for all active users (for promotions, news, brand, system)
  static async createNotificationForAllUsers(
    type: 'brand' | 'promotion' | 'health' | 'news' | 'system',
    title: string,
    content: string,
    link?: string,
    metadata?: any
  ) {
    try {
      const { User } = await import('../models/schema.js');
      const activeUsers = await User.find({ isActive: true, role: 'customer' }).select('_id').lean();
      
      if (activeUsers.length === 0) {
        console.log('No active users found for notification');
        return [];
      }

      const notifications = await Notification.insertMany(
        activeUsers.map((user) => ({
          userId: user._id,
          type,
          title,
          content,
          link,
          metadata: metadata || {},
          isRead: false,
        }))
      );

      // Emit real-time event for all users
      activeUsers.forEach((user) => {
        socketService.emitToUser(String(user._id), 'notification:new', {
          notification: {
            type,
            title,
            content,
            link,
            metadata: metadata || {},
            isRead: false,
          },
          message: title,
        });
      });

      console.log(`Created ${notifications.length} notifications for all active users`);
      return notifications;
    } catch (error) {
      console.error('Create notification for all users error:', error);
      return [];
    }
  }

  // Admin endpoint to create notification for all users
  static async createNotificationForAll(req: AuthenticatedRequest, res: Response) {
    try {
      // Check if user is admin
      if (req.user?.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Admin access required',
        });
      }

      const { type, title, content, link, metadata } = req.body;

      // Validate required fields
      if (!type || !title || !content) {
        return res.status(400).json({
          success: false,
          message: 'Type, title, and content are required',
        });
      }

      // Validate type
      if (!['brand', 'promotion', 'health', 'news', 'system'].includes(type)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid notification type. Must be one of: brand, promotion, health, news, system',
        });
      }

      const notifications = await NotificationController.createNotificationForAllUsers(
        type,
        title,
        content,
        link,
        metadata
      );

      res.json({
        success: true,
        message: `Notification created for ${notifications.length} users`,
        data: {
          count: notifications.length,
        },
      });
    } catch (error) {
      console.error('Create notification for all error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }
}

