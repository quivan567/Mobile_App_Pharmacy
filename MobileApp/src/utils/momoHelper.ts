import { Linking, Platform, Alert } from 'react-native';

/**
 * MoMo UAT App URL schemes
 * MoMo UAT app typically uses these schemes:
 * - mservice:// (for Android)
 * - momo:// (alternative)
 */
const MOMO_UAT_SCHEMES = {
  android: ['mservice://', 'momo://'],
  ios: ['momo://', 'mservice://'],
};

/**
 * Check if MoMo UAT app is installed
 */
export async function isMomoUatInstalled(): Promise<boolean> {
  if (Platform.OS === 'android') {
    // Try to check if MoMo UAT app is installed
    for (const scheme of MOMO_UAT_SCHEMES.android) {
      try {
        const canOpen = await Linking.canOpenURL(scheme);
        if (canOpen) {
          return true;
        }
      } catch (error) {
        // Continue to next scheme
      }
    }
  } else if (Platform.OS === 'ios') {
    // iOS - try schemes
    for (const scheme of MOMO_UAT_SCHEMES.ios) {
      try {
        const canOpen = await Linking.canOpenURL(scheme);
        if (canOpen) {
          return true;
        }
      } catch (error) {
        // Continue to next scheme
      }
    }
  }
  return false;
}

/**
 * Open MoMo payment URL
 * Tries to open MoMo UAT app first, then falls back to web URL
 */
export async function openMomoPayment(
  payUrl: string,
  deeplink?: string
): Promise<boolean> {
  try {
    console.log('=== openMomoPayment: Starting ===', {
      payUrl,
      deeplink,
      platform: Platform.OS,
    });

    // Priority 1: Use deeplink if available (from MoMo API response)
    // This is the best way as MoMo provides the exact deeplink
    if (deeplink) {
      try {
        console.log('=== openMomoPayment: Trying deeplink ===', { deeplink });
        // Try to open deeplink directly (don't check canOpenURL first as it may not work correctly)
        await Linking.openURL(deeplink);
        console.log('Opened MoMo UAT app using deeplink:', deeplink);
        return true;
      } catch (error) {
        console.log('Cannot open deeplink, trying other methods:', error);
      }
    }

    // Priority 2: Try to open MoMo UAT app directly using URL schemes
    // MoMo UAT app typically uses these schemes:
    // - mservice:// (Android - official)
    // - momo:// (iOS/Android alternative)
    
    if (Platform.OS === 'android') {
      // For Android, try Intent URL first (most reliable for MoMo UAT)
      // Format: intent://<path>#Intent;scheme=<scheme>;package=<package>;end
      // MoMo UAT app package: com.mservice.momotransfer (or similar)
      try {
        // Try Intent URL with mservice scheme
        const intentUrl = `intent://payment#Intent;scheme=mservice;package=com.mservice.momotransfer;S.url=${encodeURIComponent(payUrl)};end`;
        const canOpen = await Linking.canOpenURL(intentUrl);
        if (canOpen) {
          await Linking.openURL(intentUrl);
          console.log('Opened MoMo UAT app using Intent URL');
          return true;
        }
      } catch (error) {
        console.log('Cannot open with Intent URL, trying schemes');
      }

      // Try multiple schemes
      const schemes = ['mservice://', 'momo://'];
      
      for (const scheme of schemes) {
        try {
          // Try different URL formats that MoMo UAT app might accept
          const urlFormats = [
            `${scheme}payment?url=${encodeURIComponent(payUrl)}`,
            `${scheme}open?url=${encodeURIComponent(payUrl)}`,
            `${scheme}pay?url=${encodeURIComponent(payUrl)}`,
            // Try with just the scheme to see if app is installed
            scheme,
          ];

          for (const urlFormat of urlFormats) {
            try {
              const canOpen = await Linking.canOpenURL(urlFormat);
              if (canOpen) {
                await Linking.openURL(urlFormat);
                console.log('Opened MoMo UAT app using scheme:', urlFormat);
                return true;
              }
            } catch (error) {
              // Continue to next format
            }
          }
        } catch (error) {
          // Continue to next scheme
        }
      }
    } else if (Platform.OS === 'ios') {
      // For iOS, try momo:// scheme
      const schemes = ['momo://', 'mservice://'];
      
      for (const scheme of schemes) {
        try {
          const urlFormats = [
            `${scheme}payment?url=${encodeURIComponent(payUrl)}`,
            `${scheme}open?url=${encodeURIComponent(payUrl)}`,
            scheme,
          ];

          for (const urlFormat of urlFormats) {
            try {
              const canOpen = await Linking.canOpenURL(urlFormat);
              if (canOpen) {
                await Linking.openURL(urlFormat);
                console.log('Opened MoMo UAT app using scheme:', urlFormat);
                return true;
              }
            } catch (error) {
              // Continue to next format
            }
          }
        } catch (error) {
          // Continue to next scheme
        }
      }
    }

    // Priority 3: Fallback to web URL (only if not localhost)
    // Don't open localhost URLs on mobile device as they won't work
    if (payUrl && !payUrl.includes('localhost') && !payUrl.includes('127.0.0.1')) {
      try {
        console.log('=== openMomoPayment: Trying web URL ===', { payUrl });
        const canOpen = await Linking.canOpenURL(payUrl);
        if (canOpen) {
          await Linking.openURL(payUrl);
          console.log('Opened MoMo payment in browser:', payUrl);
          return true;
        }
      } catch (error) {
        console.error('Cannot open payUrl:', error);
      }
    } else if (payUrl && (payUrl.includes('localhost') || payUrl.includes('127.0.0.1'))) {
      console.warn('=== openMomoPayment: payUrl is localhost, cannot open on mobile device ===', { payUrl });
      // Don't try to open localhost URLs on mobile
    }

    console.error('=== openMomoPayment: Failed to open MoMo payment ===', {
      payUrl,
      deeplink,
      reason: 'Could not open app or valid web URL',
    });
    return false;
  } catch (error) {
    console.error('Error opening MoMo payment:', error);
    return false;
  }
}

/**
 * Show alert if MoMo UAT app is not installed
 */
export function showMomoUatNotInstalledAlert(): void {
  Alert.alert(
    'MoMo UAT chưa được cài đặt',
    'Vui lòng cài đặt ứng dụng MoMo UAT để thanh toán. Bạn có muốn mở trang thanh toán trên trình duyệt không?',
    [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Mở trình duyệt',
        onPress: () => {
          // This will be handled by the calling function
        },
      },
    ]
  );
}

