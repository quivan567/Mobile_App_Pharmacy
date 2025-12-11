// Debug authentication issue
const debugAuthIssue = async () => {
  const API_BASE = 'http://localhost:5000';
  
  console.log('Debugging authentication issue...');
  
  try {
    // 1. Login để lấy token
    console.log('\n--- Step 1: Login ---');
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
      console.log('Token:', token.substring(0, 50) + '...');
      console.log('User ID:', user._id);
      console.log('User isActive:', user.isActive);
      console.log('User isVerified:', user.isVerified);
      
      // 2. Test authentication middleware
      console.log('\n--- Step 2: Test authentication middleware ---');
      const authTestResponse = await fetch(`${API_BASE}/api/orders`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('Auth test response status:', authTestResponse.status);
      const authTestResult = await authTestResponse.json();
      console.log('Auth test result:', authTestResult);
      
      // 3. Test order creation với token
      console.log('\n--- Step 3: Test order creation with token ---');
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
          shippingAddress: 'Test Address',
          shippingPhone: '0942808839',
          paymentMethod: 'cash'
        })
      });
      
      console.log('Order response status:', orderResponse.status);
      const orderResult = await orderResponse.json();
      console.log('Order result:', orderResult);
      
      if (orderResult.success) {
        console.log('Order created with userId:', orderResult.data.userId);
        
        if (orderResult.data.userId === null) {
          console.log('❌ PROBLEM: Order created as guest despite authentication!');
          console.log('This means the authentication middleware is not working properly.');
        } else {
          console.log('✅ Order created with correct user ID!');
        }
      }
    }
  } catch (error) {
    console.error('❌ Error:', error);
  }
};

debugAuthIssue();
