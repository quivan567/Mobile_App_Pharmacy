/**
 * Format date to relative time (e.g., "2 giờ trước", "Hôm nay", "Hôm qua")
 */
export const formatRelativeTime = (date: Date | string): string => {
  const now = new Date();
  const notificationDate = typeof date === 'string' ? new Date(date) : date;
  const diffInMs = now.getTime() - notificationDate.getTime();
  const diffInSeconds = Math.floor(diffInMs / 1000);
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  const diffInHours = Math.floor(diffInMinutes / 60);
  const diffInDays = Math.floor(diffInHours / 24);

  // Same day
  if (diffInDays === 0) {
    if (diffInMinutes < 1) {
      return 'Vừa xong';
    } else if (diffInMinutes < 60) {
      return `${diffInMinutes} phút trước`;
    } else {
      return `${diffInHours} giờ trước`;
    }
  }

  // Yesterday
  if (diffInDays === 1) {
    return 'Hôm qua';
  }

  // This week
  if (diffInDays < 7) {
    return `${diffInDays} ngày trước`;
  }

  // Older than a week - show date
  const day = notificationDate.getDate();
  const month = notificationDate.getMonth() + 1;
  const year = notificationDate.getFullYear();
  const currentYear = now.getFullYear();

  if (year === currentYear) {
    return `${day}/${month}`;
  }

  return `${day}/${month}/${year}`;
};

/**
 * Format date to full date time string
 */
export const formatDateTime = (date: Date | string): string => {
  const notificationDate = typeof date === 'string' ? new Date(date) : date;
  return notificationDate.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

