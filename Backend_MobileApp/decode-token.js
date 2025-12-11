// Decode JWT token to check userId format
const decodeToken = async () => {
  const API_BASE = 'http://localhost:5000';
  
  try {
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
    console.log('User ID from login:', userId);
    console.log('User ID length:', userId.length);
    
    // 2. Decode token manually (without verification)
    console.log('\n--- Decoding token manually ---');
    const tokenParts = token.split('.');
    const payload = JSON.parse(atob(tokenParts[1]));
    
    console.log('Decoded payload:', payload);
    console.log('Decoded userId:', payload.userId);
    console.log('Decoded userId length:', payload.userId.length);
    
    // 3. Compare user IDs
    console.log('\n--- Comparing user IDs ---');
    console.log('Login userId:', userId);
    console.log('Decoded userId:', payload.userId);
    console.log('Are they equal?', userId === payload.userId);
    console.log('Are they equal (toString)?', userId.toString() === payload.userId.toString());
    
    // 4. Check if they are valid ObjectIds
    console.log('\n--- Checking ObjectId format ---');
    const isValidObjectId = (id) => {
      return /^[0-9a-fA-F]{24}$/.test(id);
    };
    
    console.log('Login userId is valid ObjectId:', isValidObjectId(userId));
    console.log('Decoded userId is valid ObjectId:', isValidObjectId(payload.userId));
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
};

decodeToken();
