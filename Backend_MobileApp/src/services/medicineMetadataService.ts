import mongoose from 'mongoose';

/**
 * Service để đọc và quản lý metadata từ các collections:
 * - dosageforms: Dạng bào chế (Tablet, Capsule, Gel, Cream, v.v.)
 * - subcategories: Nhóm thuốc (NSAID, Paracetamol, Corticosteroid, v.v.)
 * - categories: Danh mục thuốc (Thuốc cơ xương khớp, Giảm đau hạ sốt, v.v.)
 */

interface DosageForm {
  _id?: mongoose.Types.ObjectId;
  name: string;
  nameEn?: string;
  nameVi?: string;
  description?: string;
  [key: string]: any;
}

interface Subcategory {
  _id?: mongoose.Types.ObjectId;
  name: string;
  nameEn?: string;
  nameVi?: string;
  description?: string;
  [key: string]: any;
}

interface Category {
  _id?: mongoose.Types.ObjectId;
  name: string;
  nameEn?: string;
  nameVi?: string;
  description?: string;
  [key: string]: any;
}

class MedicineMetadataService {
  private dosageFormsCache: DosageForm[] = [];
  private subcategoriesCache: Subcategory[] = [];
  private categoriesCache: Category[] = [];
  private cacheTimestamp: number = 0;
  private cacheTTL: number = 60 * 60 * 1000; // 1 giờ

  /**
   * Kiểm tra xem cache có còn hợp lệ không
   */
  private isCacheValid(): boolean {
    return Date.now() - this.cacheTimestamp < this.cacheTTL && 
           this.dosageFormsCache.length > 0 &&
           this.subcategoriesCache.length > 0;
  }

  /**
   * Đọc tất cả dosage forms từ collection dosageforms
   */
  async getDosageForms(): Promise<DosageForm[]> {
    if (this.isCacheValid()) {
      console.log(`📚 [MedicineMetadataService] Using cached dosage forms (${this.dosageFormsCache.length} items)`);
      return this.dosageFormsCache;
    }

    try {
      const db = mongoose.connection.db;
      if (!db) {
        throw new Error('Database connection not available');
      }

      const collection = db.collection('dosageforms');
      const dosageForms = await collection.find({}).toArray();
      
      this.dosageFormsCache = dosageForms as DosageForm[];
      console.log(`✅ [MedicineMetadataService] Loaded ${this.dosageFormsCache.length} dosage forms from database`);
      
      return this.dosageFormsCache;
    } catch (error) {
      console.error('❌ [MedicineMetadataService] Error loading dosage forms:', error);
      return [];
    }
  }

  /**
   * Đọc tất cả subcategories từ collection subcategories
   */
  async getSubcategories(): Promise<Subcategory[]> {
    if (this.isCacheValid()) {
      console.log(`📚 [MedicineMetadataService] Using cached subcategories (${this.subcategoriesCache.length} items)`);
      return this.subcategoriesCache;
    }

    try {
      const db = mongoose.connection.db;
      if (!db) {
        throw new Error('Database connection not available');
      }

      const collection = db.collection('subcategories');
      const subcategories = await collection.find({}).toArray();
      
      this.subcategoriesCache = subcategories as Subcategory[];
      console.log(`✅ [MedicineMetadataService] Loaded ${this.subcategoriesCache.length} subcategories from database`);
      
      return this.subcategoriesCache;
    } catch (error) {
      console.error('❌ [MedicineMetadataService] Error loading subcategories:', error);
      return [];
    }
  }

  /**
   * Đọc tất cả categories từ collection categories (nếu có)
   */
  async getCategories(): Promise<Category[]> {
    if (this.isCacheValid() && this.categoriesCache.length > 0) {
      console.log(`📚 [MedicineMetadataService] Using cached categories (${this.categoriesCache.length} items)`);
      return this.categoriesCache;
    }

    try {
      const db = mongoose.connection.db;
      if (!db) {
        throw new Error('Database connection not available');
      }

      const collection = db.collection('categories');
      const categories = await collection.find({}).toArray();
      
      this.categoriesCache = categories as Category[];
      console.log(`✅ [MedicineMetadataService] Loaded ${this.categoriesCache.length} categories from database`);
      
      return this.categoriesCache;
    } catch (error) {
      console.error('❌ [MedicineMetadataService] Error loading categories:', error);
      return [];
    }
  }

