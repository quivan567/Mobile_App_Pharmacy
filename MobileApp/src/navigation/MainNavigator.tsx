import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import HomeScreen from '../screens/home/HomeScreen';
import MedicineListScreen from '../screens/medicines/MedicineListScreen';
import MedicineDetailScreen from '../screens/medicines/MedicineDetailScreen';
import CartScreen from '../screens/cart/CartScreen';
import CheckoutScreen from '../screens/checkout/CheckoutScreen';
import OrderListScreen from '../screens/orders/OrderListScreen';
import OrderDetailScreen from '../screens/orders/OrderDetailScreen';
import ProfileScreen from '../screens/profile/ProfileScreen';
import PersonalInfoScreen from '../screens/profile/PersonalInfoScreen';
import NotificationListScreen from '../screens/notifications/NotificationListScreen';
import PromotionListScreen from '../screens/promotions/PromotionListScreen';
import LoyaltyScreen from '../screens/loyalty/LoyaltyScreen';
import PrescriptionListScreen from '../screens/prescriptions/PrescriptionListScreen';
import PrescriptionDetailScreen from '../screens/prescriptions/PrescriptionDetailScreen';
import ConsultationScreen from '../screens/consultation/ConsultationScreen';
import PPointsScreen from '../screens/pPoints/PPointsScreen';
import HealthSpendingScreen from '../screens/healthSpending/HealthSpendingScreen';
import AddressListScreen from '../screens/addresses/AddressListScreen';
import AddressFormScreen from '../screens/addresses/AddressFormScreen';
import { COLORS } from '../utils/constants';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

function MedicineStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: true,
        headerStyle: {
          backgroundColor: COLORS.primary,
        },
        headerTintColor: '#fff',
        headerTitleStyle: {
          fontWeight: 'bold',
        },
        headerBackTitleVisible: false,
      }}
    >
      <Stack.Screen 
        name="MedicineList" 
        component={MedicineListScreen}
        options={{ 
          title: 'Sản phẩm',
          headerShown: false, // Hide header for list screen since it's in tab
        }}
      />
      <Stack.Screen 
        name="MedicineDetail" 
        component={MedicineDetailScreen}
        options={{ 
          title: 'Chi tiết sản phẩm',
          headerShown: true,
          headerBackTitle: '',
          headerBackTitleVisible: false,
        }}
      />
    </Stack.Navigator>
  );
}

function OrderStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: true,
        headerStyle: {
          backgroundColor: COLORS.primary,
        },
        headerTintColor: '#fff',
        headerTitleStyle: {
          fontWeight: 'bold',
        },
        headerBackTitleVisible: false,
      }}
    >
      <Stack.Screen 
        name="OrderList" 
        component={OrderListScreen}
        options={{ 
          title: 'Đơn hàng',
          headerShown: false, // Hide header for list screen since it's in tab
        }}
      />
      <Stack.Screen 
        name="OrderDetail" 
        component={OrderDetailScreen}
        options={{ 
          title: 'Chi tiết đơn hàng',
          headerShown: true,
          headerBackTitle: '',
          headerBackTitleVisible: false,
        }}
      />
    </Stack.Navigator>
  );
}

function CartStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: true,
        headerStyle: {
          backgroundColor: COLORS.primary,
        },
        headerTintColor: '#fff',
        headerTitleStyle: {
          fontWeight: 'bold',
        },
        headerBackTitleVisible: false,
      }}
    >
      <Stack.Screen 
        name="Cart" 
        component={CartScreen}
        options={{ 
          title: 'Giỏ hàng',
          headerShown: false, // Hide header for cart screen since it's in tab
        }}
      />
      <Stack.Screen 
        name="Checkout" 
        component={CheckoutScreen}
        options={{ 
          title: 'Thanh toán',
          headerShown: true,
          headerBackTitle: '',
          headerBackTitleVisible: false,
        }}
      />
    </Stack.Navigator>
  );
}

function PrescriptionStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: true,
        headerStyle: {
          backgroundColor: COLORS.primary,
        },
        headerTintColor: '#fff',
        headerTitleStyle: {
          fontWeight: 'bold',
        },
        headerBackTitleVisible: false,
      }}
    >
      <Stack.Screen 
        name="PrescriptionList" 
        component={PrescriptionListScreen}
        options={{ 
          title: 'Đơn thuốc',
          headerShown: true,
          headerBackTitle: '',
          headerBackTitleVisible: false,
        }}
      />
      <Stack.Screen 
        name="PrescriptionDetail" 
        component={PrescriptionDetailScreen}
        options={{ 
          title: 'Chi tiết đơn thuốc',
          headerShown: true,
          headerBackTitle: '',
          headerBackTitleVisible: false,
        }}
      />
    </Stack.Navigator>
  );
}

function ProfileStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: true,
        headerStyle: {
          backgroundColor: COLORS.primary,
        },
        headerTintColor: '#fff',
        headerTitleStyle: {
          fontWeight: 'bold',
        },
        headerBackTitleVisible: false,
      }}
    >
      <Stack.Screen 
        name="ProfileMain" 
        component={ProfileScreen}
        options={{ 
          title: 'Tài khoản',
          headerShown: false, // Hide header for profile screen since it's in tab
        }}
      />
      <Stack.Screen 
        name="Notifications" 
        component={NotificationListScreen}
        options={{ 
          title: 'Thông báo',
          headerShown: true,
          headerBackTitle: '',
          headerBackTitleVisible: false,
        }}
      />
      <Stack.Screen 
        name="Promotions" 
        component={PromotionListScreen}
        options={{ 
          title: 'Khuyến mãi',
          headerShown: true,
          headerBackTitle: '',
          headerBackTitleVisible: false,
        }}
      />
      <Stack.Screen 
        name="Loyalty" 
        component={LoyaltyScreen}
        options={{ 
          title: 'Điểm tích lũy',
          headerShown: true,
          headerBackTitle: '',
          headerBackTitleVisible: false,
        }}
      />
      <Stack.Screen 
        name="Prescriptions" 
        component={PrescriptionStack}
        options={{ 
          headerShown: false,
        }}
      />
      <Stack.Screen 
        name="Consultation" 
        component={ConsultationScreen}
        options={{ 
          title: 'Tư vấn đơn thuốc',
          headerShown: true,
          headerBackTitle: '',
          headerBackTitleVisible: false,
        }}
      />
      <Stack.Screen 
        name="PPoints" 
        component={PPointsScreen}
        options={{ 
          title: 'P-Xu',
          headerShown: true,
          headerBackTitle: '',
          headerBackTitleVisible: false,
        }}
      />
      <Stack.Screen 
        name="HealthSpending" 
        component={HealthSpendingScreen}
        options={{ 
          title: 'Chi tiêu sức khỏe',
          headerShown: true,
          headerBackTitle: '',
          headerBackTitleVisible: false,
        }}
      />
      <Stack.Screen 
        name="PersonalInfo" 
        component={PersonalInfoScreen}
        options={{ 
          title: 'Thông tin cá nhân',
          headerShown: false, // PersonalInfoScreen has its own header
        }}
      />
      <Stack.Screen 
        name="AddressList" 
        component={AddressListScreen}
        options={{ 
          title: 'Địa chỉ',
          headerShown: false, // AddressListScreen has its own header
        }}
      />
      <Stack.Screen 
        name="AddressForm" 
        component={AddressFormScreen}
        options={{ 
          title: 'Thêm/Sửa địa chỉ',
          headerShown: false, // AddressFormScreen has its own header
        }}
      />
    </Stack.Navigator>
  );
}

export default function MainNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap;

          if (route.name === 'Home') {
            iconName = focused ? 'home' : 'home-outline';
          } else if (route.name === 'Medicines') {
            iconName = focused ? 'medical' : 'medical-outline';
          } else if (route.name === 'Cart') {
            iconName = focused ? 'cart' : 'cart-outline';
          } else if (route.name === 'Orders') {
            iconName = focused ? 'receipt' : 'receipt-outline';
          } else if (route.name === 'Profile') {
            iconName = focused ? 'person' : 'person-outline';
          } else {
            iconName = 'help-outline';
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textSecondary,
        headerShown: false,
      })}
    >
      <Tab.Screen 
        name="Home" 
        component={HomeScreen}
        options={{ tabBarLabel: 'Trang chủ' }}
      />
      <Tab.Screen 
        name="Medicines" 
        component={MedicineStack}
        options={{ tabBarLabel: 'Sản phẩm' }}
      />
      <Tab.Screen 
        name="Cart" 
        component={CartStack}
        options={{ tabBarLabel: 'Giỏ hàng' }}
      />
      <Tab.Screen 
        name="Orders" 
        component={OrderStack}
        options={{ tabBarLabel: 'Đơn hàng' }}
      />
      <Tab.Screen 
        name="Profile" 
        component={ProfileStack}
        options={{ tabBarLabel: 'Tài khoản' }}
      />
    </Tab.Navigator>
  );
}

