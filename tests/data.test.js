import test from 'node:test';
import assert from 'node:assert/strict';
import { data, emptyData } from '../assets/js/data.js';

test('production starts empty and workspaces do not share collections', () => {
  assert.deepEqual(data, emptyData());
  const first = emptyData();
  first.clientes.push([1]);
  assert.deepEqual(emptyData().clientes, []);
});
