// Test localStorage token handling
const testLocalStorage = () => {
  // Simulate what happens in the browser
  const testToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OGU1NDc2MzY2YjhkMGE2ZDgwYjQ5MjkiLCJpYXQiOjE3NTk4NjA3NzMsImV4cCI6MTc2MDQ2NTU3M30.G2mIfZEh0lmlbb2bMM-990qwvenZMnsi2OLb-2atRJY';
  const testUser = {
    _id: '68e5476366b8d0a6d80b4929',
    email: 'newuser@example.com',
    phone: '0912345678',
    firstName: 'Khách',
    lastName: 'Hàng',
    isActive: true,
    isVerified: true,
    role: 'customer'
  };
  
  // Simulate localStorage
  const mockLocalStorage = {
    getItem: (key) => {
      if (key === 'auth_token') return testToken;
      if (key === 'user') return JSON.stringify(testUser);
      return null;
    },
    setItem: (key, value) => {
      console.log(`localStorage.setItem(${key}, ${value})`);
    }
  };
  
  // Test token extraction
  console.log('Testing token extraction...');
  const storedToken = mockLocalStorage.getItem('auth_token');
  const storedUser = mockLocalStorage.getItem('user');
  
  console.log('Stored token:', storedToken ? storedToken.substring(0, 50) + '...' : 'null');
  console.log('Stored user:', storedUser ? JSON.parse(storedUser) : 'null');
  
  // Test Authorization header
  const headers = {};
  if (storedToken) {
    headers['Authorization'] = `Bearer ${storedToken}`;
  }
  
  console.log('Headers:', headers);
  
  // Test API request simulation
  const API_BASE = 'http://localhost:5000';
  const url = `${API_BASE}/api/orders`;
  const method = 'POST';
  
  console.log('API Request simulation:', {
    method,
    url,
    hasToken: !!storedToken,
    headers
  });
};

testLocalStorage();
