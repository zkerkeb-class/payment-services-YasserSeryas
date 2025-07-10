import Stripe from 'stripe';
import { databaseService } from '../services/databaseService.js';
import { logger } from '../utils/logger.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const handleStripeWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    logger.error('Erreur de signature webhook Stripe:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Gérer l'événement
  switch (event.type) {
    case 'payment_intent.succeeded':
      await handlePaymentIntentSucceeded(event.data.object);
      break;
    
    case 'payment_intent.payment_failed':
      await handlePaymentIntentFailed(event.data.object);
      break;
    
    case 'charge.dispute.created':
      await handleChargeDisputeCreated(event.data.object);
      break;
    
    case 'invoice.payment_succeeded':
      await handleInvoicePaymentSucceeded(event.data.object);
      break;
    
    default:
      logger.info(`Événement webhook non géré: ${event.type}`);
  }

  res.json({ received: true });
};

const handlePaymentIntentSucceeded = async (paymentIntent) => {
  try {
    // Rechercher le paiement par transactionId
    const payments = await databaseService.findPayments({ 
      transactionId: paymentIntent.id 
    });
    
    if (payments.data && payments.data.length > 0) {
      const payment = payments.data[0];
      await databaseService.markPaymentAsCompleted(payment._id, paymentIntent.id);
      logger.info(`Paiement complété via webhook: ${payment._id}`);
    }
  } catch (error) {
    logger.error('Erreur lors du traitement du paiement réussi:', error);
  }
};

const handlePaymentIntentFailed = async (paymentIntent) => {
  try {
    const payments = await databaseService.findPayments({ 
      transactionId: paymentIntent.id 
    });
    
    if (payments.data && payments.data.length > 0) {
      const payment = payments.data[0];
      await databaseService.updatePayment(payment._id, { 
        status: 'échoué' 
      });
      logger.info(`Paiement échoué via webhook: ${payment._id}`);
    }
  } catch (error) {
    logger.error('Erreur lors du traitement du paiement échoué:', error);
  }
};

const handleChargeDisputeCreated = async (dispute) => {
  try {
    const payments = await databaseService.findPayments({ 
      transactionId: dispute.charge 
    });
    
    if (payments.data && payments.data.length > 0) {
      const payment = payments.data[0];
      await databaseService.updatePayment(payment._id, { 
        notes: `Contestation créée: ${dispute.reason}` 
      });
      logger.warn(`Contestation créée pour le paiement: ${payment._id}`);
    }
  } catch (error) {
    logger.error('Erreur lors du traitement de la contestation:', error);
  }
};

const handleInvoicePaymentSucceeded = async (invoice) => {
  try {
    logger.info(`Facture payée avec succès: ${invoice.id}`);
    // Logique pour gérer les factures récurrentes si nécessaire
  } catch (error) {
    logger.error('Erreur lors du traitement de la facture payée:', error);
  }
};