  /**
   * Load tất cả metadata và cache
   */
  async loadAllMetadata(): Promise<void> {
    try {
      console.log('🔄 [MedicineMetadataService] Loading all metadata from database...');
      
      await Promise.all([
        this.getDosageForms(),
        this.getSubcategories(),
        this.getCategories()
      ]);

      this.cacheTimestamp = Date.now();
      console.log(`✅ [MedicineMetadataService] All metadata loaded and cached`);
      console.log(`   - Dosage Forms: ${this.dosageFormsCache.length}`);
      console.log(`   - Subcategories: ${this.subcategoriesCache.length}`);
      console.log(`   - Categories: ${this.categoriesCache.length}`);
    } catch (error) {
      console.error('❌ [MedicineMetadataService] Error loading all metadata:', error);
    }
  }

  /**
   * Tìm dosage form theo tên (linh hoạt, không phân biệt hoa thường)
   */
  findDosageForm(name: string): DosageForm | null {
    if (!name) return null;
    
    const normalizedSearch = name.trim().toLowerCase();
    
    // Tìm exact match
    let found = this.dosageFormsCache.find(df => {
      const dfName = (df.name || '').toLowerCase();
      const dfNameEn = (df.nameEn || '').toLowerCase();
      const dfNameVi = (df.nameVi || '').toLowerCase();
      return dfName === normalizedSearch || 
             dfNameEn === normalizedSearch || 
             dfNameVi === normalizedSearch;
    });

    if (found) return found;

    // Tìm partial match
    found = this.dosageFormsCache.find(df => {
      const dfName = (df.name || '').toLowerCase();
      const dfNameEn = (df.nameEn || '').toLowerCase();
      const dfNameVi = (df.nameVi || '').toLowerCase();
      return dfName.includes(normalizedSearch) || 
             dfNameEn.includes(normalizedSearch) || 
             dfNameVi.includes(normalizedSearch) ||
             normalizedSearch.includes(dfName) ||
             normalizedSearch.includes(dfNameEn) ||
             normalizedSearch.includes(dfNameVi);
    });

    return found || null;
  }

  /**
   * Tìm subcategory theo tên (linh hoạt, không phân biệt hoa thường)
   */
  findSubcategory(name: string): Subcategory | null {
    if (!name) return null;
    
    const normalizedSearch = name.trim().toLowerCase();
    
    // Tìm exact match
    let found = this.subcategoriesCache.find(sc => {
      const scName = (sc.name || '').toLowerCase();
      const scNameEn = (sc.nameEn || '').toLowerCase();
      const scNameVi = (sc.nameVi || '').toLowerCase();
      return scName === normalizedSearch || 
             scNameEn === normalizedSearch || 
             scNameVi === normalizedSearch;
    });

    if (found) return found;

    // Tìm partial match
    found = this.subcategoriesCache.find(sc => {
      const scName = (sc.name || '').toLowerCase();
      const scNameEn = (sc.nameEn || '').toLowerCase();
      const scNameVi = (sc.nameVi || '').toLowerCase();
      return scName.includes(normalizedSearch) || 
             scNameEn.includes(normalizedSearch) || 
             scNameVi.includes(normalizedSearch) ||
             normalizedSearch.includes(scName) ||
             normalizedSearch.includes(scNameEn) ||
             normalizedSearch.includes(scNameVi);
    });

    return found || null;
  }

  /**
   * Tìm category theo tên (linh hoạt, không phân biệt hoa thường)
   */
  findCategory(name: string): Category | null {
    if (!name) return null;
    
    const normalizedSearch = name.trim().toLowerCase();
    
    // Tìm exact match
    let found = this.categoriesCache.find(cat => {
      const catName = (cat.name || '').toLowerCase();
      const catNameEn = (cat.nameEn || '').toLowerCase();
      const catNameVi = (cat.nameVi || '').toLowerCase();
      return catName === normalizedSearch || 
             catNameEn === normalizedSearch || 
             catNameVi === normalizedSearch;
    });

    if (found) return found;

    // Tìm partial match
    found = this.categoriesCache.find(cat => {
      const catName = (cat.name || '').toLowerCase();
      const catNameEn = (cat.nameEn || '').toLowerCase();
      const catNameVi = (cat.nameVi || '').toLowerCase();
      return catName.includes(normalizedSearch) || 
             catNameEn.includes(normalizedSearch) || 
             catNameVi.includes(normalizedSearch) ||
             normalizedSearch.includes(catName) ||
             normalizedSearch.includes(catNameEn) ||
             normalizedSearch.includes(catNameVi);
    });

    return found || null;
  }

