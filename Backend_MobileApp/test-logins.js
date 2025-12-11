// Simple script to test login with common credentials
const API_BASE = 'http://localhost:5000';

async function testCommonLogins() {
  console.log('Testing common login credentials...');
  
  const testCredentials = [
    { username: 'admin', password: 'admin' },
    { username: 'admin@admin.com', password: 'admin' },
    { username: 'test@test.com', password: 'test' },
    { username: 'user@user.com', password: 'user' },
    { username: '0987654321', password: '123456' },
    { username: 'test@example.com', password: '123456' }
  ];
  
  for (const cred of testCredentials) {
    try {
      console.log(`\nTesting: ${cred.username} / ${cred.password}`);
      
      const loginResponse = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(cred)
      });
      
      const loginData = await loginResponse.json();
      
      if (loginData.success) {
        console.log('✅ Login successful!');
        console.log('User:', loginData.data.user);
        console.log('Token:', loginData.data.token);
        
        // Test orders endpoint
        const ordersResponse = await fetch(`${API_BASE}/api/orders`, {
          headers: {
            'Authorization': `Bearer ${loginData.data.token}`
          }
        });
        
        const ordersData = await ordersResponse.json();
        console.log('Orders:', ordersData);
        
        return; // Stop after first successful login
      } else {
        console.log('❌ Login failed:', loginData.message);
      }
    } catch (error) {
      console.log('❌ Error:', error.message);
    }
  }
  
  console.log('\n❌ No valid credentials found. You may need to create a user first.');
}

// Run test
testCommonLogins();
