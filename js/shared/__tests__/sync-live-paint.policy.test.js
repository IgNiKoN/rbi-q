/**
 * Silent-sync live-paint policy (analytics desk / flush).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  shouldFullRebuildAnalyticsLive,
  shouldSkipAnalyticsLivePaint,
  shouldScheduleDeskAfterTabPaint,
  deskDetailsOpenAttr,
  analyticsSourceDataSignatureFromArray,
  isReusablePhotoThumbUrl,
  shouldRepaintDeskContextZones
} from '../sync-live-paint.policy.js';

describe('shouldSkipAnalyticsLivePaint', () => {
  it('skips when only dataChanged on painted section (silent sync)', () => {
    assert.equal(shouldSkipAnalyticsLivePaint({
      filterFpChanged: false,
      dataChanged: true,
      sectionPainted: true
    }), true);
  });

  it('does not skip when filter fingerprint changed', () => {
    assert.equal(shouldSkipAnalyticsLivePaint({
      filterFpChanged: true,
      dataChanged: true,
      sectionPainted: true
    }), false);
  });

  it('does not skip empty/skeleton section needing first paint', () => {
    assert.equal(shouldSkipAnalyticsLivePaint({
      filterFpChanged: false,
      dataChanged: true,
      sectionPainted: false
    }), false);
  });
});

describe('shouldFullRebuildAnalyticsLive', () => {
  it('rebuilds on filter change', () => {
    assert.equal(shouldFullRebuildAnalyticsLive({
      filterFpChanged: true,
      dataChanged: false,
      sectionPainted: true
    }), true);
  });

  it('does not rebuild painted UI on data-only change', () => {
    assert.equal(shouldFullRebuildAnalyticsLive({
      filterFpChanged: false,
      dataChanged: true,
      sectionPainted: true
    }), false);
  });

  it('rebuilds unpainted UI when data arrived', () => {
    assert.equal(shouldFullRebuildAnalyticsLive({
      filterFpChanged: false,
      dataChanged: true,
      sectionPainted: false
    }), true);
  });
});

describe('shouldScheduleDeskAfterTabPaint', () => {
  it('schedules only when paint returned true', () => {
    assert.equal(shouldScheduleDeskAfterTabPaint(true), true);
    assert.equal(shouldScheduleDeskAfterTabPaint(false), false);
    assert.equal(shouldScheduleDeskAfterTabPaint(undefined), false);
    assert.equal(shouldScheduleDeskAfterTabPaint(null), false);
  });
});

describe('deskDetailsOpenAttr', () => {
  it('defaults to open when no previous state', () => {
    assert.equal(deskDetailsOpenAttr(null), ' open');
    assert.equal(deskDetailsOpenAttr(undefined), ' open');
  });

  it('preserves previous open/closed', () => {
    assert.equal(deskDetailsOpenAttr(true), ' open');
    assert.equal(deskDetailsOpenAttr(false), '');
  });
});

describe('analyticsSourceDataSignatureFromArray', () => {
  it('is stable across reorder of the same ids', () => {
    const a = analyticsSourceDataSignatureFromArray([{ id: '2' }, { id: '1' }, { id: '9' }]);
    const b = analyticsSourceDataSignatureFromArray([{ id: '9' }, { id: '2' }, { id: '1' }]);
    assert.equal(a, b);
    assert.equal(a, '3:1:9');
  });

  it('changes when length changes', () => {
    const a = analyticsSourceDataSignatureFromArray([{ id: '1' }, { id: '2' }]);
    const b = analyticsSourceDataSignatureFromArray([{ id: '1' }, { id: '2' }, { id: '3' }]);
    assert.notEqual(a, b);
  });

  it('empty → 0', () => {
    assert.equal(analyticsSourceDataSignatureFromArray([]), '0');
    assert.equal(analyticsSourceDataSignatureFromArray(null), '0');
  });
});

describe('isReusablePhotoThumbUrl', () => {
  it('rejects blob: (PhotoManager may have revoked)', () => {
    assert.equal(isReusablePhotoThumbUrl('blob:http://localhost:5500/abc'), false);
  });

  it('allows data: and http(s)', () => {
    assert.equal(isReusablePhotoThumbUrl('data:image/jpeg;base64,xx'), true);
    assert.equal(isReusablePhotoThumbUrl('https://cdn.example/p.jpg'), true);
  });

  it('rejects empty', () => {
    assert.equal(isReusablePhotoThumbUrl(''), false);
    assert.equal(isReusablePhotoThumbUrl(null), false);
  });
});

describe('shouldRepaintDeskContextZones', () => {
  it('skips wipe when galleries already hydrated', () => {
    assert.equal(shouldRepaintDeskContextZones({ hasGalleryWrap: true }), false);
  });

  it('repaints when empty or forced', () => {
    assert.equal(shouldRepaintDeskContextZones({ hasGalleryWrap: false }), true);
    assert.equal(shouldRepaintDeskContextZones({ hasGalleryWrap: true, force: true }), true);
  });
});
