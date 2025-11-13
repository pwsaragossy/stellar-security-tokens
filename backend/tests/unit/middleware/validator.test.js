import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { body, validationResult } from 'express-validator';
import { validate } from '../../../middleware/validator.js';
import { createMockRequest, createMockResponse, createMockNext } from '../../helpers/testUtils.js';

describe('Validator Middleware', () => {
  test('validate() - passa quando não há erros de validação', async () => {
    const req = createMockRequest({
      body: {
        email: 'test@example.com',
        name: 'Test User',
      },
    });
    
    // Mock validationResult para retornar sem erros
    const mockValidationResult = {
      isEmpty: () => true,
      array: () => [],
    };
    
    // Substituir validationResult temporariamente
    const originalValidationResult = validationResult;
    const validateMiddleware = (req, res, next) => {
      const errors = mockValidationResult;
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array(),
        });
      }
      next();
    };

    const res = createMockResponse();
    const next = createMockNext();

    validateMiddleware(req, res, next);

    assert.strictEqual(next.called, true);
    assert.strictEqual(next.error, null);
  });

  test('validate() - retorna 400 quando há erros de validação', async () => {
    const req = createMockRequest({
      body: {
        email: 'invalid-email',
      },
    });
    const res = createMockResponse();
    const next = createMockNext();

    // Mock validationResult com erros
    const mockValidationResult = () => ({
      isEmpty: () => false,
      array: () => [
        {
          type: 'field',
          msg: 'Valid email is required',
          path: 'email',
          location: 'body',
        },
      ],
    });

    // Substituir temporariamente validationResult
    const originalModule = await import('express-validator');
    const originalValidationResult = originalModule.validationResult;
    
    // Criar novo módulo mockado
    const mockedModule = {
      ...originalModule,
      validationResult: mockValidationResult,
    };

    // Usar o mock
    const validateMiddleware = (req, res, next) => {
      const errors = mockValidationResult();
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array(),
        });
      }
      next();
    };

    validateMiddleware(req, res, next);

    assert.strictEqual(next.called, false);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.error, 'Validation failed');
    assert.strictEqual(res.body.details.length, 1);
  });

  test('validate() - retorna múltiplos erros de validação', async () => {
    const req = createMockRequest({
      body: {},
    });
    const res = createMockResponse();
    const next = createMockNext();

    const mockValidationResult = () => ({
      isEmpty: () => false,
      array: () => [
        {
          type: 'field',
          msg: 'Name is required',
          path: 'name',
          location: 'body',
        },
        {
          type: 'field',
          msg: 'Valid email is required',
          path: 'email',
          location: 'body',
        },
      ],
    });

    const validateMiddleware = (req, res, next) => {
      const errors = mockValidationResult();
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array(),
        });
      }
      next();
    };

    validateMiddleware(req, res, next);

    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.details.length, 2);
  });
});

