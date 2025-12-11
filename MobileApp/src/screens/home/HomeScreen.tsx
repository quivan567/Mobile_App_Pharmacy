import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, TextInput, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { medicinesApi } from '../../api/medicines';
import { notificationsApi } from '../../api/notifications';
import { COLORS, API_BASE_URL } from '../../utils/constants';
import { Loading } from '../../components/common/Loading';
import { Skeleton } from '../../components/common/Skeleton';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { getMedicineImageUrl } from '../../utils/imageHelper';
import { logger } from '../../utils/logger';
import { getSearchHistory, addToSearchHistory, removeFromSearchHistory, SearchHistoryItem } from '../../utils/searchHistory';
import { useAuth } from '../../contexts/AuthContext';
import { useSocket } from '../../contexts/SocketContext';
import { useQueryClient } from '@tanstack/react-query';
import { AIFloatingChat } from '../../components/chat/AIFloatingChat';

export default function HomeScreen() {
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();
  const { socket, isConnected } = useSocket();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>([]);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  // Get unread notification count
  const { data: unreadCountData, refetch: refetchUnreadCount } = useQuery({
    queryKey: ['unreadCount'],
    queryFn: async () => {
      try {
        const result = await notificationsApi.getUnreadCount();
        return result;
      } catch (err: any) {
        logger.error('Error fetching unread count:', err);
        return { success: false, data: { count: 0 } };
      }
    },
    enabled: isAuthenticated,
    retry: 2,
    retryDelay: 1000,
    refetchInterval: isConnected ? false : 60000, // Disable polling if socket is connected
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    staleTime: isConnected ? 5 * 60 * 1000 : 2 * 60 * 1000,
  });

  const unreadCount = unreadCountData?.data?.count || 0;

  // Listen to real-time socket events for notifications
  useEffect(() => {
    if (!socket || !isConnected || !isAuthenticated) return;

    const handleNewNotification = (data: any) => {
      logger.log('HomeScreen: New notification event', data);
      // Immediately refetch unread count when new notification arrives
      refetchUnreadCount();
      // Also invalidate to ensure other components update
      queryClient.invalidateQueries({ queryKey: ['unreadCount'] });
    };

    socket.on('notification:new', handleNewNotification);

    return () => {
      socket.off('notification:new', handleNewNotification);
    };
  }, [socket, isConnected, isAuthenticated, queryClient, refetchUnreadCount]);

  // Debounce search query - optimized for better UX
  useEffect(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    // If query is empty, clear immediately
    if (searchQuery.trim().length === 0) {
      setDebouncedQuery('');
      return;
    }

    // Optimized debounce delays:
    // - First character: 150ms (fast initial response)
    // - 2-3 characters: 300ms (balance between speed and API calls)
    // - 4+ characters: 500ms (reduce API calls for longer queries)
    const delay = searchQuery.length === 1 
      ? 150 
      : searchQuery.length <= 3 
      ? 300 
      : 500;

    debounceTimer.current = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, delay);

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [searchQuery]);

  // Load search history on mount
  useEffect(() => {
    const loadHistory = async () => {
      const history = await getSearchHistory();
      setSearchHistory(history);
    };
    loadHistory();
  }, []);

  // Show suggestions when there's a query (minimum 2 characters) or when showing history
  useEffect(() => {
    if (debouncedQuery.trim().length >= 2 || (searchQuery.trim().length === 0 && searchHistory.length > 0)) {
      setShowSuggestions(true);
    } else {
      setShowSuggestions(false);
    }
  }, [debouncedQuery, searchQuery, searchHistory]);

  const { data: hotMedicines, isLoading } = useQuery({
    queryKey: ['medicines', 'hot'],
    queryFn: () => medicinesApi.getHotMedicines(),
  });

  // Search suggestions query - requires minimum 2 characters for better performance
  const { data: suggestionsData, isLoading: isLoadingSuggestions, error: suggestionsError } = useQuery({
    queryKey: ['medicines', 'suggestions', debouncedQuery],
    queryFn: async () => {
      logger.log('Fetching suggestions for:', debouncedQuery);
      const result = await medicinesApi.getMedicines({ 
        search: debouncedQuery.trim(),
        limit: 10 // Increased to 10 suggestions for better results
      });
      logger.log('Suggestions result:', result);
      return result;
    },
    enabled: debouncedQuery.trim().length >= 2, // Minimum 2 characters for text search
    staleTime: 1 * 60 * 1000, // 1 minute
    retry: 1,
  });

  const handleSearch = async () => {
    const trimmedQuery = searchQuery.trim();
    if (trimmedQuery && trimmedQuery.length >= 2) {
      // Add to search history
      await addToSearchHistory(trimmedQuery);
      // Reload history
      const history = await getSearchHistory();
      setSearchHistory(history);
      
      (navigation as any).navigate('Medicines', {
        screen: 'MedicineList',
        params: { search: trimmedQuery },
      });
      setSearchQuery('');
      setShowSuggestions(false);
    }
  };

  const handleSuggestionPress = (medicineId: string) => {
    (navigation as any).navigate('Medicines', {
      screen: 'MedicineDetail',
      params: { medicineId },
    });
    setSearchQuery('');
    setShowSuggestions(false);
  };

  const handleSuggestionSearch = async (query: string) => {
    if (query && query.length >= 2) {
      // Add to search history
      await addToSearchHistory(query);
      // Reload history
      const history = await getSearchHistory();
      setSearchHistory(history);
      
      (navigation as any).navigate('Medicines', {
        screen: 'MedicineList',
        params: { search: query },
      });
      setSearchQuery('');
      setShowSuggestions(false);
    }
  };

  const handleHistoryItemPress = async (item: SearchHistoryItem) => {
    setSearchQuery(item.query);
    await handleSuggestionSearch(item.query);
  };

  const handleRemoveHistoryItem = async (query: string, e: any) => {
    e.stopPropagation();
    await removeFromSearchHistory(query);
    const history = await getSearchHistory();
    setSearchHistory(history);
  };

  const suggestions = suggestionsData?.data || [];
  
  // Debug logging - chỉ log khi cần thiết, không cần suggestionsCount trong dependency
  useEffect(() => {
    if (debouncedQuery) {
      logger.log('Search suggestions state:', {
        debouncedQuery,
        hasData: !!suggestionsData,
        suggestionsCount: suggestions.length,
        isLoading: isLoadingSuggestions,
        error: suggestionsError,
      });
    }
  }, [debouncedQuery, suggestionsData, isLoadingSuggestions, suggestionsError]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <Skeleton width={200} height={24} borderRadius={4} />
            <Skeleton width={40} height={40} borderRadius={20} />
          </View>
          <Skeleton width="100%" height={48} borderRadius={12} style={{ marginTop: 8 }} />
        </View>
        <ScrollView style={styles.scrollView}>
          <View style={styles.productsContainer}>
            {Array.from({ length: 6 }).map((_, index) => (
              <View key={index} style={styles.productCard}>
                <Skeleton width="100%" height={80} borderRadius={8} />
                <View style={styles.productInfo}>
                  <Skeleton width="80%" height={16} borderRadius={4} style={{ marginBottom: 6 }} />
                  <Skeleton width="60%" height={16} borderRadius={4} />
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.title}>Nhà thuốc thông minh</Text>
          {isAuthenticated && (
            <TouchableOpacity
              style={styles.notificationButton}
              onPress={() => {
                (navigation as any).navigate('Profile', {
                  screen: 'Notifications',
                  params: { fromScreen: 'Home' },
                });
              }}
            >
              <Ionicons 
                name={unreadCount > 0 ? "notifications" : "notifications-outline"} 
                size={24} 
                color="#fff" 
              />
              {unreadCount > 0 && (
                <View style={[
                  styles.notificationBadge,
                  unreadCount > 9 && styles.notificationBadgeWide,
                  unreadCount > 99 && styles.notificationBadgeExtraWide
                ]}>
                  <Text style={styles.notificationBadgeText}>
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          )}
        </View>
        
        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Ionicons name="search-outline" size={20} color={COLORS.textSecondary} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Tìm kiếm thuốc..."
            placeholderTextColor={COLORS.textSecondary}
            value={searchQuery}
            onChangeText={(text) => {
              setSearchQuery(text);
            }}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
            onFocus={() => {
              // Show suggestions/history when input is focused
              if (searchQuery.trim().length >= 2 || searchHistory.length > 0) {
                setShowSuggestions(true);
              }
            }}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => {
                setSearchQuery('');
                setShowSuggestions(false);
              }}
              style={styles.clearButton}
            >
              <Ionicons name="close-circle" size={20} color={COLORS.textSecondary} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={handleSearch}
            style={styles.searchButton}
          >
            <Ionicons name="search" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Search Suggestions */}
        {showSuggestions && (
          <View style={styles.suggestionsContainer}>
            {/* Show search history when no query or query < 2 characters */}
            {searchQuery.trim().length < 2 && searchHistory.length > 0 && (
              <>
                <View style={styles.historyHeader}>
                  <Text style={styles.historyTitle}>Lịch sử tìm kiếm</Text>
                </View>
                {searchHistory.map((item, index) => (
                  <TouchableOpacity
                    key={`${item.query}-${item.timestamp}`}
                    style={styles.historyItem}
                    onPress={() => handleHistoryItemPress(item)}
                  >
                    <Ionicons name="time-outline" size={20} color={COLORS.textSecondary} style={{ marginRight: 12 }} />
                    <Text style={styles.historyText} numberOfLines={1}>
                      {item.query}
                    </Text>
                    <TouchableOpacity
                      onPress={(e) => handleRemoveHistoryItem(item.query, e)}
                      style={styles.removeHistoryButton}
                    >
                      <Ionicons name="close-circle" size={18} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                  </TouchableOpacity>
                ))}
                {debouncedQuery.trim().length >= 2 && <View style={styles.divider} />}
              </>
            )}
            
            {isLoadingSuggestions ? (
              <View style={styles.suggestionItem}>
                <Text style={styles.suggestionText}>Đang tìm kiếm...</Text>
              </View>
            ) : suggestions.length > 0 ? (
              <>
                <FlatList
                  data={suggestions}
                  keyExtractor={(item) => item._id}
                  renderItem={({ item }) => {
                    const fullImageUrl = getMedicineImageUrl(item);

                    const price = typeof item.price === 'number' 
                      ? item.price 
                      : typeof item.price === 'string' 
                      ? parseFloat(item.price) || 0
                      : item.salePrice || 0;

                    return (
                      <TouchableOpacity
                        style={styles.suggestionItem}
                        onPress={() => handleSuggestionPress(item._id)}
                      >
                        {fullImageUrl && (
                          <Image
                            source={{ uri: fullImageUrl }}
                            style={styles.suggestionImage}
                            resizeMode="cover"
                          />
                        )}
                        <View style={styles.suggestionContent}>
                          <Text style={styles.suggestionName} numberOfLines={1}>
                            {item.name}
                          </Text>
                          <Text style={styles.suggestionPrice}>
                            {price.toLocaleString('vi-VN')} ₫
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={16} color={COLORS.textSecondary} />
                      </TouchableOpacity>
                    );
                  }}
                  scrollEnabled={false}
                />
                {suggestions.length >= 10 && (
                  <TouchableOpacity
                    style={styles.viewAllSuggestions}
                    onPress={() => handleSuggestionSearch(debouncedQuery.trim())}
                  >
                    <Text style={styles.viewAllSuggestionsText}>
                      Xem tất cả kết quả cho "{debouncedQuery.trim()}"
                    </Text>
                    <Ionicons name="arrow-forward" size={16} color={COLORS.primary} />
                  </TouchableOpacity>
                )}
              </>
            ) : debouncedQuery.trim().length === 1 ? (
              <View style={styles.suggestionItem}>
                <Ionicons name="information-circle-outline" size={20} color={COLORS.textSecondary} style={{ marginRight: 8 }} />
                <Text style={styles.suggestionText}>
                  Vui lòng nhập ít nhất 2 ký tự để tìm kiếm
                </Text>
              </View>
            ) : debouncedQuery.trim().length > 1 ? (
              <View style={styles.suggestionItem}>
                <Text style={styles.suggestionText}>
                  Không tìm thấy kết quả cho "{debouncedQuery.trim()}"
                </Text>
              </View>
            ) : null}
          </View>
        )}
      </View>

      <ScrollView style={styles.scrollView}>

      {hotMedicines?.data && hotMedicines.data.length > 0 ? (
        <View style={styles.productsContainer}>
          {hotMedicines.data.map((medicine: any) => {
            // Ensure price is a number
            const price = typeof medicine.price === 'number' 
              ? medicine.price 
              : typeof medicine.price === 'string' 
              ? parseFloat(medicine.price) || 0
              : medicine.salePrice || 0;

            // Get image URL
            const fullImageUrl = getMedicineImageUrl(medicine);

            return (
              <TouchableOpacity
                key={medicine._id}
                style={styles.productCard}
                onPress={() => {
                  (navigation as any).navigate('Medicines', {
                    screen: 'MedicineDetail',
                    params: { medicineId: medicine._id },
                  });
                }}
              >
                <Image
                  source={{ uri: fullImageUrl }}
                  style={styles.productImage}
                  resizeMode="cover"
                />
                <View style={styles.productInfo}>
                  <Text style={styles.productName} numberOfLines={2}>
                    {medicine.name}
                  </Text>
                  <Text style={styles.productPrice}>
                    {price.toLocaleString('vi-VN')} ₫
                  </Text>
                  {medicine.isHot && (
                    <View style={styles.hotBadge}>
                      <Ionicons name="flame" size={12} color="#fff" />
                      <Text style={styles.hotBadgeText}>Hot</Text>
                    </View>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            );
          })}
        </View>
      ) : (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Chưa có sản phẩm nổi bật</Text>
        </View>
      )}

      <TouchableOpacity
        style={styles.viewAllButton}
        onPress={() => {
          (navigation as any).navigate('Medicines');
        }}
      >
        <Text style={styles.viewAllText}>Xem tất cả sản phẩm</Text>
        <Ionicons name="arrow-forward" size={20} color={COLORS.primary} />
      </TouchableOpacity>
      </ScrollView>

      <AIFloatingChat />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollView: {
    flex: 1,
  },
  header: {
    padding: 20,
    backgroundColor: COLORS.primary,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    flex: 1,
  },
  notificationButton: {
    position: 'relative',
    padding: 8,
    marginLeft: 12,
  },
  notificationBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: '#FF3B30', // Màu đỏ tươi như các app thương mại
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 4,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 10,
  },
  notificationBadgeWide: {
    paddingHorizontal: 6,
    minWidth: 24,
  },
  notificationBadgeExtraWide: {
    paddingHorizontal: 6,
    minWidth: 28,
  },
  notificationBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 13,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#fff',
    opacity: 0.9,
    marginBottom: 16,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 12,
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: COLORS.text,
    paddingVertical: 12,
  },
  clearButton: {
    padding: 4,
    marginRight: 4,
  },
  searchButton: {
    backgroundColor: COLORS.primary,
    padding: 8,
    borderRadius: 8,
    marginLeft: 4,
  },
  suggestionsContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginTop: 8,
    maxHeight: 300,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    overflow: 'hidden',
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  suggestionImage: {
    width: 40,
    height: 40,
    borderRadius: 6,
    backgroundColor: COLORS.border,
    marginRight: 12,
  },
  suggestionContent: {
    flex: 1,
  },
  suggestionName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
  },
  suggestionPrice: {
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: '600',
  },
  suggestionText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    padding: 8,
  },
  viewAllSuggestions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    backgroundColor: COLORS.background,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  viewAllSuggestionsText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
    marginRight: 8,
  },
  historyHeader: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  historyTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  historyText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
  },
  removeHistoryButton: {
    padding: 4,
    marginLeft: 8,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 8,
  },
  productsContainer: {
    padding: 16,
  },
  productCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  productImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: COLORS.border,
    marginRight: 12,
  },
  productInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  productName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 6,
  },
  productPrice: {
    fontSize: 16,
    color: COLORS.primary,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  hotBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ef4444',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  hotBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
    marginLeft: 4,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: COLORS.textSecondary,
  },
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    padding: 16,
    margin: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  viewAllText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.primary,
    marginRight: 8,
  },
});

