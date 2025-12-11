import { Router } from 'express';
import { Request, Response } from 'express';
import { Category } from '../models/schema.js';
import { validateId } from '../middleware/validation.js';

const router = Router();

// Get all categories
router.get('/', async (req: Request, res: Response) => {
  try {
    const categoriesList = await Category.find({ isActive: true }).sort({ name: 1 }).lean();

    res.json({
      success: true,
      data: categoriesList,
    });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

// Get category by ID
router.get('/:id', validateId, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const category = await Category.findById(id).lean();

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found',
      });
    }

    res.json({
      success: true,
      data: category,
    });
  } catch (error) {
    console.error('Get category by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

export default router;

