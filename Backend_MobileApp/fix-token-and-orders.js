// Script to login and get new valid token, then link guest orders to user
const API_BASE = 'http://localhost:5000';

async function fixTokenAndOrders() {
  console.log('🔧 Fixing token and linking orders...\n');
  
  try {
    // Step 1: Login to get new token
    console.log('📝 Step 1: Logging in to get new token...');
    const loginResponse = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: '0942808839', // Thay bằng số điện thoại của bạn
        password: '27082003Tai@' // Thay bằng mật khẩu của bạn
      })
    });
    
    const loginData = await loginResponse.json();
    
    if (!loginData.success) {
      console.log('❌ Login failed:', loginData.message);
      return;
    }
    
    const newToken = loginData.data.token;
    const userId = loginData.data.user._id;
    
    console.log('✅ Login successful!');
    console.log('📋 User ID:', userId);
    console.log('🎫 New Token:', newToken.substring(0, 50) + '...');
    console.log('\n📝 Copy và paste token này vào browser console:');
    console.log('\n   localStorage.setItem("auth_token", "' + newToken + '");');
    console.log('   localStorage.setItem("user", \'' + JSON.stringify(loginData.data.user) + '\');');
    console.log('   location.reload();\n');
    
    // Step 2: Check for guest orders and link them
    console.log('📋 Step 2: Checking for guest orders...');
    
    // Get all orders (would need admin access, so just show instructions)
    console.log('\n💡 Để link các guest orders với user:');
    console.log('   1. Đăng nhập với token mới ở trên');
    console.log('   2. Vào trang "Theo dõi đơn hàng"');
    console.log('   3. Các đơn hàng có orderNumber sẽ có nút "Liên kết với tài khoản"');
    console.log('   4. Hoặc gọi API: POST /api/orders/{orderId}/link\n');
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

fixTokenAndOrders();

