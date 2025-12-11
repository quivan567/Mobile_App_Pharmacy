// Haptic feedback utility with fallback for devices without haptics support
let Haptics: any = null;

try {
  Haptics = require('expo-haptics');
} catch (error) {
  // expo-haptics not installed, will use fallback
}

export const hapticFeedback = {
  /**
   * Light impact feedback - for subtle actions like button taps
   */
  light: () => {
    try {
      if (Haptics) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch (error) {
      // Haptics not available on this device
    }
  },

  /**
   * Medium impact feedback - for standard actions
   */
  medium: () => {
    try {
      if (Haptics) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
    } catch (error) {
      // Haptics not available on this device
    }
  },

  /**
   * Heavy impact feedback - for important actions
   */
  heavy: () => {
    try {
      if (Haptics) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      }
    } catch (error) {
      // Haptics not available on this device
    }
  },

  /**
   * Success notification feedback
   */
  success: () => {
    try {
      if (Haptics) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      // Haptics not available on this device
    }
  },

  /**
   * Warning notification feedback
   */
  warning: () => {
    try {
      if (Haptics) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
    } catch (error) {
      // Haptics not available on this device
    }
  },

  /**
   * Error notification feedback
   */
  error: () => {
    try {
      if (Haptics) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } catch (error) {
      // Haptics not available on this device
    }
  },

  /**
   * Selection feedback - for picker/selection changes
   */
  selection: () => {
    try {
      if (Haptics) {
        Haptics.selectionAsync();
      }
    } catch (error) {
      // Haptics not available on this device
    }
  },
};

