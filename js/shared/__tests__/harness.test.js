/**
 * Smoke for `npm run test:unit` until real math/scoring tests appear.
 * Real cases land here when a block changes pure calc (see PROJECT_RULES.md).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('unit test harness', () => {
  it('node --test is wired', () => {
    assert.equal(1 + 1, 2);
  });
});
