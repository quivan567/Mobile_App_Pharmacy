import { Request } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';

export interface MulterRequest extends AuthenticatedRequest {
  file?: Express.Multer.File;
}
