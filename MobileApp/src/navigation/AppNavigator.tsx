import React, { useEffect, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { useAuth } from '../contexts/AuthContext';
import AuthNavigator from './AuthNavigator';
import MainNavigator from './MainNavigator';
import { View, ActivityIndicator, AppState, AppStateStatus, Linking } from 'react-native';
import { COLORS } from '../utils/constants';
import { useQueryClient } from '@tanstack/react-query';
import { logger } from '../utils/logger';

const Stack = createStackNavigator();

export default function AppNavigator() {
  const { isAuthenticated, isLoading } = useAuth();
  const queryClient = useQueryClient();
  const appState = useRef(AppState.currentState);
  const navigationRef = React.useRef<any>(null);

  // Handle deep links for payment return
  useEffect(() => {
    const handleDeepLink = (event: { url: string }) => {
      logger.log('AppNavigator: Deep link received', { url: event.url });
      
      // Handle payment success deep link
      // Format: myapp://payment-success?orderId=xxx
      if (event.url.includes('payment-success')) {
        try {
          // Parse URL manually since URL constructor may not work with custom schemes
          const urlParts = event.url.split('?');
          if (urlParts.length > 1) {
            const params = new URLSearchParams(urlParts[1]);
            const orderId = params.get('orderId');
            
            if (orderId && navigationRef.current) {
              // Invalidate order query to refresh payment status
              queryClient.invalidateQueries({ queryKey: ['order', orderId] });
              
              // Navigate to order detail
              setTimeout(() => {
                navigationRef.current?.navigate('Main', {
                  screen: 'Orders',
                  params: {
                    screen: 'OrderDetail',
                    params: { orderId },
                  },
                });
              }, 500);
            }
          }
        } catch (error) {
          logger.error('AppNavigator: Error parsing deep link', error);
        }
      }
    };

    // Handle initial URL (when app is opened via deep link)
    Linking.getInitialURL().then((url) => {
      if (url) {
        handleDeepLink({ url });
      }
    });

    // Listen for deep links while app is running
    const subscription = Linking.addEventListener('url', handleDeepLink);

    return () => {
      subscription.remove();
    };
  }, [queryClient]);

  // Handle app state changes to refresh payment status when returning from MoMo
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        // App has come to the foreground - refresh pending MoMo payments
        logger.log('AppNavigator: App came to foreground, refreshing pending payments');
        
        // Invalidate all order queries to refresh payment status
        queryClient.invalidateQueries({ queryKey: ['order'] });
      }

      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [queryClient]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer
      ref={navigationRef}
      linking={{
        prefixes: ['myapp://', 'pharmacyapp://'],
        config: {
          screens: {
            Main: {
              screens: {
                Orders: {
                  screens: {
                    OrderDetail: 'order/:orderId',
                  },
                },
              },
            },
          },
        } as any,
      }}
    >
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {isAuthenticated ? (
          <Stack.Screen name="Main" component={MainNavigator} />
        ) : (
          <Stack.Screen name="Auth" component={AuthNavigator} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

