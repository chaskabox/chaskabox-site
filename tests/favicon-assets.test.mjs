import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const asset = (name) => readFileSync(new URL('../' + name, import.meta.url));

test('favicon.ico embeds exactly the approved ChaskaBox PNG', () => {
  const ico = asset('favicon.ico');
  const png = asset('favicon.png');
  assert.equal(ico.readUInt16LE(0), 0);
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), 1);
  assert.equal(ico.readUInt8(6), 48);
  assert.equal(ico.readUInt8(7), 48);
  assert.equal(ico.readUInt32LE(14), png.length);
  const offset = ico.readUInt32LE(18);
  assert.deepEqual(ico.subarray(offset), png);
});

test('storefront pages declare approved PNG and ICO fallback', () => {
  for (const path of ['index.html', 'shop/index.html', 'brands/index.html', 'product/index.html', 'bundles/index.html', 'category/biscuits-and-wafers/index.html']) {
    const html = asset(path).toString('utf8');
    assert.ok(html.includes('href="/favicon.ico?v=20261021-tabfix1"'), path);
    assert.ok(html.includes('href="/favicon.png?v=20261021-tabfix1"'), path);
  }
});
