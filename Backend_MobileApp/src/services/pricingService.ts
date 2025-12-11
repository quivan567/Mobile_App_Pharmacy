import { Promotion, PromotionItem } from '../models/schema';

export interface CartItemInput {
  productId: string;
  quantity: number;
  price: number;
  categoryId?: string;
}

export interface PricingResult {
  subtotal: number;
  discountAmount: number;
  finalTotal: number;
  appliedRules: { id: string; name: string; type: string; discount: number }[];
}

export async function evaluatePromotions(items: CartItemInput[]): Promise<PricingResult> {
  try {
    // Validate input
    if (!Array.isArray(items) || items.length === 0) {
      return {
        subtotal: 0,
        discountAmount: 0,
        finalTotal: 0,
        appliedRules: [],
      };
    }

    // Validate items
    for (const item of items) {
      if (!item.productId || !item.quantity || !item.price) {
        throw new Error('Invalid item structure: productId, quantity, and price are required');
      }
      if (item.quantity < 1 || item.price < 0) {
        throw new Error('Invalid quantity or price');
      }
    }

    const now = new Date();
    // Only get promotions without codes (automatic promotions)
    // Promotions with codes should be applied manually via validateCode
    const activePromotions = await Promotion.find({
      isActive: true,
      startDate: { $lte: now },
      endDate: { $gte: now },
      $or: [
        { code: { $exists: false } },
        { code: null },
        { code: '' }
      ]
    }).lean();

    const subtotal = items.reduce((sum, it) => sum + it.price * it.quantity, 0);
    let discountTotal = 0;
    const appliedRules: PricingResult['appliedRules'] = [];

    // Apply promotions in order (first applicable wins, or accumulate based on business logic)
    for (const promo of activePromotions) {
      let discountForPromo = 0;

      // Order threshold promotion
      if (promo.type === 'order_threshold' && promo.minOrderValue && promo.discountPercent) {
        if (subtotal >= promo.minOrderValue) {
          discountForPromo = Math.floor((subtotal * promo.discountPercent) / 100);
        }
      }

      // Flash sale promotion
      if (promo.type === 'flash_sale' && promo.discountPercent) {
        let withinWindow = true;
        if (promo.dailyStartTime && promo.dailyEndTime) {
          try {
            const [sh, sm] = promo.dailyStartTime.split(':').map(Number);
            const [eh, em] = promo.dailyEndTime.split(':').map(Number);
            const nowMins = now.getHours() * 60 + now.getMinutes();
            const startMins = sh * 60 + (sm || 0);
            const endMins = eh * 60 + (em || 0);
            withinWindow = nowMins >= startMins && nowMins <= endMins;
          } catch (error) {
            console.error('Error parsing flash sale time:', error);
            withinWindow = false;
          }
        }
        if (withinWindow) {
          discountForPromo = Math.floor((subtotal * promo.discountPercent) / 100);
        }
      }

      // Category bundle promotion
      if (promo.type === 'category_bundle' && promo.discountPercent && promo.applicableCategoryId) {
        const hasAny = items.some(it => 
          it.categoryId && String(it.categoryId) === String(promo.applicableCategoryId)
        );
        if (hasAny) {
          // Calculate discount only on items in the category
          const categoryItemsTotal = items
            .filter(it => it.categoryId && String(it.categoryId) === String(promo.applicableCategoryId))
            .reduce((sum, it) => sum + it.price * it.quantity, 0);
          discountForPromo = Math.floor((categoryItemsTotal * promo.discountPercent) / 100);
        }
      }

      // Combo promotion
      if (promo.type === 'combo') {
        try {
          const comboItems = await PromotionItem.find({ promotionId: promo._id }).lean();
          if (comboItems.length > 0) {
            const productIdToQty = new Map<string, number>();
            for (const it of items) {
              const productId = String(it.productId);
              productIdToQty.set(productId, (productIdToQty.get(productId) || 0) + it.quantity);
            }
            const canApply = comboItems.every(ci => 
              (productIdToQty.get(String(ci.productId)) || 0) >= ci.requiredQuantity
            );
            if (canApply && promo.discountPercent) {
              discountForPromo = Math.floor((subtotal * promo.discountPercent) / 100);
            }
          }
        } catch (error) {
          console.error('Error evaluating combo promotion:', error);
        }
      }

      // Apply max discount cap
      if (promo.maxDiscountAmount && discountForPromo > promo.maxDiscountAmount) {
        discountForPromo = promo.maxDiscountAmount;
      }

      // Only add if discount > 0
      if (discountForPromo > 0) {
        discountTotal += discountForPromo;
        appliedRules.push({ 
          id: String(promo._id), 
          name: promo.name, 
          type: promo.type, 
          discount: discountForPromo 
        });
      }
    }

    // Ensure discount doesn't exceed subtotal
    discountTotal = Math.min(discountTotal, subtotal);
    const finalTotal = Math.max(0, subtotal - discountTotal);

    return { 
      subtotal, 
      discountAmount: discountTotal, 
      finalTotal, 
      appliedRules 
    };
  } catch (error: any) {
    console.error('Error in evaluatePromotions:', {
      message: error.message,
      stack: error.stack,
      items: items?.length,
    });
    // Return safe default values on error
    const subtotal = items?.reduce((sum, it) => sum + (it.price || 0) * (it.quantity || 0), 0) || 0;
    return {
      subtotal,
      discountAmount: 0,
      finalTotal: subtotal,
      appliedRules: [],
    };
  }
}


