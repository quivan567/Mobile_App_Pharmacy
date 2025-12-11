// Test với tài khoản thực của user
const testUserAccount = async () => {
  const API_BASE = 'http://localhost:5000';
  
  console.log('Testing with user account: 0942808839');
  
  try {
    // 1. Test login với tài khoản của user
    console.log('\n--- Testing login with user account ---');
    const loginResponse = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: '0942808839',
        password: '27082003Tai@'
      })
    });
    
    const loginResult = await loginResponse.json();
    console.log('Login result:', loginResult);
    
    if (loginResult.success) {
      const token = loginResult.data.token;
      const user = loginResult.data.user;
      
      console.log('✅ Login successful!');
      console.log('User ID:', user._id);
      console.log('User name:', user.firstName, user.lastName);
      console.log('User email:', user.email);
      console.log('User phone:', user.phone);
      console.log('User role:', user.role);
      
      // 2. Test đặt hàng với tài khoản đã đăng nhập
      console.log('\n--- Testing order creation with authenticated user ---');
      const orderResponse = await fetch(`${API_BASE}/api/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          items: [
            {
              productId: '68e404e4ac5f7d32f238b924',
              quantity: 1,
              price: 85000
            }
          ],
          shippingAddress: '110 đường số 19, Phường 8, Quận Gò Vấp, Thành phố Hồ Chí Minh',
          shippingPhone: '0942808839',
          paymentMethod: 'cash',
          notes: 'Địa chỉ: 110 đường số 19, Phường 8, Quận Gò Vấp, Thành phố Hồ Chí Minh'
        })
      });
      
      const orderResult = await orderResponse.json();
      console.log('Order creation result:', orderResult);
      
      if (orderResult.success) {
        const orderId = orderResult.data._id;
        const orderNumber = orderResult.data.orderNumber;
        
        console.log('✅ Order created successfully!');
        console.log('Order ID:', orderId);
        console.log('Order Number:', orderNumber);
        console.log('User ID in order:', orderResult.data.userId);
        
        // 3. Test lấy lịch sử đơn hàng
        console.log('\n--- Testing user order history ---');
        const userOrdersResponse = await fetch(`${API_BASE}/api/orders`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        const userOrdersResult = await userOrdersResponse.json();
        console.log('User orders result:', userOrdersResult);
        
        if (userOrdersResult.success) {
          const userOrders = userOrdersResult.data;
          console.log('✅ User order history retrieved!');
          console.log('Total orders:', userOrders.length);
          
          // Tìm order vừa tạo
          const newOrder = userOrders.find(order => order._id === orderId);
          if (newOrder) {
            console.log('✅ New order found in user history!');
            console.log('Order details:', {
              id: newOrder._id,
              number: newOrder.orderNumber,
              status: newOrder.status,
              totalAmount: newOrder.totalAmount,
              createdAt: newOrder.createdAt
            });
          } else {
            console.log('❌ New order not found in user history');
          }
        }
        
        // 4. Test track order
        console.log('\n--- Testing order tracking ---');
        const trackResponse = await fetch(`${API_BASE}/api/orders/track/${orderNumber}`);
        const trackResult = await trackResponse.json();
        console.log('Track result:', trackResult);
        
        if (trackResult.success) {
          console.log('✅ Order tracking successful!');
          console.log('Order status:', trackResult.data.status);
          console.log('Order total:', trackResult.data.totalAmount);
        }
      }
    } else {
      console.log('❌ Login failed:', loginResult.message);
      
      // Nếu login thất bại, có thể tài khoản chưa tồn tại
      console.log('\n--- Attempting to create user account ---');
      const createUserResponse = await fetch(`${API_BASE}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phone: '0942808839',
          password: '27082003Tai@',
          firstName: 'Khách',
          lastName: 'Hàng',
          email: 'user0942808839@example.com'
        })
      });
      
      const createUserResult = await createUserResponse.json();
      console.log('Create user result:', createUserResult);
      
      if (createUserResult.success) {
        console.log('✅ User account created successfully!');
        console.log('Please try logging in again.');
      }
    }
  } catch (error) {
    console.error('❌ Error:', error);
  }
};

testUserAccount();
