import axios from 'axios';

export class OTPService {
  /**
   * Gửi OTP qua SMS sử dụng ESMS.vn API
   * Cần cấu hình trong .env:
   * ESMS_API_KEY=your_api_key
   * ESMS_SECRET_KEY=your_secret_key
   * ESMS_BRAND_NAME=your_brand_name (optional)
   */
  static async sendSMS(phone: string, otp: string): Promise<boolean> {
    try {
      const apiKey = process.env.ESMS_API_KEY;
      const secretKey = process.env.ESMS_SECRET_KEY;
      const brandName = process.env.ESMS_BRAND_NAME || '';

      // Nếu không có API key, fallback về log console (cho development)
      if (!apiKey || !secretKey) {
        console.log(`\n🔐 ===== OTP FOR TESTING =====`);
        console.log(`📱 Phone: ${phone}`);
        console.log(`🔢 OTP Code: ${otp}`);
        console.log(`📡 Method: SMS`);
        console.log(`⏰ Time: ${new Date().toLocaleString()}`);
        console.log(`⏳ Expires in: 5 minutes`);
        console.log(`⚠️  Note: ESMS_API_KEY not configured, using console log`);
        console.log(`🔐 ============================\n`);
        return true;
      }

      // Format phone number (remove +84, add 84 if needed)
      let formattedPhone = phone.replace(/^\+84/, '84').replace(/^0/, '84');
      if (!formattedPhone.startsWith('84')) {
        formattedPhone = '84' + formattedPhone;
      }

      // ESMS.vn API endpoint
      const esmsUrl = 'https://rest.esms.vn/MainService.svc/json/SendMultipleMessage_V4_post_json';
      
      const message = `Ma OTP dang ky tai khoan cua ban la: ${otp}. Ma co hieu luc trong 5 phut. Khong chia se ma nay voi bat ky ai.`;

      const payload = {
        ApiKey: apiKey,
        SecretKey: secretKey,
        Phone: formattedPhone,
        Content: message,
        SmsType: '2', // Brand name
        Brandname: brandName || 'ESMS',
      };

      const response = await axios.post(esmsUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.data && response.data.CodeResult === '100') {
        console.log(`✅ [SMS] OTP ${otp} sent successfully to ${phone}`);
        return true;
      } else {
        console.error(`❌ [SMS] Failed to send OTP:`, response.data);
        // Fallback to console log for development
        console.log(`📱 [SMS FALLBACK] OTP ${otp} for ${phone}`);
        return true; // Return true to not block development
      }
    } catch (error) {
      console.error('Error sending SMS OTP:', error);
      // Fallback to console log for development
      console.log(`📱 [SMS ERROR FALLBACK] OTP ${otp} for ${phone}`);
      return true; // Return true to not block development
    }
  }

  /**
   * Gửi OTP qua Zalo OA (Zalo Official Account)
   * Cần cấu hình trong .env:
   * ZALO_OA_ID=your_oa_id
   * ZALO_ACCESS_TOKEN=your_access_token
   */
  static async sendZalo(phone: string, otp: string): Promise<boolean> {
    try {
      const oaId = process.env.ZALO_OA_ID;
      const accessToken = process.env.ZALO_ACCESS_TOKEN;

      // Nếu không có config, fallback về log console
      if (!oaId || !accessToken) {
        console.log(`\n🔐 ===== OTP FOR TESTING =====`);
        console.log(`📱 Phone: ${phone}`);
        console.log(`🔢 OTP Code: ${otp}`);
        console.log(`📡 Method: ZALO`);
        console.log(`⏰ Time: ${new Date().toLocaleString()}`);
        console.log(`⏳ Expires in: 5 minutes`);
        console.log(`⚠️  Note: ZALO_OA_ID not configured, using console log`);
        console.log(`🔐 ============================\n`);
        return true;
      }

      // Format phone number
      let formattedPhone = phone.replace(/^\+84/, '84').replace(/^0/, '84');
      if (!formattedPhone.startsWith('84')) {
        formattedPhone = '84' + formattedPhone;
      }

      // Zalo API endpoint
      const zaloUrl = `https://openapi.zalo.me/v2.0/oa/message`;
      
      const message = `Ma OTP dang ky tai khoan cua ban la: ${otp}. Ma co hieu luc trong 5 phut. Khong chia se ma nay voi bat ky ai.`;

      const payload = {
        recipient: {
          user_id: formattedPhone, // Zalo user ID (cần mapping phone -> Zalo user ID)
        },
        message: {
          text: message,
        },
      };

      const response = await axios.post(zaloUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
          'access_token': accessToken,
        },
      });

      if (response.data && response.data.error === 0) {
        console.log(`✅ [ZALO] OTP ${otp} sent successfully to ${phone}`);
        return true;
      } else {
        console.error(`❌ [ZALO] Failed to send OTP:`, response.data);
        // Fallback to console log
        console.log(`📱 [ZALO FALLBACK] OTP ${otp} for ${phone}`);
        return true;
      }
    } catch (error) {
      console.error('Error sending Zalo OTP:', error);
      // Fallback to console log
      console.log(`📱 [ZALO ERROR FALLBACK] OTP ${otp} for ${phone}`);
      return true;
    }
  }

  /**
   * Gửi OTP qua SMS hoặc Zalo
   */
  static async sendOTP(phone: string, otp: string, method: 'sms' | 'zalo' = 'sms'): Promise<boolean> {
    try {
      if (method === 'sms') {
        return await this.sendSMS(phone, otp);
      } else if (method === 'zalo') {
        return await this.sendZalo(phone, otp);
      }
      
      return false;
    } catch (error) {
      console.error('Error sending OTP:', error);
      return false;
    }
  }
}
