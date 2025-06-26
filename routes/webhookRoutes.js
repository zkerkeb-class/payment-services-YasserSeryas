import express from 'express';
import { handleStripeWebhook } from '../controllers/webhookController.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

// Middleware pour capturer le raw body (nécessaire pour Stripe)
router.use('/stripe', express.raw({ type: 'application/json' }));

// Route pour les webhooks Stripe
router.post('/stripe', handleStripeWebhook);

// Route pour les webhooks PayPal (si nécessaire)
router.post('/paypal', express.json(), (req, res) => {
  logger.info('Webhook PayPal reçu:', req.body);
  // Traitement des webhooks PayPal
  res.status(200).json({ received: true });
});

// Route de test pour les webhooks
router.get('/test', (req, res) => {
  res.json({ 
    message: 'Webhook endpoints actifs',
    endpoints: ['/stripe', '/paypal']
  });
});

export default router;
