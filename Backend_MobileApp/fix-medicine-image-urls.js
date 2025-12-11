import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Define Product schema (simplified for script)
const productSchema = new mongoose.Schema({
  name: String,
  imageUrl: String,
}, { collection: 'products' });

async function fixMedicineImageUrls() {
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to database');

    // Get all image files from medicine-images directory (one level up from Backend_MobileApp)
    const imagesDir = path.join(__dirname, '..', 'medicine-images');
    if (!fs.existsSync(imagesDir)) {
      console.log('❌ medicine-images directory not found');
      return;
    }

    const imageFiles = fs.readdirSync(imagesDir).filter(file => 
      /\.(jpg|jpeg|png|webp|avif|gif)$/i.test(file)
    );

    console.log(`📸 Found ${imageFiles.length} image files`);

    // Create a map of normalized file names to actual file names
    const fileMap = new Map();
    
    // Normalize name: remove extension, remove ObjectId-like patterns, lowercase, remove special chars
    const normalizeFileName = (filename) => {
      return filename
        .replace(/\.(jpg|jpeg|png|webp|avif|gif)$/i, '') // Remove extension
        .replace(/_[a-f0-9]{24}[a-z0-9]{0,8}$/i, '') // Remove ObjectId (24 hex chars)
        .replace(/__[a-f0-9]{24}[a-z0-9]{0,8}$/i, '') // Remove ObjectId with double underscore
        .replace(/__1_h_p_x_\d+[_\w]*$/i, '') // Remove quantity patterns like __1_h_p_x_30_vi_n__
        .replace(/_\d+_vi_n__?/i, '') // Remove _30_vi_n_
        .replace(/_\d+_g_i__?/i, '') // Remove _20_g_i__
        .replace(/_\d+_chai__?/i, '') // Remove _1_chai_
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '') // Remove all non-alphanumeric
        .trim();
    };
    
    imageFiles.forEach(file => {
      const normalized = normalizeFileName(file);
      // Store both the normalized key and the original file
      if (!fileMap.has(normalized)) {
        fileMap.set(normalized, file);
      }
    });

    // Get Product model
    const Product = mongoose.model('Product', productSchema);
    
    // Get all products
    const products = await Product.find({}).lean();
    console.log(`📦 Found ${products.length} products in database`);

    let updated = 0;
    let notFound = 0;
    let alreadyCorrect = 0;

    for (const product of products) {
      try {
        if (!product.imageUrl) {
          console.log(`⚠️  Product ${product.name} has no imageUrl`);
          continue;
        }

        // Extract filename from imageUrl (remove path and query params)
        const currentImageUrl = product.imageUrl;
        const currentImageFileName = currentImageUrl.split('/').pop().split('?')[0];
        const currentFileName = normalizeFileName(currentImageFileName);

        // Try to find matching file
        let matchedFile = null;
        
        // Method 1: Check if the exact file exists (with ObjectId)
        if (imageFiles.includes(currentImageFileName)) {
          matchedFile = currentImageFileName;
        }
        // Method 2: Exact match (normalized - without ObjectId)
        else if (fileMap.has(currentFileName)) {
          matchedFile = fileMap.get(currentFileName);
        } 
        // Method 3: Try to match by product name
        else {
          const productNameNormalized = normalizeFileName(product.name);
          
          // Try exact match first
          if (fileMap.has(productNameNormalized)) {
            matchedFile = fileMap.get(productNameNormalized);
          } else {
            // Try partial match - check if product name contains image name or vice versa
            let bestMatch = null;
            let bestScore = 0;
            
            for (const [normalized, actualFile] of fileMap.entries()) {
              if (normalized && productNameNormalized) {
                if (normalized.includes(productNameNormalized) || 
                    productNameNormalized.includes(normalized)) {
                  const score = Math.min(
                    productNameNormalized.length / normalized.length,
                    normalized.length / productNameNormalized.length
                  );
                  if (score > bestScore && score > 0.5) { // At least 50% match (lowered threshold)
                    bestScore = score;
                    bestMatch = actualFile;
                  }
                }
              }
            }
            
            if (bestMatch) {
              matchedFile = bestMatch;
            }
          }
        }

        if (matchedFile) {
          const newImageUrl = `/medicine-images/${matchedFile}`;
          
          // Check if it's already correct
          if (currentImageUrl === newImageUrl) {
            alreadyCorrect++;
            continue;
          }

          // Verify the file actually exists
          const matchedFilePath = path.join(imagesDir, matchedFile);
          if (!fs.existsSync(matchedFilePath)) {
            console.log(`⚠️  Matched file doesn't exist: ${matchedFile} for ${product.name}`);
            notFound++;
            continue;
          }

          await Product.updateOne(
            { _id: product._id },
            { imageUrl: newImageUrl }
          );

          console.log(`✅ Updated: ${product.name}`);
          console.log(`   Old: ${currentImageUrl}`);
          console.log(`   New: ${newImageUrl}`);
          updated++;
        } else {
          // Check if current file exists
          const currentFilePath = path.join(imagesDir, currentImageFileName);
          if (fs.existsSync(currentFilePath)) {
            // File exists, no need to update
            alreadyCorrect++;
          } else {
            console.log(`❌ Not found match for: ${product.name}`);
            console.log(`   Current imageUrl: ${currentImageUrl}`);
            notFound++;
          }
        }
      } catch (error) {
        console.error(`❌ Error updating ${product.name}:`, error.message);
      }
    }

    console.log('\n📊 Summary:');
    console.log(`   ✅ Updated: ${updated}`);
    console.log(`   ✓ Already correct: ${alreadyCorrect}`);
    console.log(`   ❌ Not found: ${notFound}`);
    console.log(`   📦 Total products: ${products.length}`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('✅ Disconnected from database');
  }
}

// Run the script
fixMedicineImageUrls();

