/**
 * responseSanitizer middleware — Express 5 compatibility test
 *
 * Verifies the res.json monkey-patch survives Express major upgrades.
 * The middleware intercepts 5xx responses in production to strip error
 * details and prevent information leakage.
 *
 *  req → responseSanitizer → route → res.json(body)
 *                                       │
 *                          ┌─────────────┼─────────────┐
 *                          │ statusCode < 500          │ statusCode ≥ 500
 *                          │ → pass through            │ → strip details,
 *                          │   unchanged               │   return { success,
 *                          │                           │   error, errorId }
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { responseSanitizer } from '../../../src/middleware/responseSanitizer.js';
import { createMockRequest, createMockResponse, createMockNext } from '../../helpers/testUtils.js';

describe('responseSanitizer', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = process.env.NODE_ENV;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('should pass through non-5xx responses unchanged in production', () => {
    process.env.NODE_ENV = 'production';
    const req = createMockRequest();
    const res = createMockResponse();
    const next = createMockNext();

    responseSanitizer(req, res, next);
    assert.ok(next.called, 'next() should be called');

    // Simulate a 200 response
    res.status(200);
    res.json({ success: true, data: { id: 1 } });

    assert.deepStrictEqual(res.body, { success: true, data: { id: 1 } });
  });

  it('should strip error details from 5xx responses in production', () => {
    process.env.NODE_ENV = 'production';
    const req = createMockRequest();
    const res = createMockResponse();
    const next = createMockNext();

    responseSanitizer(req, res, next);
    assert.ok(next.called, 'next() should be called');

    // Simulate a 500 response with sensitive details
    res.status(500);
    res.json({
      success: false,
      error: 'PrismaClientKnownRequestError: Invalid query',
      details: 'SELECT * FROM users WHERE ...',
      stack: 'Error at Object.<anonymous> ...',
    });

    // Should be sanitized
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.error, 'Internal server error');
    assert.ok(res.body.errorId, 'should include an errorId for tracking');
    assert.strictEqual(res.body.details, undefined, 'should strip details');
    assert.strictEqual(res.body.stack, undefined, 'should strip stack');
  });

  it('should not modify responses in development', () => {
    process.env.NODE_ENV = 'development';
    const req = createMockRequest();
    const res = createMockResponse();
    const next = createMockNext();

    responseSanitizer(req, res, next);
    assert.ok(next.called, 'next() should be called');

    // In dev, res.json should NOT be monkey-patched
    res.status(500);
    res.json({ success: false, error: 'Detailed error', stack: 'full stack' });

    // Should pass through unchanged
    assert.strictEqual(res.body.error, 'Detailed error');
    assert.strictEqual(res.body.stack, 'full stack');
  });

  it('should preserve the errorId if already present in the response', () => {
    process.env.NODE_ENV = 'production';
    const req = createMockRequest();
    const res = createMockResponse();
    const next = createMockNext();

    responseSanitizer(req, res, next);

    res.status(502);
    res.json({
      success: false,
      error: 'Gateway timeout details',
      errorId: 'existing-error-id-123',
    });

    assert.strictEqual(res.body.errorId, 'existing-error-id-123');
    assert.strictEqual(res.body.error, 'Internal server error');
  });
});
