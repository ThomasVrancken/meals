// Small HTTP helpers shared by routes and services: a typed error that the
// Express error handler turns into `{error}` with the right status code, and
// a few input validators.

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const badRequest = (message) => new HttpError(400, message);
const notFound = (message = 'Not found') => new HttpError(404, message);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const d = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Today's date (YYYY-MM-DD) in Amsterdam, optionally shifted by N days. */
function amsterdamDate(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Amsterdam',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function amsterdamWeekday(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Amsterdam', weekday: 'long' }).format(d);
}

/** Validate an optional string field; returns trimmed string, null, or undefined (absent). */
function optionalString(body, key, { max = 2000, nullable = true } = {}) {
  if (!(key in body)) return undefined;
  const v = body[key];
  if (v === null || v === undefined) {
    if (nullable) return null;
    throw badRequest(`${key} must be a string`);
  }
  if (typeof v !== 'string') throw badRequest(`${key} must be a string`);
  const t = v.trim();
  if (t.length > max) throw badRequest(`${key} is too long (max ${max} chars)`);
  if (!t && nullable) return null;
  return t;
}

const RATINGS = ['up', 'meh', 'down'];

function optionalRating(body, key = 'rating') {
  if (!(key in body) || body[key] === null || body[key] === undefined || body[key] === '') {
    return key in body ? null : undefined;
  }
  if (!RATINGS.includes(body[key])) throw badRequest(`${key} must be one of ${RATINGS.join(', ')} or null`);
  return body[key];
}

function optionalDate(body, key = 'cookedAt') {
  if (!(key in body) || body[key] === null || body[key] === undefined || body[key] === '') {
    return key in body ? null : undefined;
  }
  if (!isValidDate(body[key])) throw badRequest(`${key} must be a date in YYYY-MM-DD format`);
  return body[key];
}

module.exports = {
  HttpError,
  badRequest,
  notFound,
  isValidDate,
  amsterdamDate,
  amsterdamWeekday,
  optionalString,
  optionalRating,
  optionalDate,
  RATINGS,
};
