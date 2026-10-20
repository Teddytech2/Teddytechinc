const test = require('node:test');
const assert = require('node:assert/strict');
const { z } = require('zod');

const schema = z.object({
  amount: z.coerce.number().finite().positive().max(100000000),
  email: z.string().trim().email().max(254),
  donorName: z.string().trim().max(100).optional().default(''),
  message: z.string().trim().max(1000).optional().default(''),
  anonymous: z.boolean().optional().default(false)
});
test('accepts a custom positive donation amount', () => {
  assert.equal(schema.safeParse({ amount: '75.50', email: 'donor@example.com' }).success, true);
});
test('rejects zero and negative donation amounts', () => {
  assert.equal(schema.safeParse({ amount: '0', email: 'donor@example.com' }).success, false);
  assert.equal(schema.safeParse({ amount: '-2', email: 'donor@example.com' }).success, false);
});
test('rejects malformed email', () => {
  assert.equal(schema.safeParse({ amount: '30', email: 'not-an-email' }).success, false);
});
