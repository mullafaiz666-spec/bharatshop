import test from 'node:test';
import assert from 'node:assert/strict';
import { REQUIRED_TABLES, verificationTables, sameDefinition, fingerprint } from '../scripts/migration-copy-checks.mjs';

test('an empty or unrelated source cannot pass a zero-table verification', () => {
  assert.throws(() => verificationTables([], []), /complete BharatShop/);
  assert.throws(() => verificationTables(['products'], ['products']), /complete BharatShop/);
});
test('all source tables, including new payment and agent tables, must be copied', () => {
  const tables = [...REQUIRED_TABLES, 'payment_events'];
  assert.throws(() => verificationTables(tables, REQUIRED_TABLES), /payment_events/);
  assert.throws(() => verificationTables(tables, tables, REQUIRED_TABLES), /Partial/);
  assert.deepEqual(verificationTables(tables, tables), [...tables].sort());
});
test('matching row counts do not excuse incompatible column types or constraints', () => {
  assert.equal(sameDefinition({ type: 'integer' }, { type: 'uuid' }), false);
  assert.equal(sameDefinition({ constraints: ['PRIMARY KEY(id)'] }, { constraints: [] }), false);
});
function clientFor(values) {
  let read = false;
  return { query: async sql => {
    if (!sql.startsWith('FETCH')) return { rows: [] };
    if (read) return { rows: [] };
    read = true;
    return { rows: values.map(value => ({ value })) };
  } };
}
test('equal-size copies with different row contents fail fingerprint equality', async () => {
  const a = await fingerprint(clientFor(['{"id":1,"price":10}']), 'public.products');
  const b = await fingerprint(clientFor(['{"id":1,"price":20}']), 'public.products');
  assert.equal(a.count, b.count);
  assert.notEqual(a.digest, b.digest);
  assert.deepEqual(a, await fingerprint(clientFor(['{"id":1,"price":10}']), 'public.products'));
});