  /**
   * Kiểm tra xem hai dosage forms có tương đương không
   */
  async areDosageFormsEquivalent(form1: string, form2: string): Promise<boolean> {
    if (!form1 || !form2) return false;
    
    // Normalize
    const normalized1 = form1.trim().toLowerCase();
    const normalized2 = form2.trim().toLowerCase();
    
    if (normalized1 === normalized2) return true;
    
    // Đảm bảo cache đã được load
    if (this.dosageFormsCache.length === 0) {
      await this.getDosageForms();
    }

    // Tìm cả hai trong database
    const found1 = this.findDosageForm(form1);
    const found2 = this.findDosageForm(form2);

    // Nếu cả hai đều tìm thấy và có cùng _id hoặc name
    if (found1 && found2) {
      return found1._id?.toString() === found2._id?.toString() ||
             (found1.name || '').toLowerCase() === (found2.name || '').toLowerCase();
    }

    // Nếu chỉ một trong hai tìm thấy, so sánh với name của item tìm được
    if (found1) {
      const found1Name = (found1.name || '').toLowerCase();
      return found1Name === normalized2 || 
             (found1.nameEn || '').toLowerCase() === normalized2 ||
             (found1.nameVi || '').toLowerCase() === normalized2;
    }

    if (found2) {
      const found2Name = (found2.name || '').toLowerCase();
      return found2Name === normalized1 || 
             (found2.nameEn || '').toLowerCase() === normalized1 ||
             (found2.nameVi || '').toLowerCase() === normalized1;
    }

    return false;
  }

  /**
   * Kiểm tra xem hai subcategories có tương đương không
   */
  async areSubcategoriesEquivalent(sub1: string, sub2: string): Promise<boolean> {
    if (!sub1 || !sub2) {
      // Nếu một trong hai là rỗng hoặc "N/A", cho phép match (database có thể thiếu dữ liệu)
      if (!sub1 || sub1.trim().toLowerCase() === 'n/a' || sub1.trim().toLowerCase() === 'na' || sub1.trim() === '') return true;
      if (!sub2 || sub2.trim().toLowerCase() === 'n/a' || sub2.trim().toLowerCase() === 'na' || sub2.trim() === '') return true;
      return false;
    }
    
    // Normalize
    const normalized1 = sub1.trim().toLowerCase();
    const normalized2 = sub2.trim().toLowerCase();
    
    if (normalized1 === normalized2) return true;
    
    // Đảm bảo cache đã được load
    if (this.subcategoriesCache.length === 0) {
      await this.getSubcategories();
    }

    // Tìm cả hai trong database
    const found1 = this.findSubcategory(sub1);
    const found2 = this.findSubcategory(sub2);

    // Nếu cả hai đều tìm thấy và có cùng _id hoặc name
    if (found1 && found2) {
      return found1._id?.toString() === found2._id?.toString() ||
             (found1.name || '').toLowerCase() === (found2.name || '').toLowerCase();
    }

    // Nếu chỉ một trong hai tìm thấy, so sánh với name của item tìm được
    if (found1) {
      const found1Name = (found1.name || '').toLowerCase();
      return found1Name === normalized2 || 
             (found1.nameEn || '').toLowerCase() === normalized2 ||
             (found1.nameVi || '').toLowerCase() === normalized2;
    }

    if (found2) {
      const found2Name = (found2.name || '').toLowerCase();
      return found2Name === normalized1 || 
             (found2.nameEn || '').toLowerCase() === normalized1 ||
             (found2.nameVi || '').toLowerCase() === normalized1;
    }

    return false;
  }

  /**
   * Invalidate cache (force reload)
   */
  invalidateCache(): void {
    this.dosageFormsCache = [];
    this.subcategoriesCache = [];
    this.categoriesCache = [];
    this.cacheTimestamp = 0;
    console.log('🔄 [MedicineMetadataService] Cache invalidated');
  }

  /**
   * Lấy tất cả dữ liệu metadata (để debug hoặc export)
   */
  async getAllMetadata() {
    await this.loadAllMetadata();
    return {
      dosageForms: this.dosageFormsCache,
      subcategories: this.subcategoriesCache,
      categories: this.categoriesCache,
      cacheTimestamp: this.cacheTimestamp
    };
  }
}

// Export singleton instance
export const medicineMetadataService = new MedicineMetadataService();

