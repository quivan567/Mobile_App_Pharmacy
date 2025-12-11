import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { COLORS } from './constants';

/**
 * Highlight search terms in text
 * Returns a Text component with nested Text components for highlighting
 */
export const highlightText = (
  text: string,
  searchTerm: string,
  highlightStyle?: any,
  normalStyle?: any
): React.ReactElement => {
  if (!searchTerm || searchTerm.trim().length === 0) {
    return <Text style={normalStyle}>{text}</Text>;
  }

  const normalizedText = text;
  const normalizedSearch = searchTerm.trim();
  const escapedSearch = normalizedSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escapedSearch})`, 'gi');
  const parts = normalizedText.split(regex);

  return (
    <Text style={normalStyle} numberOfLines={2}>
      {parts.map((part, index) => {
        // Check if this part matches the search term (case-insensitive)
        if (part.toLowerCase() === normalizedSearch.toLowerCase()) {
          return (
            <Text key={index} style={highlightStyle || styles.highlight}>
              {part}
            </Text>
          );
        }
        return <Text key={index} style={normalStyle}>{part}</Text>;
      })}
    </Text>
  );
};

const styles = StyleSheet.create({
  highlight: {
    backgroundColor: COLORS.warning + '40',
    fontWeight: '600',
    color: COLORS.primary,
  },
});

