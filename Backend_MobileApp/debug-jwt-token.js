// Debug JWT token
const debugJWTToken = async () => {
  const API_BASE = 'http://localhost:5000';
  
  console.log('Debugging JWT token...');
  
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
    
    const loginResult = await loginResponse.json();
    console.log('Login result:', loginResult);
    
    if (loginResult.success) {
      const token = loginResult.data.token;
      const user = loginResult.data.user;
      
      console.log('✅ Login successful!');
      console.log('Token:', token);
      console.log('User ID from login:', user._id);
      console.log('User isActive:', user.isActive);
      console.log('User isVerified:', user.isVerified);
      
      // 2. Decode JWT token manually
      console.log('\n--- Decoding JWT token ---');
      const jwt = await import('jsonwebtoken');
      const config = await import('./src/config/index.ts');
      
      try {
        const decoded = jwt.default.verify(token, config.default.jwtSecret);
        console.log('✅ JWT token is valid!');
        console.log('Decoded payload:', decoded);
        console.log('User ID from token:', decoded.userId);
        
        // 3. Check if user exists in database
        console.log('\n--- Checking user in database ---');
        const schema = await import('./src/models/schema.ts');
        const User = schema.User;
        const dbUser = await User.findById(decoded.userId).lean();
        
        if (dbUser) {
          console.log('✅ User found in database!');
          console.log('DB User ID:', dbUser._id);
          console.log('DB User isActive:', dbUser.isActive);
          console.log('DB User isVerified:', dbUser.isVerified);
          console.log('DB User role:', dbUser.role);
          
          // 4. Test authentication middleware manually
          console.log('\n--- Testing authentication middleware manually ---');
          const mockReq = {
            headers: {
              'authorization': `Bearer ${token}`
            }
          };
          
          // Simulate the middleware logic
          const authHeader = mockReq.headers['authorization'];
          const tokenFromHeader = authHeader && authHeader.split(' ')[1];
          
          if (tokenFromHeader === token) {
            console.log('✅ Token extraction works!');
            
            const decodedFromHeader = jwt.default.verify(tokenFromHeader, config.default.jwtSecret);
            console.log('✅ Token verification works!');
            console.log('Decoded from header:', decodedFromHeader);
            
            if (decodedFromHeader.userId === dbUser._id.toString()) {
              console.log('✅ User ID matches!');
              
              if (dbUser.isActive) {
                console.log('✅ User is active!');
                console.log('✅ Authentication should work!');
              } else {
                console.log('❌ User is not active!');
              }
            } else {
              console.log('❌ User ID does not match!');
            }
          } else {
            console.log('❌ Token extraction failed!');
          }
        } else {
          console.log('❌ User not found in database!');
        }
      } catch (jwtError) {
        console.log('❌ JWT token is invalid!');
        console.log('JWT Error:', jwtError.message);
      }
    }
  } catch (error) {
    console.error('❌ Error:', error);
  }
};

debugJWTToken();
