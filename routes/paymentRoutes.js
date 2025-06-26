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
  cancelPayment
} from '../controllers/paymentController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { validateRequest } from '../middleware/validateRequest.js';

const router = express.Router();

// Validation pour la création de paiement
const createPaymentValidation = [
  body('reservation')
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

// Routes protégées par authentification
router.use(authMiddleware);

// CRUD des paiements
router.post('/', createPaymentValidation, validateRequest, createPayment);
router.get('/stats', getPaymentStats);
router.get('/:id', getPayment);
router.get('/', getAllPayments);
router.put('/:id/status', updatePaymentStatus);
router.delete('/:id', cancelPayment);

// Opérations spécifiques
router.post('/:id/refund', refundValidation, validateRequest, processRefund);
router.get('/reservation/:reservationId', getPaymentsByReservation);

export default router;
