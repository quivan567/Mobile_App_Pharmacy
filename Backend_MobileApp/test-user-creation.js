// Test user creation and login
const testUserCreation = async () => {
  const API_BASE = 'http://localhost:5000';
  
  // First, generate OTP
  console.log('Generating OTP...');
  try {
    const otpResponse = await fetch(`${API_BASE}/api/auth/send-otp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phone: '0942808839',
        method: 'sms'
      })
    });
    
    const otpResult = await otpResponse.json();
    console.log('OTP result:', otpResult);
    
    if (otpResult.success) {
      // Use the OTP from the response (for development)
      const otp = otpResult.data.otp || '123456';
      console.log('Using OTP:', otp);
      
      // Register user
      console.log('\nRegistering user...');
      const registerResponse = await fetch(`${API_BASE}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phone: '0942808839',
          otp: otp,
          password: '123456',
          email: 'test@example.com'
        })
      });
      
      const registerResult = await registerResponse.json();
      console.log('Register result:', registerResult);
      
      if (registerResult.success) {
        const token = registerResult.data.token;
        console.log('Got token:', token.substring(0, 50) + '...');
        
        // Now test order creation with real token
        console.log('\nTesting order creation with real token...');
        const orderResponse = await fetch(`${API_BASE}/api/orders`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            items: [
              {
                productId: '507f1f77bcf86cd799439011',
                quantity: 1,
                price: 100000
              }
            ],
            shippingAddress: 'Test Address',
            shippingPhone: '0123456789',
            paymentMethod: 'cash'
          })
        });
        
        const orderResult = await orderResponse.json();
        console.log('Order creation result:', orderResult);
      }
    }
  } catch (error) {
    console.error('Error:', error);
  }
};

testUserCreation();
