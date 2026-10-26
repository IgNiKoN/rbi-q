/**
 * Unit contract: knowledge appears once in ModulesManifest registry.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ModulesManifest } from '../../modules.manifest.js';

describe('ModulesManifest · knowledge', () => {
  it('includes exactly one knowledge entry', () => {
    const hits = ModulesManifest.filter((m) => m.id === 'knowledge');
    assert.equal(hits.length, 1, `expected 1 knowledge entry, got ${hits.length}`);
  });

  it('knowledge entry has role module', () => {
    const km = ModulesManifest.find((m) => m.id === 'knowledge');
    assert.ok(km, 'knowledge missing from ModulesManifest');
    assert.equal(km.role, 'module');
  });
});
