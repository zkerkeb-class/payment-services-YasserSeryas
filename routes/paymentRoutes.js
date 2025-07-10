import express from 'express';
import { body } from 'express-validator';
import {
  createPayment,
  getPayment,
  getAllPayments,
  updatePaymentStatus,
  processRefund,
  getPaymentsByReservation,
  getPaymentStats,
  cancelPayment,
  createStripePaymentLink,
  handleStripeWebhook,
  checkStripeSessionStatus
} from '../controllers/paymentController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { extractUserToken, requireUserToken } from '../middleware/tokenMiddleware.js';
import { validateRequest } from '../middleware/validateRequest.js';

const router = express.Router();

// Validation pour la création de paiement
const createPaymentValidation = [
  body('reservationId')
    .isMongoId()
    .withMessage('ID de réservation invalide'),
  body('amount')
    .isNumeric()
    .withMessage('Le montant doit être numérique')
    .isFloat({ min: 0.01 })
    .withMessage('Le montant doit être supérieur à 0'),
  body('currency')
    .optional()
    .isLength({ min: 3, max: 3 })
    .withMessage('La devise doit contenir 3 caractères'),
  body('paymentMethod')
    .isIn(['carte_credit', 'paypal', 'virement', 'especes', 'autre'])
    .withMessage('Méthode de paiement invalide'),
  body('billingAddress.name')
    .optional()
    .isLength({ min: 2, max: 100 })
    .withMessage('Le nom doit contenir entre 2 et 100 caractères'),
  body('billingAddress.email')
    .optional()
    .isEmail()
    .withMessage('Adresse email invalide')
];

// Validation pour la création de lien Stripe
const createStripeLinkValidation = [
  body('successUrl')
    .optional()
    .isURL()
    .withMessage('URL de succès invalide'),
  body('cancelUrl')
    .optional()
    .isURL()
    .withMessage('URL d\'annulation invalide')
];

// Validation pour le remboursement
const refundValidation = [
  body('amount')
    .isNumeric()
    .withMessage('Le montant doit être numérique')
    .isFloat({ min: 0.01 })
    .withMessage('Le montant doit être supérieur à 0'),
  body('reason')
    .isLength({ min: 5, max: 500 })
    .withMessage('La raison doit contenir entre 5 et 500 caractères')
];

// Routes publiques (pour les webhooks et certaines consultations)
router.get('/health', (req, res) => {
  res.json({ status: 'OK', service: 'Payment Routes' });
});

// Webhook Stripe (doit être avant les middlewares d'auth)
router.post('/webhook/stripe', 
  express.raw({ type: 'application/json' }), 
  handleStripeWebhook
);

// Routes protégées par authentification
router.use(extractUserToken); // Extraire le token pour toutes les routes
router.use(authMiddleware);

// CRUD des paiements
router.post('/', createPaymentValidation, validateRequest, requireUserToken, createPayment);
router.get('/stats', requireUserToken, getPaymentStats);
router.get('/:id', requireUserToken, getPayment);
router.get('/', requireUserToken, getAllPayments);
router.put('/:id/status', requireUserToken, updatePaymentStatus);
router.delete('/:id', requireUserToken, cancelPayment);

// Opérations spécifiques
router.post('/:id/create-stripe-link', createStripeLinkValidation, validateRequest, requireUserToken, createStripePaymentLink);
router.post('/:id/refund', refundValidation, validateRequest, requireUserToken, processRefund);
router.get('/reservation/:reservationId', requireUserToken, getPaymentsByReservation);
router.get('/stripe/session/:sessionId/status', requireUserToken, checkStripeSessionStatus);

export default router;
