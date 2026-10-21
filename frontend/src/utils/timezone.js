/**
 * Timezone Utility — Native UTC Localization (Intl.DateTimeFormat & Date.toLocaleString)
 * Fixes the CET/CEST DST bug by eliminating manual 2-hour offset additions/subtractions.
 * All backend timestamps are strictly UTC ISO 8601 strings.
 * The browser natively converts UTC to local time (or user's selected IANA timezone).
 */

/**
 * Parses a UTC date string into a native Date object without manual hour offsets.
 * @param {string|Date|number} dateInput - Raw UTC timestamp (ISO 8601 or SQL UTC format)
 * @returns {Date|null} Native Date object in UTC
 */
export function parseAndCorrectTimestamp(dateInput) {
  if (!dateInput) return null;
  let date;
  if (typeof dateInput === 'string') {
    const normalized = dateInput.includes('T')
      ? (dateInput.endsWith('Z') ? dateInput : `${dateInput}Z`)
      : `${dateInput.replace(' ', 'T')}${dateInput.endsWith('Z') ? '' : 'Z'}`;
    date = new Date(normalized);
    if (isNaN(date.getTime())) {
      date = new Date(dateInput);
    }
  } else {
    date = new Date(dateInput);
  }

  if (isNaN(date.getTime())) return null;
  return date;
}

/**
 * Formats a UTC timestamp into the user's local timezone natively using Intl.DateTimeFormat or Date.toLocaleString().
 * @param {string|Date} dateInput - Raw UTC timestamp
 * @param {string} [userTimezoneId] - Optional IANA timezone (e.g. 'Europe/Amsterdam'). If not provided, defaults to user's native browser timezone.
 * @returns {string} Localized date and time string
 */
export function formatTimestampForUser(dateInput, userTimezoneId) {
  if (!dateInput) return '';
  const date = parseAndCorrectTimestamp(dateInput);
  if (!date) return '';

  const options = {
    dateStyle: 'medium',
    timeStyle: 'short'
  };

  if (userTimezoneId && userTimezoneId !== 'UTC' && userTimezoneId !== 'local') {
    try {
      return new Intl.DateTimeFormat(undefined, { ...options, timeZone: userTimezoneId }).format(date);
    } catch (err) {
      // Fall through to native local conversion
    }
  }

  return date.toLocaleString(undefined, options);
}

/**
 * Relative time-ago formatter based on true UTC timestamps.
 * @param {string|Date} dateInput - Raw UTC timestamp
 * @returns {string} e.g. "Just now", "5m ago", "2h ago", "1d ago"
 */
export function formatTimeAgo(dateInput) {
  if (!dateInput) return '';
  const date = parseAndCorrectTimestamp(dateInput);
  if (!date) return '';
  const sec = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (sec < 60) return 'Just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}

// Global window exposure for plug-and-play non-module environments
if (typeof window !== 'undefined') {
  window.parseAndCorrectTimestamp = parseAndCorrectTimestamp;
  window.formatTimestampForUser = formatTimestampForUser;
  window.formatTimeAgo = formatTimeAgo;
}
