# Pharmacy Mobile App

Ứng dụng mobile cho hệ thống quản lý nhà thuốc thông minh.

## Cài đặt

### 1. Cài đặt dependencies

```bash
npm install
```

### 2. Cấu hình môi trường

Tạo file `.env` từ `env.example`:

```bash
cp env.example .env
```

Cập nhật `EXPO_PUBLIC_API_BASE_URL` trong file `.env`:
- Development: `http://localhost:5000`
- Test trên điện thoại thật: `http://YOUR_IP:5000` (thay YOUR_IP bằng IP của máy tính)

### 3. Chạy ứng dụng

#### Development
```bash
npm start
```

#### iOS
```bash
npm run ios
```

#### Android
```bash
npm run android
```

#### Web (để test nhanh)
```bash
npm run web
```

## Cấu trúc dự án

```
MobileApp/
├── src/
│   ├── api/              # API clients và services
│   ├── components/       # Reusable components
│   │   ├── common/       # Common components (Button, Input, etc.)
│   │   ├── cart/         # Cart components
│   │   └── checkout/     # Checkout components
│   ├── contexts/        # React contexts (Auth, Cart)
│   ├── navigation/       # Navigation configuration
│   ├── screens/          # Screen components
│   │   ├── auth/         # Authentication screens
│   │   ├── home/         # Home screen
│   │   ├── medicines/    # Medicine screens
│   │   ├── cart/          # Cart screen
│   │   ├── checkout/      # Checkout screen
│   │   ├── orders/       # Order screens
│   │   └── profile/      # Profile screen
│   ├── types/            # TypeScript type definitions
│   └── utils/            # Utility functions và constants
├── App.tsx               # Root component
├── package.json
├── tsconfig.json
├── app.json
└── babel.config.js
```

## Tính năng

- ✅ Đăng nhập/Đăng ký
- ✅ Xem danh sách thuốc
- ✅ Chi tiết sản phẩm
- ✅ Giỏ hàng (thêm, sửa, xóa sản phẩm)
- ✅ Thanh toán (Cash, MoMo)
- ✅ Áp dụng mã giảm giá
- ✅ Theo dõi đơn hàng
- ✅ Quản lý địa chỉ
- ✅ Hồ sơ người dùng

## Backend Integration

App sử dụng cùng backend API với web app:
- Base URL: `http://localhost:5000` (development) / `https://<backend-prod>` (Render/Railway)
- Authentication: JWT Bearer token
- API endpoints: `/api/*`

### CORS Configuration

Đảm bảo backend đã cấu hình CORS để cho phép mobile app:

```typescript
// Backend_ReactSinglepage/src/index.ts
app.use(cors({
  origin: [
    config.corsOrigin,
    'http://localhost:19006',    // Expo default
    'exp://localhost:19000',     // Expo dev
    'exp://YOUR_IP:19000',       // Expo với IP
  ],
  credentials: true,
}));
```

## Lưu ý

1. **Backend phải đang chạy** trước khi start mobile app
2. **CORS** đã được cấu hình để cho phép mobile app
3. **Token** được lưu trong AsyncStorage
4. **Test trên điện thoại thật**: Đảm bảo điện thoại và máy tính cùng mạng WiFi

## Troubleshooting

### Lỗi: "Cannot connect to Metro"
```bash
npm run clear
# Hoặc
npx expo start --clear
```

### Lỗi: "Network request failed"
- Kiểm tra Backend đang chạy
- Kiểm tra API_BASE_URL trong .env
- Kiểm tra firewall/antivirus

### Lỗi: "Module not found"
```bash
rm -rf node_modules
npm install
```

## Scripts

- `npm start` - Khởi động Expo development server
- `npm run android` - Chạy trên Android emulator/device
- `npm run ios` - Chạy trên iOS simulator/device
- `npm run web` - Chạy trên web browser
- `npm run clear` - Clear cache và restart

## Triển khai mobile (EAS + Render/Atlas/Neon)

1. Backend/API: deploy lên Render/Railway/Heroku, bật HTTPS. Lấy URL dạng `https://your-backend.onrender.com`.
2. Database: Atlas (Mongo) hoặc Neon/Supabase (Postgres) free tier; đặt cùng khu vực với backend nếu có.
3. Thiết lập env cho app:
   - Local: tạo `.env` từ `env.example`, đặt `EXPO_PUBLIC_API_BASE_URL=https://your-backend...`.
   - CI/EAS: tạo secret `EXPO_PUBLIC_API_BASE_URL` (qua `eas secret:create` hoặc dashboard).
4. Build nội bộ để test:
   ```bash
   npm install -g eas-cli
   eas login
   eas build -p android --profile preview   # ra file .apk
   eas build -p ios --profile preview       # ra simulator build
   ```
5. Build production:
   ```bash
   eas build -p android --profile production   # ra .aab cho Play Store
   eas build -p ios --profile production       # ra .ipa/TestFlight
   ```
6. Phát hành (tùy chọn):
   ```bash
   eas submit -p android --profile production   # upload lên Play Console
   eas submit -p ios --profile production       # upload lên App Store Connect
   ```
7. Kiểm tra sau build: cài file .apk/.ipa, đăng nhập, thực hiện các luồng chính (đăng nhập, xem thuốc, giỏ hàng, thanh toán, đơn hàng). Nếu backend free-tier ngủ, chấp nhận cold start vài giây ở lần gọi đầu.

## Dependencies chính

- **expo**: ~54.0.22
- **react**: 19.1.0
- **react-native**: 0.81.5
- **@react-navigation/native**: ^6.1.18
- **@tanstack/react-query**: ^5.62.0
- **axios**: ^1.7.9
- **react-native-toast-message**: ^2.2.1

## License

MIT

