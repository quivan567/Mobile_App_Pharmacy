// Test MongoDB connection using direct API call
const testMongoViaAPI = async () => {
  const API_BASE = 'http://localhost:5000';
  
  try {
    console.log('🔍 Testing MongoDB connection via API...');
    
    // 1. Login để lấy token
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
    
    const loginData = await loginResponse.json();
    
    if (!loginData.success) {
      console.log('❌ Login failed');
      return;
    }
    
    const token = loginData.data.token;
    const userId = loginData.data.user._id;
    
    console.log('✅ Login successful!');
    console.log('User ID:', userId);
    console.log('User isActive:', loginData.data.user.isActive);
    
    // 2. Test authenticated endpoint với token
    console.log('\n--- Testing authenticated endpoint ---');
    const authResponse = await fetch(`${API_BASE}/api/orders/most-recent`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Auth response status:', authResponse.status);
    const authResult = await authResponse.json();
    console.log('Auth result:', authResult);
    
    // 3. Test user orders endpoint
    console.log('\n--- Testing user orders endpoint ---');
    const ordersResponse = await fetch(`${API_BASE}/api/orders`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Orders response status:', ordersResponse.status);
    const ordersResult = await ordersResponse.json();
    console.log('Orders result:', ordersResult);
    
    // 4. Test user stats endpoint
    console.log('\n--- Testing user stats endpoint ---');
    const statsResponse = await fetch(`${API_BASE}/api/orders/stats`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Stats response status:', statsResponse.status);
    const statsResult = await statsResponse.json();
    console.log('Stats result:', statsResult);
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
};

testMongoViaAPI();
