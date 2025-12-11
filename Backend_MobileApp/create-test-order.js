// Script to create a test order for the user
const API_BASE = 'http://localhost:5000';

async function createTestOrder() {
  console.log('Creating test order...');
  
  try {
    // Step 1: Login to get token
    console.log('1. Logging in...');
    const loginResponse = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: 'newuser@example.com',
        password: '123456'
      })
    });
    
    const loginData = await loginResponse.json();
    
    if (!loginData.success) {
      console.log('❌ Login failed:', loginData.message);
      return;
    }
    
    console.log('✅ Login successful!');
    const token = loginData.data.token;
    
    // Step 2: Get products to create order
    console.log('2. Getting products...');
    const productsResponse = await fetch(`${API_BASE}/api/products`);
    const productsData = await productsResponse.json();
    
    if (!productsData.success) {
      console.log('❌ Failed to get products:', productsData.message);
      return;
    }
    
    console.log('✅ Products loaded:', productsData.data.products.length, 'items');
    
    // Step 3: Create order with first product
    if (productsData.data.products.length > 0) {
      const product = productsData.data.products[0];
      console.log('3. Creating order with product:', product.name);
      
      const orderData = {
        items: [
          {
            productId: product._id,
            quantity: 2,
            price: product.price
          }
        ],
        shippingAddress: '123 Test Street, Ho Chi Minh City',
        shippingPhone: '0912345678',
        paymentMethod: 'cash',
        notes: 'Test order for order tracking'
      };
      
      const orderResponse = await fetch(`${API_BASE}/api/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(orderData)
      });
      
      const orderResult = await orderResponse.json();
      console.log('Order response:', orderResponse.status, orderResponse.statusText);
      console.log('Order data:', orderResult);
      
      if (orderResult.success) {
        console.log('✅ Test order created successfully!');
        console.log('Order ID:', orderResult.data._id);
        console.log('Order Number:', orderResult.data.orderNumber);
        
        // Test orders endpoint
        console.log('4. Testing orders endpoint...');
        const ordersResponse = await fetch(`${API_BASE}/api/orders`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        const ordersData = await ordersResponse.json();
        console.log('Orders data:', ordersData);
        
        // Test most-recent endpoint
        console.log('5. Testing most-recent endpoint...');
        const recentResponse = await fetch(`${API_BASE}/api/orders/most-recent`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        const recentData = await recentResponse.json();
        console.log('Recent data:', recentData);
        
      } else {
        console.log('❌ Failed to create order:', orderResult.message);
      }
    } else {
      console.log('❌ No products available to create order');
    }
    
  } catch (error) {
    console.error('❌ Failed to create test order:', error);
  }
}

// Run test
createTestOrder();
