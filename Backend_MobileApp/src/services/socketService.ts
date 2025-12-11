import { Server as HttpServer } from 'http';
import { Server as SocketServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { User } from '../models/schema.js';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userRole?: string;
}

class SocketService {
  private io: SocketServer | null = null;
  private connectedUsers: Map<string, AuthenticatedSocket> = new Map();

  initialize(httpServer: HttpServer) {
    this.io = new SocketServer(httpServer, {
      cors: {
        origin: '*', // In production, restrict to your mobile app origins
        methods: ['GET', 'POST'],
        credentials: true,
      },
      transports: ['websocket', 'polling'],
    });

    // Authentication middleware
    this.io.use(async (socket: AuthenticatedSocket, next) => {
      try {
        // Try multiple ways to get token (same as auth middleware)
        const authToken = socket.handshake.auth?.token;
        const headerAuth = socket.handshake.headers?.authorization;
        const token = authToken || (headerAuth && headerAuth.startsWith('Bearer ') ? headerAuth.split(' ')[1] : headerAuth);
        
        if (!token) {
          console.error('Socket auth: No token provided', {
            hasAuthToken: !!authToken,
            hasHeaderAuth: !!headerAuth,
            authKeys: Object.keys(socket.handshake.auth || {}),
            headers: Object.keys(socket.handshake.headers || {}),
          });
          return next(new Error('Authentication token required'));
        }
        
        console.log('Socket auth: Token received', {
          tokenLength: token.length,
          tokenPreview: token.substring(0, 20) + '...',
          jwtSecretLength: config.jwtSecret?.length || 0,
        });

        // Verify token (same way as auth middleware)
        let decoded: any;
        try {
          decoded = jwt.verify(token, config.jwtSecret);
        } catch (jwtError: any) {
          console.error('Socket auth: JWT verification failed', {
            error: jwtError.message,
            name: jwtError.name,
            tokenLength: token.length,
            tokenPreview: token.substring(0, 20) + '...',
          });
          return next(new Error(jwtError.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid or expired token'));
        }

        if (!decoded.userId) {
          console.error('Socket auth: No userId in decoded token', decoded);
          return next(new Error('Invalid token payload'));
        }

        // Get user from database
        const user = await User.findById(decoded.userId).lean();
        
        if (!user) {
          console.error('Socket auth: User not found', { userId: decoded.userId });
          return next(new Error('User not found'));
        }

        if (!user.isActive) {
          console.error('Socket auth: User inactive', { userId: decoded.userId });
          return next(new Error('User account is inactive'));
        }

        // Attach user info to socket
        socket.userId = String(user._id);
        socket.userRole = user.role;
        
        console.log('Socket auth: Success', { userId: socket.userId, role: socket.userRole });
        next();
      } catch (error: any) {
        console.error('Socket authentication error:', error);
        next(new Error(`Authentication failed: ${error.message || 'Unknown error'}`));
      }
    });

    // Connection handler
    this.io.on('connection', (socket: AuthenticatedSocket) => {
      const userId = socket.userId!;
      
      console.log(`🔌 Socket connected: ${userId}`);
      
      // Store connected user
      this.connectedUsers.set(userId, socket);

      // Join user's personal room
      socket.join(`user:${userId}`);

      // Join role-based rooms
      if (socket.userRole) {
        socket.join(`role:${socket.userRole}`);
      }

      // Handle disconnection
      socket.on('disconnect', () => {
        console.log(`🔌 Socket disconnected: ${userId}`);
        this.connectedUsers.delete(userId);
      });

      // Handle errors
      socket.on('error', (error) => {
        console.error(`Socket error for ${userId}:`, error);
      });
    });

    console.log('✅ Socket.io initialized');
  }

  // Emit to specific user
  emitToUser(userId: string, event: string, data: any) {
    if (this.io) {
      this.io.to(`user:${userId}`).emit(event, data);
    }
  }

  // Emit to all users with specific role
  emitToRole(role: string, event: string, data: any) {
    if (this.io) {
      this.io.to(`role:${role}`).emit(event, data);
    }
  }

  // Emit to all connected users
  emitToAll(event: string, data: any) {
    if (this.io) {
      this.io.emit(event, data);
    }
  }

  // Check if user is connected
  isUserConnected(userId: string): boolean {
    return this.connectedUsers.has(userId);
  }

  // Get connected users count
  getConnectedUsersCount(): number {
    return this.connectedUsers.size;
  }

  // Get socket instance
  getIO(): SocketServer | null {
    return this.io;
  }
}

export const socketService = new SocketService();

