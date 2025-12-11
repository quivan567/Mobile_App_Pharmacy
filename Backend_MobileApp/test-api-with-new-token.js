// Test prescription API with new token
async function testPrescriptionAPI() {
  try {
    const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OGU1MjUyOGI4MDEwYmRlNDJhMmY1ODkiLCJpYXQiOjE3NjExNTY4ODUsImV4cCI6MTc2MTc2MTY4NX0.7A3W82FGRKtXb4LOKd10ObznY6foXmj8yVRjU5Hqevg';
    
    console.log('🧪 Testing prescription API with new token...');
    
    const response = await fetch('http://localhost:5000/api/prescriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        customerName: 'Test User',
        phoneNumber: '0942 808 839',
        note: 'Test prescription',
        imageUrl: 'https://example.com/test.jpg',
        doctorName: 'Dr. Test',
        hospitalName: 'Test Hospital'
      })
    });
    
    console.log('📊 Response status:', response.status);
    const result = await response.text();
    console.log('📄 Response body:', result);
    
    if (response.ok) {
      console.log('✅ API test successful!');
    } else {
      console.log('❌ API test failed!');
    }
    
  } catch (error) {
    console.error('💥 Error:', error);
  }
}

testPrescriptionAPI();
