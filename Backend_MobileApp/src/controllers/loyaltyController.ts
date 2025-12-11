import { Request, Response } from 'express';
import { LoyaltyAccount, LoyaltyTransaction } from '../models/schema';
import { AuthenticatedRequest } from '../middleware/auth';

const VND_PER_POINT = 10000; // 1 điểm = 10.000đ

export class LoyaltyController {
  static async getAccount(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user!.id;
      let account = await LoyaltyAccount.findOne({ userId });
      if (!account) {
        account = await LoyaltyAccount.create({ userId, pointsBalance: 0, lifetimePoints: 0 });
      }
      res.json({ success: true, data: account });
    } catch (error) {
      console.error('Get loyalty account error:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  static async getTransactions(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user!.id;
      const txs = await LoyaltyTransaction.find({ userId }).sort({ createdAt: -1 });
      res.json({ success: true, data: txs });
    } catch (error) {
      console.error('Get loyalty transactions error:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  // Admin/manual adjust
  static async adjustPoints(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.body.userId || req.user!.id;
      const { points, note } = req.body;
      if (typeof points !== 'number' || points === 0) {
        return res.status(400).json({ success: false, message: 'Invalid points' });
      }
      let account = await LoyaltyAccount.findOne({ userId });
      if (!account) account = await LoyaltyAccount.create({ userId, pointsBalance: 0, lifetimePoints: 0 });
      account.pointsBalance = Math.max(0, account.pointsBalance + points);
      if (points > 0) account.lifetimePoints += points;
      await account.save();
      const tx = await LoyaltyTransaction.create({ userId, type: points > 0 ? 'earn' : 'adjust', points, note });
      res.json({ success: true, data: { account, tx } });
    } catch (error) {
      console.error('Adjust points error:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  // Convert points to discount amount
  static pointsToVnd(points: number) {
    return points * VND_PER_POINT;
  }
}


