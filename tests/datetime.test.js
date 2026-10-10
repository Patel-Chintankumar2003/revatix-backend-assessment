const test = require('node:test');
const assert = require('node:assert/strict');
const { formatMySqlUtc } = require('../src/utils/datetime');

test('formats ISO-8601 UTC timestamps for MySQL DATETIME parameters', () => {
  assert.equal(formatMySqlUtc('2038-01-15T12:00:00Z'), '2038-01-15 12:00:00');
  assert.equal(formatMySqlUtc('2038-01-15T17:30:45+05:30'), '2038-01-15 12:00:45');
});

test('rejects invalid or out-of-range MySQL DATETIME values', () => {
  assert.throws(() => formatMySqlUtc('not-a-date'));
  assert.throws(() => formatMySqlUtc('0999-12-31T23:59:59Z'));
});
