const { AppError } = require('./http');

function formatMySqlUtc(value) {
  const date = new Date(value);
  const year = date.getUTCFullYear();
  if (Number.isNaN(date.getTime()) || year < 1000 || year > 9999) {
    throw new AppError(422, 'Invalid datetime', 'VALIDATION_ERROR');
  }
  const pad = (part) => String(part).padStart(2, '0');
  return `${year}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

module.exports = { formatMySqlUtc };
