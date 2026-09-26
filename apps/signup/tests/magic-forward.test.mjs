import test from 'node:test';
import assert from 'node:assert/strict';
import {magicForwardUrl,CREATOR_APP_ORIGIN} from '../public/magic-forward.js';

test('magic links forward to the fixed creator app origin, preserving slug brand', () => {
  assert.equal(magicForwardUrl('?brand=glowlab&magic=abc'),
    'https://app.theprlist.net/?brand=glowlab&magic=abc');
  assert.equal(CREATOR_APP_ORIGIN, 'https://app.theprlist.net');
});

test('non-slug brand is dropped; no magic → no forward; invite/reset untouched', () => {
  assert.equal(magicForwardUrl('?brand=https%3A%2F%2Fevil&magic=abc'),
    'https://app.theprlist.net/?magic=abc');
  assert.equal(magicForwardUrl('?invite=abc'), null);
  assert.equal(magicForwardUrl('?reset=abc'), null);
});
