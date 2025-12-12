import { Product } from '../models/schema.js';
import mongoose from 'mongoose';

const escapeRegex = (str: string): string =>
  (str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Parse dosage/strength from medicine name
 * Examples:
 * - "MALTAGIT_2500mg_500mg" -> { baseName: "MALTAGIT", dosage: "2500mg/500mg" }
 * - "Paracetamol 500mg" -> { baseName: "Paracetamol", dosage: "500mg" }
 * - "Amoxicillin 250mg/5ml" -> { baseName: "Amoxicillin", dosage: "250mg/5ml" }
 * - "SIMETHICON B 80mg" -> { baseName: "SIMETHICON B", dosage: "80mg" }
 * - "SIMETHICON_B_80mg" -> { baseName: "SIMETHICON B", dosage: "80mg" }
 */
export function parseMedicineName(medicineName: string): {
  baseName: string;
  dosage: string | null;
} {
  if (!medicineName || typeof medicineName !== 'string') {
    return { baseName: medicineName || '', dosage: null };
  }

  // Pattern to match dosage: numbers followed by units (mg, g, ml, l, mcg, iu, ui, etc.)
  // Also match patterns like "2500mg+500mg" or "2500mg 500mg"
  const dosagePattern = /(\d+(?:\.\d+)?(?:mg|g|ml|l|mcg|iu|ui|%)(?:\s*[+\/]\s*\d+(?:\.\d+)?(?:mg|g|ml|l|mcg|iu|ui|%)?)?)/gi;
  const dosages = medicineName.match(dosagePattern);

  if (dosages && dosages.length > 0) {
    // Extract base name by removing dosage and common separators
    // First, normalize separators to spaces
    let baseName = medicineName
      .replace(/_/g, ' ')
      .replace(/\+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Remove dosage from name (need to handle both + and / formats)
    for (const dosage of dosages) {
      // Escape special regex characters in dosage
      const escapedDosage = dosage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Also try with + replaced by space or nothing
      const dosageVariants = [
        escapedDosage,
        escapedDosage.replace(/\\\+/g, '\\s*[+\\s]*'),
        escapedDosage.replace(/\\\+/g, ''),
      ];
      
      for (const variant of dosageVariants) {
        baseName = baseName.replace(new RegExp(variant, 'gi'), '').trim();
      }
    }

    // Clean up separators and extra spaces
    baseName = baseName
      .replace(/[_\-\/\+]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Normalize dosage format (replace + with / for consistency, but keep original for comparison)
    const dosage = dosages.map(d => d.replace(/\s*\+\s*/g, '/')).join('/');
    return { baseName: baseName || medicineName, dosage };
  }

  // No dosage found, return cleaned name (remove underscores, normalize spaces)
  return {
    baseName: medicineName.replace(/_/g, ' ').replace(/\s+/g, ' ').trim(),
    dosage: null
  };
}

/**
 * Normalize dosage for comparison
 * Examples:
 * - "2500mg" and "2.5g" should match
 * - "500mg" and "0.5g" should match
 */
function normalizeDosage(dosage: string): {
  value: number;
  unit: string;
}[] {
  if (!dosage) return [];

  const parts = dosage.split('/');
  return parts.map(part => {
    const match = part.match(/(\d+(?:\.\d+)?)\s*(mg|g|ml|l|mcg|iu|ui|%)/i);
    if (!match) return { value: 0, unit: '' };

    let value = parseFloat(match[1]);
    const unit = match[2].toLowerCase();

    // Convert to mg for comparison (standardize)
    if (unit === 'g') {
      value = value * 1000; // g to mg
    } else if (unit === 'mcg') {
      value = value / 1000; // mcg to mg
    }

    return { value, unit: 'mg' }; // Normalize to mg
  });
}

/**
 * Check if two dosages match (within tolerance)
 */
function dosagesMatch(dosage1: string | null, dosage2: string | null, tolerance: number = 0.1): boolean {
  if (!dosage1 || !dosage2) return false;

  const norm1 = normalizeDosage(dosage1);
  const norm2 = normalizeDosage(dosage2);

  if (norm1.length !== norm2.length) return false;

  for (let i = 0; i < norm1.length; i++) {
    const diff = Math.abs(norm1[i].value - norm2[i].value);
    const avg = (norm1[i].value + norm2[i].value) / 2;
    if (avg > 0 && diff / avg > tolerance) {
      return false;
    }
  }

  return true;
}

/**
 * Normalize medicine name for comparison - ONLY KEEP LETTERS (a-z, A-Z)
 * Remove all numbers, spaces, underscores, special chars
 * This makes matching easier: "SIMETHICON B 80mg" matches "SIMETHICON_B_80mg"
 * Also handles cases where OCR misses a letter: "SIMETHICON 80mg" matches "SIMETHICON B 80mg"
 */
function normalizeForComparison(name: string): string {
  if (!name || typeof name !== 'string') return '';
  
  // Only keep letters (a-z, A-Z), remove everything else
  return name
    .toLowerCase()
    .replace(/[^a-z]/g, '') // Remove everything except lowercase letters
    .trim();
}

/**
 * Check if two normalized names are similar enough (allowing for 1-2 missing letters)
 * This helps match "SIMETHICON" with "SIMETHICONB" (OCR might miss a letter)
 */
function namesAreSimilar(normalized1: string, normalized2: string): boolean {
  if (normalized1 === normalized2) return true;
  
  // If one is a substring of the other (allowing for 1-2 missing letters)
  // Example: "simethicon" should match "simethiconb" (missing 'b')
  if (normalized1.length >= 3 && normalized2.length >= 3) {
    const shorter = normalized1.length < normalized2.length ? normalized1 : normalized2;
    const longer = normalized1.length >= normalized2.length ? normalized1 : normalized2;
    
    // Check if shorter is a prefix of longer (allowing 1-2 missing letters at the end)
    if (longer.startsWith(shorter) && (longer.length - shorter.length) <= 2) {
      return true;
    }
    
    // Check if they're very similar (Levenshtein distance <= 2)
    const diff = Math.abs(normalized1.length - normalized2.length);
    if (diff <= 2) {
      // Simple similarity check: if most letters match
      let matches = 0;
      const minLen = Math.min(normalized1.length, normalized2.length);
      for (let i = 0; i < minLen; i++) {
        if (normalized1[i] === normalized2[i]) matches++;
      }
      // If at least 80% of letters match, consider them similar
      if (matches / minLen >= 0.8) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Normalize dosage for comparison - keep numbers and units, normalize separators
 * Examples:
 * - "2500mg+500mg" -> "2500mg500mg" (normalize + to nothing)
 * - "2500mg/500mg" -> "2500mg500mg" (normalize / to nothing)
 * - "2500mg 500mg" -> "2500mg500mg" (normalize space to nothing)
 * - "80mg" -> "80mg"
 * 
 * This ensures "2500mg+500mg" matches "2500mg/500mg" or "2500mg 500mg"
 */
export function normalizeDosageForComparison(dosage: string | null): string {
  if (!dosage || typeof dosage !== 'string') return '';
  
  // Normalize: remove spaces, underscores, +, -, /, but keep numbers and units (mg, g, ml, etc.)
  return dosage
    .toLowerCase()
    .replace(/[_\s+\-\/]/g, '') // Remove spaces, underscores, +, -, /
    .replace(/[^a-z0-9]/g, '') // Remove all special chars except letters and numbers
    .trim();
}

/**
 * Find exact match: same name and same dosage
 */
export async function findExactMatch(
  medicineName: string,
  medicineText: string
): Promise<{
  product: any;
  matchType: 'exact' | 'name_only' | null;
  confidence: number;
} | null> {
  const { baseName, dosage } = parseMedicineName(medicineName);
  const normalizedBaseName = normalizeForComparison(baseName);
  const normalizedInputDosage = normalizeDosageForComparison(dosage);
  
  console.log(`🔍 findExactMatch - Input: "${medicineName}"`);
  console.log(`   Parsed: baseName="${baseName}", dosage="${dosage}"`);
  console.log(`   Normalized: baseName="${normalizedBaseName}", dosage="${normalizedInputDosage}"`);

  // Create search patterns - more flexible (include all variations)
  const searchPatterns = [
    baseName,
    baseName.replace(/\s+/g, '_'),
    baseName.replace(/\s+/g, ''),
    baseName.replace(/\s+/g, '+'),
    medicineName,
    medicineName.replace(/\s+/g, '_'),
    medicineName.replace(/\s+/g, ''),
    medicineName.replace(/\s+/g, '+'),
    // Also try first word only for broader search
    baseName.split(/\s+/)[0],
    medicineName.split(/\s+/)[0],
  ];

  // Remove empty patterns and duplicates
  const validPatterns = [...new Set(searchPatterns.filter(p => p && p.length >= 2))];

  // Search in Products collection
  // First, try to find products with normalized name matching
  // We'll search with multiple patterns and also do a broader search
  const allProducts: any[] = [];
  const seenIds = new Set<string>();
  
  for (const pattern of validPatterns) {
    const escapedPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Search with various separators (space, underscore, plus, etc.)
    const flexiblePattern = pattern.replace(/[\s_+]/g, '[\\s_+]*');
    const escapedFlexiblePattern = flexiblePattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    const products = await Product.find({
      $or: [
        { name: { $regex: `^${escapedPattern}`, $options: 'i' } },
        { name: { $regex: escapedPattern, $options: 'i' } },
        { name: { $regex: `^${escapedFlexiblePattern}`, $options: 'i' } },
        { name: { $regex: escapedFlexiblePattern, $options: 'i' } },
      ]
    }).limit(50); // Increase limit to check more products
    
    // Add unique products
    for (const product of products) {
      const productId = String(product._id);
      if (!seenIds.has(productId)) {
        seenIds.add(productId);
        allProducts.push(product);
      }
    }
  }
  
  // If still not enough, do a broader search by first word
  if (allProducts.length < 10) {
    const firstWord = baseName.split(/\s+/)[0];
    if (firstWord && firstWord.length > 2) {
      const escapedFirstWord = firstWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const moreProducts = await Product.find({
        name: { $regex: `^${escapedFirstWord}`, $options: 'i' }
      }).limit(30);
      
      for (const product of moreProducts) {
        const productId = String(product._id);
        if (!seenIds.has(productId)) {
          seenIds.add(productId);
          allProducts.push(product);
        }
      }
    }
  }
  
  // Check each product for exact match
  for (const product of allProducts) {
    const productParsed = parseMedicineName(product.name);
    const normalizedProductBaseName = normalizeForComparison(productParsed.baseName);
    const normalizedProductDosage = normalizeDosageForComparison(productParsed.dosage);
    
    console.log(`   Checking product: "${product.name}"`);
    console.log(`     Parsed: baseName="${productParsed.baseName}", dosage="${productParsed.dosage}"`);
    console.log(`     Normalized: baseName="${normalizedProductBaseName}", dosage="${normalizedProductDosage}"`);
    
    // Check if base names match (normalized comparison - ONLY LETTERS, no numbers/spaces/special chars)
    // Also check for similarity (allowing for 1-2 missing letters from OCR errors)
    const baseNameMatch = normalizedProductBaseName === normalizedBaseName || 
                          namesAreSimilar(normalizedProductBaseName, normalizedBaseName);

    if (baseNameMatch) {
      // Check dosage match (normalized comparison - only numbers and units)
      if (normalizedInputDosage && normalizedProductDosage) {
        // Both have dosage - compare normalized versions
        if (normalizedInputDosage === normalizedProductDosage) {
          // Exact match: same name and same dosage
          console.log(`   ✅ EXACT MATCH FOUND: ${product.name}`);
          return {
            product,
            matchType: 'exact',
            confidence: 0.95
          };
        } else {
          // Name matches but dosage different - still good match
          console.log(`   ✅ NAME MATCH (dosage different): ${product.name}`);
          return {
            product,
            matchType: 'name_only',
            confidence: 0.80
          };
        }
      } else if (!normalizedInputDosage || !normalizedProductDosage) {
        // One or both don't have dosage info - still good match
        console.log(`   ✅ NAME MATCH (no dosage info): ${product.name}`);
        return {
          product,
          matchType: 'name_only',
          confidence: 0.85
        };
      }
    }
  }

  return null;
}

/**
 * Calculate Levenshtein distance between two strings
 * Used for fuzzy string matching
 */
function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,     // deletion
          dp[i][j - 1] + 1,     // insertion
          dp[i - 1][j - 1] + 1  // substitution
        );
      }
    }
  }

  return dp[m][n];
}

/**
 * Calculate similarity score between two strings (0-1)
 */
function calculateSimilarity(str1: string, str2: string): number {
  const normalized1 = normalizeForComparison(str1);
  const normalized2 = normalizeForComparison(str2);
  
  if (normalized1 === normalized2) return 1.0;
  
  const maxLen = Math.max(normalized1.length, normalized2.length);
  if (maxLen === 0) return 1.0;
  
  const distance = levenshteinDistance(normalized1, normalized2);
  return 1 - (distance / maxLen);
}

/**
 * Find similar medicines (same base name but different dosage, or same category/description)
 * Improved algorithm with better matching and scoring
 */
export async function findSimilarMedicines(
  medicineName: string,
  medicineText: string,
  limit: number = 5
): Promise<any[]> {
  const { baseName, dosage } = parseMedicineName(medicineName);
  const normalizedBaseName = normalizeForComparison(baseName);
  const normalizedInputDosage = normalizeDosageForComparison(dosage);

  console.log(`🔍 Finding similar medicines for baseName: "${baseName}", normalized: "${normalizedBaseName}"`);

  // Step 1: Search by base name (exact and fuzzy)
  const searchPatterns = [
    baseName,
    baseName.replace(/\s+/g, '_'),
    baseName.replace(/\s+/g, ''),
    baseName.replace(/\s+/g, '+'),
  ].filter(p => p && p.length >= 2);

  const allProducts: any[] = [];
  const seenIds = new Set<string>();
  
  // Search by name patterns - first try with inStock: true, then fallback to all
  for (const pattern of searchPatterns) {
    const escapedPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const flexiblePattern = pattern.replace(/[\s_+]/g, '[\\s_+]*');
    const escapedFlexiblePattern = flexiblePattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // First, try to find in-stock products
    let products = await Product.find({
      $or: [
        { name: { $regex: `^${escapedPattern}`, $options: 'i' } },
        { name: { $regex: escapedPattern, $options: 'i' } },
        { name: { $regex: `^${escapedFlexiblePattern}`, $options: 'i' } },
        { name: { $regex: escapedFlexiblePattern, $options: 'i' } },
      ],
      inStock: true, // Prefer in-stock products
    })
    .populate('categoryId', 'name')
    .limit(limit * 10);

    // If not enough results, also search for out-of-stock products
    if (products.length < limit * 2) {
      const outOfStockProducts = await Product.find({
        $or: [
          { name: { $regex: `^${escapedPattern}`, $options: 'i' } },
          { name: { $regex: escapedPattern, $options: 'i' } },
          { name: { $regex: `^${escapedFlexiblePattern}`, $options: 'i' } },
          { name: { $regex: escapedFlexiblePattern, $options: 'i' } },
        ],
        inStock: false, // Also include out-of-stock products
      })
      .populate('categoryId', 'name')
      .limit(limit * 5);
      
      products = [...products, ...outOfStockProducts];
    }

    console.log(`  Pattern "${pattern}": Found ${products.length} products (${products.filter(p => p.inStock).length} in stock)`);

    for (const product of products) {
      const productId = String(product._id);
      if (!seenIds.has(productId)) {
        seenIds.add(productId);
        allProducts.push(product);
      }
    }

    if (allProducts.length >= limit * 5) break;
  }

  // Step 2: Search by first word (broader search)
  const firstWord = baseName.split(/\s+/)[0];
  if (firstWord && firstWord.length > 2 && allProducts.length < limit * 3) {
    const escapedFirstWord = firstWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Try in-stock first
    let moreProducts = await Product.find({
      $or: [
        { name: { $regex: `^${escapedFirstWord}`, $options: 'i' } },
        { name: { $regex: escapedFirstWord, $options: 'i' } },
        { description: { $regex: escapedFirstWord, $options: 'i' } },
      ],
      inStock: true,
    })
    .populate('categoryId', 'name')
    .limit(limit * 5);

    // If not enough, also search out-of-stock
    if (moreProducts.length < limit * 2) {
      const outOfStockMore = await Product.find({
        $or: [
          { name: { $regex: `^${escapedFirstWord}`, $options: 'i' } },
          { name: { $regex: escapedFirstWord, $options: 'i' } },
          { description: { $regex: escapedFirstWord, $options: 'i' } },
        ],
        inStock: false,
      })
      .populate('categoryId', 'name')
      .limit(limit * 3);
      
      moreProducts = [...moreProducts, ...outOfStockMore];
    }

    console.log(`  First word "${firstWord}": Found ${moreProducts.length} additional products`);

    for (const product of moreProducts) {
      const productId = String(product._id);
      if (!seenIds.has(productId)) {
        seenIds.add(productId);
        allProducts.push(product);
      }
    }
  }

  // Step 3: Calculate similarity scores and rank products
  const scoredProducts: Array<{
    product: any;
    score: number;
    matchReason: string;
    confidence: number;
  }> = [];

  for (const product of allProducts) {
    const productParsed = parseMedicineName(product.name);
    const normalizedProductBaseName = normalizeForComparison(productParsed.baseName);
    const normalizedProductDosage = normalizeDosageForComparison(productParsed.dosage);
    
    // Calculate name similarity using Levenshtein distance
    const nameSimilarity = calculateSimilarity(baseName, productParsed.baseName);
    const baseNameMatch = normalizedProductBaseName === normalizedBaseName || 
                          namesAreSimilar(normalizedProductBaseName, normalizedBaseName);
    
    // Check dosage match
    const dosageMatches = normalizedInputDosage && normalizedProductDosage 
      ? normalizedInputDosage === normalizedProductDosage
      : false;
    
    // Calculate base score
    let score = 0;
    let matchReason = '';
    let confidence = 0;

    if (baseNameMatch) {
      if (dosageMatches) {
        score = 0.95;
        matchReason = 'same_name_same_dosage';
        confidence = 0.90;
      } else {
        score = 0.80;
        matchReason = 'same_name_different_dosage';
        confidence = 0.75;
      }
    } else if (nameSimilarity >= 0.7) {
      score = 0.70;
      matchReason = 'similar_name';
      confidence = 0.65;
    } else if (nameSimilarity >= 0.4) {
      // Lower threshold to include more suggestions
      score = 0.40;
      matchReason = 'partial_name_match';
      confidence = 0.45;
    } else {
      // Skip products with very low similarity (< 40%)
      continue;
    }

    // Bonus points for:
    // - In stock (higher stock = higher score)
    const stockBonus = product.inStock ? Math.min(product.stockQuantity / 100, 0.1) : -0.1;
    score += stockBonus;

    // - Same category (if we can determine category)
    // Note: This would require category matching logic

    // - Popular products (isHot, isNew)
    if (product.isHot) score += 0.05;
    if (product.isNew) score += 0.03;

    scoredProducts.push({
      product,
      score,
      matchReason,
      confidence: Math.min(confidence + stockBonus, 0.95)
    });
  }

  // Step 4: Sort by score (highest first) and return top results
  scoredProducts.sort((a, b) => b.score - a.score);

  let similarProducts = scoredProducts.slice(0, limit).map(item => ({
    ...item.product.toObject(),
    matchReason: item.matchReason,
    confidence: item.confidence
  }));

  // Step 5: If no results found, try broader search strategies
  if (similarProducts.length === 0) {
    console.log(`⚠️ No similar medicines found, trying broader search...`);
    
    // Strategy 1: Search by description/keywords
    const keywords = baseName.split(/\s+/).filter(w => w.length > 2);
    if (keywords.length > 0) {
      const keywordPattern = keywords.map(k => escapeRegex(k)).join('|') || '.*';
      const keywordProducts = await Product.find({
        $or: [
          { description: { $regex: keywordPattern, $options: 'i' } },
          { name: { $regex: keywordPattern, $options: 'i' } },
        ],
        inStock: true,
      })
      .populate('categoryId', 'name')
      .limit(limit * 2)
      .sort({ isHot: -1, stockQuantity: -1 }); // Prefer hot and high stock products
      
      for (const product of keywordProducts) {
        const productId = String(product._id);
        if (!seenIds.has(productId)) {
          seenIds.add(productId);
          similarProducts.push({
            ...product.toObject(),
            matchReason: 'keyword_match',
            confidence: 0.4
          });
          if (similarProducts.length >= limit) break;
        }
      }
    }
    
    // Strategy 2: If still no results, suggest popular/hot medicines
    if (similarProducts.length === 0) {
      console.log(`⚠️ Still no results, suggesting popular medicines...`);
      const popularProducts = await Product.find({
        $or: [
          { isHot: true },
          { isNew: true },
          { stockQuantity: { $gte: 10 } },
        ],
        inStock: true,
      })
      .populate('categoryId', 'name')
      .limit(limit)
      .sort({ isHot: -1, isNew: -1, stockQuantity: -1 });
      
      for (const product of popularProducts) {
        const productId = String(product._id);
        if (!seenIds.has(productId)) {
          seenIds.add(productId);
          similarProducts.push({
            ...product.toObject(),
            matchReason: 'popular_medicine',
            confidence: 0.3
          });
          if (similarProducts.length >= limit) break;
        }
      }
    }
    
    // Strategy 3: Last resort - any available medicines
    if (similarProducts.length === 0) {
      console.log(`⚠️ No popular medicines, suggesting any available medicines...`);
      const anyProducts = await Product.find({
        inStock: true,
      })
      .populate('categoryId', 'name')
      .limit(limit)
      .sort({ stockQuantity: -1, createdAt: -1 });
      
      for (const product of anyProducts) {
        const productId = String(product._id);
        if (!seenIds.has(productId)) {
          seenIds.add(productId);
          similarProducts.push({
            ...product.toObject(),
            matchReason: 'general_suggestion',
            confidence: 0.2
          });
          if (similarProducts.length >= limit) break;
        }
      }
    }
  }

  console.log(`✅ Found ${similarProducts.length} similar medicines (from ${allProducts.length} candidates)`);

  return similarProducts;
}

