import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from './logger';

const SEARCH_HISTORY_KEY = '@search_history';
const MAX_HISTORY_ITEMS = 10;

export interface SearchHistoryItem {
  query: string;
  timestamp: number;
}

/**
 * Get search history from storage
 */
export const getSearchHistory = async (): Promise<SearchHistoryItem[]> => {
  try {
    const historyJson = await AsyncStorage.getItem(SEARCH_HISTORY_KEY);
    if (historyJson) {
      const history = JSON.parse(historyJson) as SearchHistoryItem[];
      // Sort by timestamp (newest first) and return
      return history.sort((a, b) => b.timestamp - a.timestamp);
    }
    return [];
  } catch (error) {
    logger.error('Error getting search history:', error);
    return [];
  }
};

/**
 * Add a search query to history
 */
export const addToSearchHistory = async (query: string): Promise<void> => {
  try {
    if (!query || query.trim().length < 2) {
      return; // Don't save queries with less than 2 characters
    }

    const trimmedQuery = query.trim().toLowerCase();
    const history = await getSearchHistory();

    // Remove duplicate entries (case-insensitive)
    const filteredHistory = history.filter(
      (item) => item.query.toLowerCase() !== trimmedQuery
    );

    // Add new query at the beginning
    const newHistory: SearchHistoryItem[] = [
      { query: trimmedQuery, timestamp: Date.now() },
      ...filteredHistory,
    ];

    // Keep only the most recent MAX_HISTORY_ITEMS
    const limitedHistory = newHistory.slice(0, MAX_HISTORY_ITEMS);

    await AsyncStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(limitedHistory));
    logger.log('Search history updated:', limitedHistory);
  } catch (error) {
    logger.error('Error adding to search history:', error);
  }
};

/**
 * Clear all search history
 */
export const clearSearchHistory = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(SEARCH_HISTORY_KEY);
    logger.log('Search history cleared');
  } catch (error) {
    logger.error('Error clearing search history:', error);
  }
};

/**
 * Remove a specific item from search history
 */
export const removeFromSearchHistory = async (query: string): Promise<void> => {
  try {
    const history = await getSearchHistory();
    const filteredHistory = history.filter(
      (item) => item.query.toLowerCase() !== query.toLowerCase()
    );
    await AsyncStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(filteredHistory));
    logger.log('Item removed from search history:', query);
  } catch (error) {
    logger.error('Error removing from search history:', error);
  }
};

