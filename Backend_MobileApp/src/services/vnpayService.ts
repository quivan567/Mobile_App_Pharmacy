import crypto from 'crypto';
import querystring from 'querystring';

// VNPay configuration (sandbox defaults, override via env)
const VNPAY_CONFIG = {
  tmnCode: (process.env.VNPAY_TMN_CODE || '').trim(),
  hashSecret: (process.env.VNPAY_HASH_SECRET || '').trim(),
  url: process.env.VNPAY_PAYMENT_URL || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
  returnUrl: process.env.VNPAY_RETURN_URL || 'pharmacyapp://payment-success',
  ipnUrl: process.env.VNPAY_IPN_URL || 'http://localhost:5000/api/payment/vnpay/callback',
  version: process.env.VNPAY_API_VERSION || '2.1.0',
};

export interface VnpayPaymentRequest {
  orderId: string; // orderNumber (string)
  orderInfo: string;
  amount: number; // in VND
  extraData?: string; // backend orderId to update later
  ipAddr?: string;
  returnUrl?: string;
  ipnUrl?: string;
}

export interface VnpayPaymentResponse {
  payUrl: string;
  orderId: string;
}

export interface VnpayCallbackData {
  vnp_TmnCode: string;
  vnp_Amount: string;
  vnp_BankCode?: string;
  vnp_BankTranNo?: string;
  vnp_CardType?: string;
  vnp_PayDate: string;
  vnp_OrderInfo: string;
  vnp_TransactionNo: string;
  vnp_ResponseCode: string;
  vnp_TransactionStatus: string;
  vnp_TxnRef: string;
  vnp_SecureHash: string;
  vnp_SecureHashType?: string;
  vnp_ExtraData?: string;
}

export class VnpayService {
  private static sortObject(obj: Record<string, any>): Record<string, any> {
    const sorted: Record<string, any> = {};
    const keys = Object.keys(obj).map(k => encodeURIComponent(k)).sort();

    keys.forEach(encodedKey => {
      const originalKey = decodeURIComponent(encodedKey);
      const value = obj[originalKey];
      if (value !== undefined && value !== null && value !== '') {
        sorted[encodedKey] = encodeURIComponent(String(value)).replace(/%20/g, '+');
      }
    });

    return sorted;
  }

  private static buildQuery(sorted: Record<string, any>): string {
    return Object.entries(sorted)
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
  }

  private static createSecureHash(sortedData: Record<string, any>): string {
    const dataToHash: Record<string, any> = {};
    for (const key in sortedData) {
      if (key !== 'vnp_SecureHash' && key !== 'vnp_SecureHashType') {
        dataToHash[key] = sortedData[key];
      }
    }
    const signData = this.buildQuery(dataToHash);
    const hmac = crypto.createHmac('sha512', VNPAY_CONFIG.hashSecret);
    return hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');
  }

  static createPaymentUrl(params: VnpayPaymentRequest): VnpayPaymentResponse {
    const amountInCents = params.amount * 100; // VNPay expects VND * 100

    const vnp_Params: Record<string, any> = {
      vnp_Version: VNPAY_CONFIG.version,
      vnp_Command: 'pay',
      vnp_TmnCode: VNPAY_CONFIG.tmnCode,
      vnp_Amount: amountInCents,
      vnp_CurrCode: 'VND',
      vnp_TxnRef: params.orderId,
      vnp_OrderInfo: params.orderInfo,
      vnp_OrderType: 'other',
      vnp_Locale: 'vn',
      vnp_ReturnUrl: params.returnUrl || VNPAY_CONFIG.returnUrl,
      vnp_IpAddr: params.ipAddr || '0.0.0.0',
      vnp_CreateDate: new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14),
      vnp_ExpireDate: undefined, // optional
      vnp_ExtraData: params.extraData || '',
    };

    // Add IPN if provided
    const ipnUrl = params.ipnUrl || VNPAY_CONFIG.ipnUrl;
    if (ipnUrl) {
      vnp_Params['vnp_IpnUrl'] = ipnUrl;
    }

    const sorted = this.sortObject(vnp_Params);
    const secureHash = this.createSecureHash(sorted);
    sorted['vnp_SecureHash'] = secureHash;
    sorted['vnp_SecureHashType'] = 'SHA512';

    const query = this.buildQuery(sorted);
    const payUrl = `${VNPAY_CONFIG.url}?${query}`;

    return {
      payUrl,
      orderId: params.orderId,
    };
  }

  static verifyCallback(data: VnpayCallbackData): boolean {
    const dataCopy: any = { ...data };
    const receivedHash = dataCopy.vnp_SecureHash;
    delete dataCopy.vnp_SecureHash;
    delete dataCopy.vnp_SecureHashType;
    const sorted = this.sortObject(dataCopy);
    const computed = this.createSecureHash(sorted);
    return computed === receivedHash;
  }
}


