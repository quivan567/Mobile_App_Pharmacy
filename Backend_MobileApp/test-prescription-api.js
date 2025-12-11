import fetch from 'node-fetch';

async function testPrescriptionAPI() {
  try {
    const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OGU1MjUyOGI4MDEwYmRlNDJhMmY1ODkiLCJpYXQiOjE3NTk5MTM4MzUsImV4cCI6MTc2MDUxODYzNX0.xH-o0173N35I-gjB7Naro6Uu8FsBR2NrgQN0zQiC0z0';
    
    console.log('Testing prescription API...');
    
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
    
    console.log('Response status:', response.status);
    const result = await response.text();
    console.log('Response body:', result);
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testPrescriptionAPI();
