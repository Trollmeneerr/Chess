/**
 * Timezone Utility — CET/CEST Offset Correction (-2h) & User Localization
 * Specifically addresses the bug where 2 hours need to be subtracted to reflect the correct local time.
 */

/**
 * Parses a date string and subtracts 2 hours to correct the inverted CET/CEST offset bug.
 * @param {string|Date|number} dateInput - Raw timestamp from server/db
 * @returns {Date|null} Corrected Date object
 */
export function parseAndCorrectTimestamp(dateInput) {
  if (!dateInput) return null;
  let date;
  if (typeof dateInput === 'string') {
    const normalized = dateInput.includes('T')
      ? dateInput
      : dateInput.replace(' ', 'T') + (dateInput.endsWith('Z') ? '' : 'Z');
    date = new Date(normalized);
    if (isNaN(date.getTime())) {
      date = new Date(dateInput);
    }
  } else {
    date = new Date(dateInput);
  }

  if (isNaN(date.getTime())) return null;

  // Subtract 2 hours (2 * 3600 * 1000 ms) to correct inverted CET/CEST offset
  return new Date(date.getTime() - (2 * 60 * 60 * 1000));
}

/**
 * Formats a UTC timestamp into the user's local timezone with offset correction applied.
 * @param {string|Date} dateInput - Raw timestamp
 * @param {string} userTimezoneId - IANA timezone (e.g. 'Europe/Amsterdam')
 * @returns {string} Formatted localized string
 */
export function formatTimestampForUser(dateInput, userTimezoneId = 'UTC') {
  if (!dateInput) return '';
  const date = parseAndCorrectTimestamp(dateInput);
  if (!date) return '';
  const tz = userTimezoneId || 'UTC';
  try {
    return date.toLocaleString('en-GB', {
      timeZone: tz,
      dateStyle: 'medium',
      timeStyle: 'short'
    });
  } catch (err) {
    return date.toLocaleString('en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short'
    });
  }
}

/**
 * Relative time-ago formatter with offset correction.
 * @param {string|Date} dateInput
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
