/**
 * Date and time utility functions for formatting timestamps and durations
 */

/**
 * Format a date as relative time (e.g., "2 hours ago", "Yesterday")
 * - Less than 1 hour: "X minutes ago"
 * - Less than 24 hours: "X hours ago"
 * - Yesterday: "Yesterday"
 * - Older: "Mon, Jan 8" format
 */
export function formatRelativeTime(date: Date | string | null): string {
  if (!date) {
    return 'Unknown';
  }

  const now = new Date();
  const then = typeof date === 'string' ? new Date(date) : date;
  const diffMs = now.getTime() - then.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  // Less than 1 minute
  if (diffMinutes < 1) {
    return 'Just now';
  }

  // Less than 1 hour
  if (diffMinutes < 60) {
    return `${diffMinutes} ${diffMinutes === 1 ? 'minute' : 'minutes'} ago`;
  }

  // Less than 24 hours
  if (diffHours < 24) {
    return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
  }

  // Yesterday
  if (diffDays === 1) {
    return 'Yesterday';
  }

  // Less than 7 days - show day name
  if (diffDays < 7) {
    return then.toLocaleDateString('en-US', { weekday: 'short' });
  }

  // Older - show date
  return then.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  });
}

/**
 * Format duration in seconds to MM:SS format
 * Examples:
 * - 65 seconds -> "1:05"
 * - 3661 seconds -> "61:01"
 * - 45 seconds -> "0:45"
 */
export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds < 0) {
    return '0:00';
  }

  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);

  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format a voice session timestamp with duration
 * Examples:
 * - "2 hours ago • 12:34"
 * - "Yesterday • 5:23"
 */
export function formatVoiceSessionTime(
  createdAt: Date | string | null,
  durationSeconds: number | null | undefined
): string {
  const relativeTime = formatRelativeTime(createdAt);
  const duration = formatDuration(durationSeconds);

  return `${relativeTime} • ${duration}`;
}
