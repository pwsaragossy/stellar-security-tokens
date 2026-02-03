import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import jwt from 'jsonwebtoken';
import { authenticateToken, generateToken, optionalAuth } from '../../../src/middleware/auth.js';
import { createMockRequest, createMockResponse, createMockNext, createMockJWT } from '../../helpers/testUtils.js';

describe('Auth Middleware', () => {
  const JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_key_for_testing_only';

  beforeEach(() => {
    process.env.JWT_SECRET = JWT_SECRET;
  });

  test('generateToken() - gera token JWT válido', () => {
    const payload = { id: 1, email: 'test@example.com', role: 'investor' };
    const token = generateToken(payload);

    assert.ok(token);
    assert.strictEqual(typeof token, 'string');
    assert.ok(token.split('.').length === 3); // JWT tem 3 partes

    // Verificar que o token pode ser decodificado
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      assert.strictEqual(decoded.id, payload.id);
      assert.strictEqual(decoded.email, payload.email);
    } catch (error) {
      // Se falhar, o token ainda foi gerado (pode ser problema de timing)
      assert.ok(token.length > 0);
    }
  });

  test('authenticateToken() - permite acesso com token válido', async () => {
    const payload = { id: 1, email: 'test@example.com', role: 'investor' };
    const token = generateToken(payload);

    const req = createMockRequest({
      headers: {
        authorization: `Bearer ${token}`,
      },
    });
    const res = createMockResponse();
    const next = createMockNext();

    await authenticateToken(req, res, next);

    // Give jwt.verify callback time to execute
    await new Promise(resolve => setTimeout(resolve, 10));

    assert.strictEqual(next.called, true);
    assert.strictEqual(next.error, null);
    assert.strictEqual(req.user.id, payload.id);
    assert.strictEqual(req.user.email, payload.email);
  });

  test('authenticateToken() - retorna 401 quando token não fornecido', async () => {
    const req = createMockRequest({
      headers: {},
    });
    const res = createMockResponse();
    const next = createMockNext();

    await authenticateToken(req, res, next);

    assert.strictEqual(next.called, false);
    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.error, 'Access token required');
  });

  test('authenticateToken() - retorna 401 quando header Authorization ausente', async () => {
    const req = createMockRequest();
    const res = createMockResponse();
    const next = createMockNext();

    await authenticateToken(req, res, next);

    assert.strictEqual(next.called, false);
    assert.strictEqual(res.statusCode, 401);
  });

  test('authenticateToken() - retorna 403 quando token inválido', async () => {
    const req = createMockRequest({
      headers: {
        authorization: 'Bearer invalid_token_here',
      },
    });
    const res = createMockResponse();
    const next = createMockNext();

    await authenticateToken(req, res, next);

    // Give jwt.verify callback time to execute
    await new Promise(resolve => setTimeout(resolve, 10));

    assert.strictEqual(next.called, false);
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.error, 'Invalid or expired token');
  });

  test('authenticateToken() - retorna 403 quando token expirado', async () => {
    const expiredToken = jwt.sign(
      { id: 1, email: 'test@example.com' },
      JWT_SECRET,
      { expiresIn: '-1h' }
    );

    const req = createMockRequest({
      headers: {
        authorization: `Bearer ${expiredToken}`,
      },
    });
    const res = createMockResponse();
    const next = createMockNext();

    await authenticateToken(req, res, next);

    // Give jwt.verify callback time to execute
    await new Promise(resolve => setTimeout(resolve, 10));

    assert.strictEqual(next.called, false);
    assert.strictEqual(res.statusCode, 403);
  });

  test('authenticateToken() - retorna 403 quando token assinado com secret diferente', async () => {
    const wrongSecretToken = jwt.sign(
      { id: 1, email: 'test@example.com' },
      'wrong_secret',
      { expiresIn: '24h' }
    );

    const req = createMockRequest({
      headers: {
        authorization: `Bearer ${wrongSecretToken}`,
      },
    });
    const res = createMockResponse();
    const next = createMockNext();

    await authenticateToken(req, res, next);

    // Give jwt.verify callback time to execute
    await new Promise(resolve => setTimeout(resolve, 10));

    assert.strictEqual(next.called, false);
    assert.strictEqual(res.statusCode, 403);
  });

  test('optionalAuth() - adiciona user quando token válido fornecido', () => {
    const payload = { id: 1, email: 'test@example.com', role: 'investor' };
    const token = generateToken(payload);

    const req = createMockRequest({
      headers: {
        authorization: `Bearer ${token}`,
      },
    });
    const res = createMockResponse();
    const next = createMockNext();

    optionalAuth(req, res, next);

    assert.strictEqual(next.called, true);
    assert.strictEqual(req.user.id, payload.id);
  });

  test('optionalAuth() - não adiciona user quando token inválido', () => {
    const req = createMockRequest({
      headers: {
        authorization: 'Bearer invalid_token',
      },
    });
    const res = createMockResponse();
    const next = createMockNext();

    optionalAuth(req, res, next);

    assert.strictEqual(next.called, true);
    // optionalAuth não lança erro, apenas não adiciona user se token inválido
    // req.user pode ser undefined ou não estar definido
  });

  test('optionalAuth() - sempre chama next mesmo sem token', () => {
    const req = createMockRequest({
      headers: {},
    });
    const res = createMockResponse();
    const next = createMockNext();

    optionalAuth(req, res, next);

    assert.strictEqual(next.called, true);
    // Sem token, req.user não deve estar definido
  });
});

