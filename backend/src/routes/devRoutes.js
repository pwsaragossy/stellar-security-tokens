import express from 'express';
import { DevController } from './controllers/devController.js';

const router = express.Router();

// Rotas de debug - habilitadas via variável de ambiente ENABLE_DEV_ROUTES
// Permite habilitar rotas de dev mesmo em produção para desenvolvimento/testes
if (process.env.ENABLE_DEV_ROUTES === 'true') {
  router.post('/login/investor', DevController.devLoginInvestor);
  router.post('/login/company', DevController.devLoginCompany);
  router.post('/login/admin', DevController.devLoginAdmin);
}

export default router;

