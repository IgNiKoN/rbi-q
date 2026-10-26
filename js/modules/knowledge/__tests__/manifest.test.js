/**
 * Unit contract: KnowledgeManifest (no runtime / IndexedDB).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { KnowledgeManifest } from '../knowledge.manifest.js';

const EXPECTED_ROUTES = [
  '/knowledge',
  '/knowledge/twi',
  '/knowledge/docs',
  '/knowledge/nodes',
  '/knowledge/etalons',
];

describe('KnowledgeManifest', () => {
  it('id is knowledge', () => {
    assert.equal(KnowledgeManifest.id, 'knowledge');
  });

  it('role is module (top-level platform module)', () => {
    assert.equal(KnowledgeManifest.role, 'module');
  });

  it('entry points at index.js', () => {
    assert.equal(KnowledgeManifest.entry, './index.js');
  });

  it('defaultRoute is /knowledge', () => {
    assert.equal(KnowledgeManifest.defaultRoute, '/knowledge');
  });

  it('routes include expected knowledge paths', () => {
    assert.ok(Array.isArray(KnowledgeManifest.routes));
    for (const route of EXPECTED_ROUTES) {
      assert.ok(
        KnowledgeManifest.routes.includes(route),
        `missing route ${route}`
      );
    }
  });

  it('status is active', () => {
    assert.equal(KnowledgeManifest.status, 'active');
  });
});
