import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Product } from './src/models/schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

// Normalize name for matching (remove extension, lowercase, remove special chars, remove IDs)
const normalizeName = (name) => {
  if (!name) return '';
  return name
    .replace(/\.(jpg|jpeg|png|webp|avif|gif)$/i, '') // Remove extension
    .replace(/_\d{24}[a-z0-9]{0,8}$/i, '') // Remove MongoDB ObjectId-like patterns (24 hex chars)
    .replace(/__[a-f0-9]{24}[a-z0-9]{0,8}$/i, '') // Remove trailing IDs like __692202e5f87b9e5ea79ed1f5
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '') // Remove all non-alphanumeric
    .trim();
};

// Extract medicine name from filename (remove common patterns)
const extractMedicineName = (filename) => {
  if (!filename) return '';
  let name = filename
    .replace(/\.(jpg|jpeg|png|webp|avif|gif)$/i, '') // Remove extension
    .replace(/_\d{24}[a-z0-9]{0,8}$/i, '') // Remove ObjectId
    .replace(/__[a-f0-9]{24}[a-z0-9]{0,8}$/i, ''); // Remove trailing IDs
  
  // Remove common quantity patterns
  name = name.replace(/__1_h_p_x_\d+[_\w]*$/i, '');
  name = name.replace(/_\d+_vi_n__?/i, '');
  name = name.replace(/_\d+_g_i__?/i, '');
  name = name.replace(/_\d+_chai__?/i, '');
  
  return name.trim();
};

async function fixImageUrls() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      console.error('❌ MONGODB_URI not found in .env file');
      process.exit(1);
    }

    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');
    
    // Get all image files from medicine-images directory
    const imagesDir = path.join(__dirname, 'medicine-images');
    
    if (!fs.existsSync(imagesDir)) {
      console.error(`❌ Directory not found: ${imagesDir}`);
      process.exit(1);
    }
    
    const imageFiles = fs.readdirSync(imagesDir).filter(file => 
      /\.(jpg|jpeg|png|webp|avif|gif)$/i.test(file)
    );
    
    console.log(`📁 Found ${imageFiles.length} image files in medicine-images directory`);
    
    // Get all products
    const products = await Product.find({}).select('_id name imageUrl');
    console.log(`📦 Found ${products.length} products in database`);
    
    let updated = 0;
    let notFound = 0;
    const updates = [];
    
    // For each product, try to find matching image file
    for (const product of products) {
      if (!product.name) continue;
      
      const productNameNormalized = normalizeName(product.name);
      let bestMatch = null;
      let bestScore = 0;
      
      // Try to find matching image file
      for (const imageFile of imageFiles) {
        const imageNameNormalized = normalizeName(imageFile);
        const imageNameExtracted = normalizeName(extractMedicineName(imageFile));
        
        // Exact match
        if (imageNameNormalized === productNameNormalized || 
            imageNameExtracted === productNameNormalized) {
          bestMatch = imageFile;
          bestScore = 1.0;
          break;
        }
        
        // Partial match - check if product name contains image name or vice versa
        if (productNameNormalized.includes(imageNameExtracted) || 
            imageNameExtracted.includes(productNameNormalized)) {
          const score = Math.min(
            productNameNormalized.length / imageNameExtracted.length,
            imageNameExtracted.length / productNameNormalized.length
          );
          if (score > bestScore && score > 0.6) { // At least 60% match
            bestScore = score;
            bestMatch = imageFile;
          }
        }
      }
      
      if (bestMatch) {
        const newImageUrl = `/medicine-images/${bestMatch}`;
        
        // Only update if different
        if (product.imageUrl !== newImageUrl) {
          updates.push({
            productId: product._id,
            productName: product.name,
            oldImageUrl: product.imageUrl,
            newImageUrl: newImageUrl,
            matchedFile: bestMatch,
            score: bestScore
          });
        }
      } else {
        notFound++;
        console.log(`⚠️  No match found for: ${product.name} (current: ${product.imageUrl})`);
      }
    }
    
    // Display what will be updated
    console.log(`\n📊 Update Summary:`);
    console.log(`- Products to update: ${updates.length}`);
    console.log(`- Products without match: ${notFound}`);
    
    if (updates.length > 0) {
      console.log(`\n📝 Sample updates (first 10):`);
      updates.slice(0, 10).forEach(update => {
        console.log(`  ${update.productName}`);
        console.log(`    Old: ${update.oldImageUrl}`);
        console.log(`    New: ${update.newImageUrl} (score: ${update.score.toFixed(2)})`);
        console.log('');
      });
      
      // Ask for confirmation (in production, you might want to add a flag)
      console.log(`\n🔄 Updating ${updates.length} products...`);
      
      // Perform updates
      for (const update of updates) {
        try {
          await Product.updateOne(
            { _id: update.productId },
            { $set: { imageUrl: update.newImageUrl } }
          );
          updated++;
        } catch (error) {
          console.error(`❌ Error updating ${update.productName}:`, error.message);
        }
      }
      
      console.log(`\n✅ Successfully updated ${updated} products`);
    } else {
      console.log(`\n✅ No updates needed - all image URLs are already correct`);
    }
    
    // Show statistics
    console.log(`\n📈 Final Statistics:`);
    const productsWithImages = await Product.countDocuments({
      imageUrl: { $regex: /^\/medicine-images\// }
    });
    console.log(`- Products with medicine-images path: ${productsWithImages}`);
    console.log(`- Products without medicine-images path: ${products.length - productsWithImages}`);
    
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

fixImageUrls();

