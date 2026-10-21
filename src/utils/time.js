/**
 * Strict UTC ISO 8601 Formatter
 * Standardizes database timestamps to strict UTC ISO 8601 format (e.g. 2026-10-22T10:37:00Z)
 * Never stores or returns local time offsets from the backend.
 */
function toIsoUtc(timestamp) {
  if (!timestamp) return null;
  if (typeof timestamp === 'string') {
    if (timestamp.endsWith('Z')) return timestamp;
    return timestamp.includes('T') ? `${timestamp}Z` : `${timestamp.replace(' ', 'T')}Z`;
  }
  const d = new Date(timestamp);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

module.exports = { toIsoUtc };
