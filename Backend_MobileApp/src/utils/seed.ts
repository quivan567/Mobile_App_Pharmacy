import { connectDB } from '../config/database.js';
import { Category, Product, User, Supplier, Invoice, Import, Export, StockMovement } from '../models/schema.js';
import bcrypt from 'bcryptjs';

const seedData = async () => {
  try {
    console.log('🌱 Starting database seeding...');

    // Connect to database
    await connectDB();

    // Clear existing data
    await User.deleteMany({});
    await Product.deleteMany({});
    await Category.deleteMany({});

    console.log('🗑️ Cleared existing data');

    // Create categories
    const categories = await Category.insertMany([
      {
        name: 'Thuốc',
        icon: 'Pill',
        slug: 'thuoc',
        description: 'Các loại thuốc kê đơn và không kê đơn',
      },
      {
        name: 'Thực phẩm bảo vệ sức khỏe',
        icon: 'Sparkles',
        slug: 'thuc-pham-bao-ve-suc-khoe',
        description: 'Vitamin, khoáng chất và thực phẩm chức năng',
      },
      {
        name: 'Chăm sóc cá nhân',
        icon: 'Heart',
        slug: 'cham-soc-ca-nhan',
        description: 'Sản phẩm chăm sóc sức khỏe cá nhân',
      },
      {
        name: 'Chăm sóc sắc đẹp',
        icon: 'Sparkles',
        slug: 'cham-soc-sac-dep',
        description: 'Mỹ phẩm và sản phẩm làm đẹp',
      },
      {
        name: 'Thiết bị y tế',
        icon: 'Syringe',
        slug: 'thiet-bi-y-te',
        description: 'Các thiết bị y tế và dụng cụ chăm sóc sức khỏe',
      },
    ]);

    console.log('📂 Created categories');

    // Create sample products
    const products = await Product.insertMany([
      {
        name: 'Paracetamol 500mg',
        description: 'Thuốc giảm đau, hạ sốt hiệu quả',
        price: 25000,
        originalPrice: 30000,
        discountPercentage: 17,
        imageUrl: 'https://via.placeholder.com/300x300?text=Paracetamol',
        categoryId: categories[0]!._id,
        brand: 'Traphaco',
        unit: 'Hộp 10 viên',
        inStock: true,
        stockQuantity: 100,
        isHot: true,
        isNewProduct: false,
        isPrescription: false,
      },
      {
        name: 'Vitamin C 1000mg',
        description: 'Tăng cường sức đề kháng, chống oxy hóa',
        price: 150000,
        originalPrice: 180000,
        discountPercentage: 17,
        imageUrl: 'https://via.placeholder.com/300x300?text=Vitamin+C',
        categoryId: categories[1]!._id,
        brand: 'Nature Made',
        unit: 'Hộp 100 viên',
        inStock: true,
        stockQuantity: 50,
        isHot: true,
        isNewProduct: true,
        isPrescription: false,
      },
      {
        name: 'Kem chống nắng SPF 50+',
        description: 'Bảo vệ da khỏi tia UV, chống lão hóa',
        price: 350000,
        originalPrice: 400000,
        discountPercentage: 13,
        imageUrl: 'https://via.placeholder.com/300x300?text=Sunscreen',
        categoryId: categories[3]!._id,
        brand: 'La Roche-Posay',
        unit: 'Tuýp 50ml',
        inStock: true,
        stockQuantity: 30,
        isHot: false,
        isNewProduct: true,
        isPrescription: false,
      },
      {
        name: 'Nhiệt kế điện tử',
        description: 'Đo nhiệt độ cơ thể chính xác, dễ sử dụng',
        price: 120000,
        originalPrice: 150000,
        discountPercentage: 20,
        imageUrl: 'https://via.placeholder.com/300x300?text=Thermometer',
        categoryId: categories[4]!._id,
        brand: 'Omron',
        unit: 'Cái',
        inStock: true,
        stockQuantity: 25,
        isHot: false,
        isNewProduct: false,
        isPrescription: false,
      },
      {
        name: 'Probiotics cho trẻ em',
        description: 'Hỗ trợ tiêu hóa, tăng cường miễn dịch',
        price: 280000,
        originalPrice: 320000,
        discountPercentage: 13,
        imageUrl: 'https://via.placeholder.com/300x300?text=Probiotics',
        categoryId: categories[1]!._id,
        brand: 'BioGaia',
        unit: 'Hộp 30 gói',
        inStock: true,
        stockQuantity: 40,
        isHot: true,
        isNewProduct: false,
        isPrescription: false,
      },
    ]);

    console.log('💊 Created products');

    // Create sample suppliers
    const suppliers = await Supplier.insertMany([
      {
        name: 'Công ty TNHH Dược phẩm Traphaco',
        contactPerson: 'Nguyễn Văn A',
        email: 'contact@traphaco.com',
        phone: '024-3823-4567',
        address: '75 Yên Ninh, Ba Đình, Hà Nội',
        taxCode: '0101234567',
        bankAccount: '1234567890',
        bankName: 'Vietcombank',
        isActive: true,
        notes: 'Nhà cung cấp thuốc uy tín'
      },
      {
        name: 'Công ty CP Dược phẩm Hậu Giang',
        contactPerson: 'Trần Thị B',
        email: 'info@hagiangpharma.com',
        phone: '0292-3823-4567',
        address: '288 Bis Nguyễn Văn Cừ, Ninh Kiều, Cần Thơ',
        taxCode: '1801234567',
        bankAccount: '0987654321',
        bankName: 'BIDV',
        isActive: true,
        notes: 'Chuyên cung cấp thuốc kê đơn'
      },
      {
        name: 'Công ty TNHH Dược phẩm Sanofi',
        contactPerson: 'Lê Văn C',
        email: 'contact@sanofi.com',
        phone: '028-3823-4567',
        address: '123 Nguyễn Huệ, Quận 1, TP.HCM',
        taxCode: '0301234567',
        bankAccount: '1122334455',
        bankName: 'ACB',
        isActive: true,
        notes: 'Nhà cung cấp thuốc quốc tế'
      }
    ]);

    console.log('🏭 Created suppliers');

    // Update products with expiration dates and suppliers
    const today = new Date();
    const sixMonthsFromNow = new Date();
    sixMonthsFromNow.setMonth(today.getMonth() + 6);
    const oneYearFromNow = new Date();
    oneYearFromNow.setFullYear(today.getFullYear() + 1);
    const twoYearsFromNow = new Date();
    twoYearsFromNow.setFullYear(today.getFullYear() + 2);

    await Product.updateMany(
      { name: 'Paracetamol 500mg' },
      {
        expirationDate: oneYearFromNow,
        batchNumber: 'PAR-2024-001',
        manufacturingDate: new Date('2024-01-15'),
        supplierId: suppliers[0]!._id
      }
    );

    await Product.updateMany(
      { name: 'Vitamin C 1000mg' },
      {
        expirationDate: twoYearsFromNow,
        batchNumber: 'VIT-2024-002',
        manufacturingDate: new Date('2024-02-01'),
        supplierId: suppliers[1]!._id
      }
    );

    await Product.updateMany(
      { name: 'Kem chống nắng SPF 50+' },
      {
        expirationDate: sixMonthsFromNow,
        batchNumber: 'SUN-2024-003',
        manufacturingDate: new Date('2024-03-01'),
        supplierId: suppliers[2]!._id
      }
    );

    await Product.updateMany(
      { name: 'Nhiệt kế điện tử' },
      {
        expirationDate: twoYearsFromNow,
        batchNumber: 'THM-2024-004',
        manufacturingDate: new Date('2024-01-20'),
        supplierId: suppliers[0]!._id
      }
    );

    await Product.updateMany(
      { name: 'Probiotics cho trẻ em' },
      {
        expirationDate: oneYearFromNow,
        batchNumber: 'PRO-2024-005',
        manufacturingDate: new Date('2024-02-15'),
        supplierId: suppliers[1]!._id
      }
    );

    console.log('📅 Updated products with expiration dates and suppliers');

    // Create admin user
    const hashedPassword = await bcrypt.hash('admin123', 12);
    const adminUser = await User.create({
      email: 'admin@pharmacy.com',
      phone: '0123456789',
      password: hashedPassword,
      firstName: 'Admin',
      lastName: 'Pharmacy',
      role: 'admin',
      isVerified: true,
    });

    // Create sample customer
    const customerPassword = await bcrypt.hash('customer123', 12);
    const customer = await User.create({
      email: 'customer@example.com',
      phone: '0987654321',
      password: customerPassword,
      firstName: 'Nguyễn',
      lastName: 'Văn A',
      role: 'customer',
      isVerified: true,
    });

    console.log('👥 Created users');

    // Create sample invoice
    const sampleInvoice = await Invoice.create({
      invoiceNumber: 'INV-20241201-0001',
      customerId: customer._id,
      customerName: 'Nguyễn Văn A',
      customerPhone: '0123456789',
      customerAddress: '123 Đường ABC, Quận XYZ, TP.HCM',
      customerEmail: 'customer@example.com',
      items: [
        {
          productId: products[0]!._id,
          productName: products[0]!.name,
          quantity: 2,
          unitPrice: products[0]!.price,
          discountAmount: products[0]!.price * 2 * 0.1, // 10% discount
          discountPercentage: 10,
          totalPrice: products[0]!.price * 2 * 0.9,
          batchNumber: products[0]!.batchNumber,
          expirationDate: products[0]!.expirationDate
        },
        {
          productId: products[1]!._id,
          productName: products[1]!.name,
          quantity: 1,
          unitPrice: products[1]!.price,
          discountAmount: 0,
          discountPercentage: 0,
          totalPrice: products[1]!.price,
          batchNumber: products[1]!.batchNumber,
          expirationDate: products[1]!.expirationDate
        }
      ],
      subtotal: (products[0]!.price * 2 * 0.9) + products[1]!.price,
      discountAmount: 0,
      discountPercentage: 0,
      taxAmount: ((products[0]!.price * 2 * 0.9) + products[1]!.price) * 0.1,
      taxPercentage: 10,
      totalAmount: ((products[0]!.price * 2 * 0.9) + products[1]!.price) * 1.1,
      paymentMethod: 'cash',
      paymentStatus: 'paid',
      status: 'completed',
      notes: 'Khách hàng VIP - giảm giá đặc biệt',
      pharmacistId: adminUser._id
    });

    console.log('📄 Created sample invoice');

    // Create sample import
    const sampleImport = await Import.create({
      importNumber: 'IMP-20241201-0001',
      supplierId: suppliers[0]!._id,
      supplierName: suppliers[0]!.name,
      items: [
        {
          productId: products[0]!._id,
          productName: products[0]!.name,
          quantity: 100,
          unitPrice: 20000,
          totalPrice: 2000000,
          batchNumber: 'IMP-2024-001',
          expirationDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
          manufacturingDate: new Date(),
          receivedQuantity: 100,
          status: 'completed'
        },
        {
          productId: products[1]!._id,
          productName: products[1]!.name,
          quantity: 50,
          unitPrice: 140000,
          totalPrice: 7000000,
          batchNumber: 'IMP-2024-002',
          expirationDate: new Date(Date.now() + 730 * 24 * 60 * 60 * 1000), // 2 years from now
          manufacturingDate: new Date(),
          receivedQuantity: 50,
          status: 'completed'
        }
      ],
      totalQuantity: 150,
      totalAmount: 9000000,
      status: 'completed',
      notes: 'Nhập kho từ nhà cung cấp uy tín',
      receivedBy: adminUser._id,
      receivedAt: new Date()
    });

    console.log('📦 Created sample import');

    // Create sample export
    const sampleExport = await Export.create({
      exportNumber: 'EXP-20241201-0001',
      reason: 'damage',
      items: [
        {
          productId: products[0]!._id,
          productName: products[0]!.name,
          quantity: 5,
          batchNumber: 'IMP-2024-001',
          expirationDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          reason: 'Hàng hư hỏng trong quá trình vận chuyển',
          status: 'completed'
        }
      ],
      totalQuantity: 5,
      status: 'completed',
      notes: 'Xuất kho hàng hư hỏng',
      issuedBy: adminUser._id,
      issuedAt: new Date()
    });

    console.log('📤 Created sample export');

    // Create sample stock movements
    await StockMovement.create([
      {
        productId: products[0]!._id,
        productName: products[0]!.name,
        movementType: 'import',
        quantity: 100,
        previousStock: 0,
        newStock: 100,
        referenceType: 'import',
        referenceId: sampleImport._id,
        referenceNumber: sampleImport.importNumber,
        batchNumber: 'IMP-2024-001',
        expirationDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        reason: 'Import from supplier',
        performedBy: adminUser._id
      },
      {
        productId: products[1]!._id,
        productName: products[1]!.name,
        movementType: 'import',
        quantity: 50,
        previousStock: 0,
        newStock: 50,
        referenceType: 'import',
        referenceId: sampleImport._id,
        referenceNumber: sampleImport.importNumber,
        batchNumber: 'IMP-2024-002',
        expirationDate: new Date(Date.now() + 730 * 24 * 60 * 60 * 1000),
        reason: 'Import from supplier',
        performedBy: adminUser._id
      },
      {
        productId: products[0]!._id,
        productName: products[0]!.name,
        movementType: 'sale',
        quantity: -2,
        previousStock: 100,
        newStock: 98,
        referenceType: 'invoice',
        referenceId: sampleInvoice._id,
        referenceNumber: sampleInvoice.invoiceNumber,
        batchNumber: 'IMP-2024-001',
        expirationDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        reason: 'Sale to customer',
        performedBy: adminUser._id
      },
      {
        productId: products[1]!._id,
        productName: products[1]!.name,
        movementType: 'sale',
        quantity: -1,
        previousStock: 50,
        newStock: 49,
        referenceType: 'invoice',
        referenceId: sampleInvoice._id,
        referenceNumber: sampleInvoice.invoiceNumber,
        batchNumber: 'IMP-2024-002',
        expirationDate: new Date(Date.now() + 730 * 24 * 60 * 60 * 1000),
        reason: 'Sale to customer',
        performedBy: adminUser._id
      },
      {
        productId: products[0]!._id,
        productName: products[0]!.name,
        movementType: 'export',
        quantity: -5,
        previousStock: 98,
        newStock: 93,
        referenceType: 'export',
        referenceId: sampleExport._id,
        referenceNumber: sampleExport.exportNumber,
        batchNumber: 'IMP-2024-001',
        expirationDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        reason: 'Hàng hư hỏng trong quá trình vận chuyển',
        performedBy: adminUser._id
      }
    ]);

    console.log('📊 Created sample stock movements');

    console.log('✅ Database seeding completed successfully!');
    console.log('\n📋 Sample data created:');
    console.log(`- ${categories.length} categories`);
    console.log(`- ${products.length} products`);
    console.log(`- ${suppliers.length} suppliers`);
    console.log(`- 2 users (admin & customer)`);
    console.log(`- 1 sample invoice`);
    console.log(`- 1 sample import`);
    console.log(`- 1 sample export`);
    console.log(`- 5 sample stock movements`);
    console.log('\n🔑 Login credentials:');
    console.log('Admin: admin@pharmacy.com / admin123');
    console.log('Customer: customer@example.com / customer123');
    console.log('\n📄 Sample data:');
    console.log(`Invoice: ${sampleInvoice.invoiceNumber} - ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(sampleInvoice.totalAmount)}`);
    console.log(`Import: ${sampleImport.importNumber} - ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(sampleImport.totalAmount)}`);
    console.log(`Export: ${sampleExport.exportNumber} - ${sampleExport.reason}`);

  } catch (error) {
    console.error('❌ Seeding failed:', error);
  } finally {
    process.exit(0);
  }
};

seedData();



