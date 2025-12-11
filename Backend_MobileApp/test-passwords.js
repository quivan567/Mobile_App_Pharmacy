// Test with different passwords
const testDifferentPasswords = async () => {
  const API_BASE = 'http://localhost:5000';
  const passwords = ['123456', 'password', '123456789', 'admin'];
  
  for (const password of passwords) {
    console.log(`\nTesting login with password: ${password}`);
    try {
      const loginResponse = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: '0942808839',
          password: password
        })
      });
      
      const loginResult = await loginResponse.json();
      console.log('Login result:', loginResult);
      
      if (loginResult.success) {
        console.log('SUCCESS! Password is:', password);
        break;
      }
    } catch (error) {
      console.error('Login error:', error);
    }
  }
};

testDifferentPasswords();
