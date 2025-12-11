// Test prescription API with new token
async function testPrescriptionAPI() {
  try {
    const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OGU1MjUyOGI4MDEwYmRlNDJhMmY1ODkiLCJpYXQiOjE3NjEyMTQxMTEsImV4cCI6MTc2MTgxODkxMX0.xfGnNj_V5dyyw0lBUPqzwyVcfpDfZB2e1_zCtjHaml4';
    
    console.log('🧪 Testing prescription API with new token...');
    
    // Test GET prescriptions
    console.log('📋 Testing GET /api/prescriptions...');
    const getResponse = await fetch('http://localhost:5000/api/prescriptions?page=1&limit=100', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('📊 GET Response status:', getResponse.status);
    const getResult = await getResponse.text();
    console.log('📄 GET Response body:', getResult);
    
    // Test POST prescription
    console.log('📝 Testing POST /api/prescriptions...');
    const postResponse = await fetch('http://localhost:5000/api/prescriptions', {
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
    
    console.log('📊 POST Response status:', postResponse.status);
    const postResult = await postResponse.text();
    console.log('📄 POST Response body:', postResult);
    
    if (getResponse.ok && postResponse.ok) {
      console.log('✅ All API tests successful!');
    } else {
      console.log('❌ Some API tests failed!');
    }
    
  } catch (error) {
    console.error('💥 Error:', error);
  }
}

testPrescriptionAPI();
