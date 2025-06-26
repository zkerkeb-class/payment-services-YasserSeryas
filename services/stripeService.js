import Stripe from 'stripe';
import { logger } from '../utils/logger.js';
import { AppError } from '../utils/AppError.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

class StripeService {  // Traiter un paiement par carte de crédit
  async processPayment(payment, paymentDetails) {
    try {
      // Créer un PaymentIntent
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(payment.amount * 100), // Stripe utilise les centimes
        currency: payment.currency.toLowerCase(),
        metadata: {
          paymentId: payment._id.toString(),
          reservationId: payment.reservation.toString()
        },
        description: `Paiement pour réservation ${payment.reservation}`,
        automatic_payment_methods: {
          enabled: true,
        },
      });

      // Préparer les données de mise à jour
      const updateData = {
        transactionId: paymentIntent.id,
        status: 'traitement',
        paymentDetails: {
          ...payment.paymentDetails,
          stripePaymentIntentId: paymentIntent.id,
          clientSecret: paymentIntent.client_secret
        }
      };

      logger.info(`PaymentIntent créé pour le paiement ${payment._id}: ${paymentIntent.id}`);

      return {
        ...payment,
        ...updateData
      };
    } catch (error) {
      logger.error('Erreur lors du traitement du paiement Stripe:', error);
      throw new AppError('Erreur lors du traitement du paiement', 500);
    }
  }

  // Confirmer un paiement (appelé après la validation côté client)
  async confirmPayment(paymentIntentId, paymentMethodId) {
    try {
      const paymentIntent = await stripe.paymentIntents.confirm(paymentIntentId, {
        payment_method: paymentMethodId,
        return_url: `${process.env.FRONTEND_URL}/payment/success`,
      });

      return paymentIntent;
    } catch (error) {
      logger.error('Erreur lors de la confirmation du paiement:', error);
      throw new AppError('Erreur lors de la confirmation du paiement', 500);
    }
  }

  // Traiter un remboursement
  async processRefund(transactionId, amount) {
    try {
      const refund = await stripe.refunds.create({
        payment_intent: transactionId,
        amount: Math.round(amount * 100), // Montant en centimes
      });

      logger.info(`Remboursement créé: ${refund.id} pour ${amount}€`);

      return refund;
    } catch (error) {
      logger.error('Erreur lors du remboursement Stripe:', error);
      throw new AppError('Erreur lors du remboursement', 500);
    }
  }

  // Récupérer les détails d'un paiement
  async getPaymentDetails(paymentIntentId) {
    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      return paymentIntent;
    } catch (error) {
      logger.error('Erreur lors de la récupération des détails du paiement:', error);
      throw new AppError('Erreur lors de la récupération des détails', 500);
    }
  }

  // Créer un client Stripe
  async createCustomer(customerData) {
    try {
      const customer = await stripe.customers.create({
        email: customerData.email,
        name: customerData.name,
        address: customerData.address,
        metadata: {
          userId: customerData.userId
        }
      });

      return customer;
    } catch (error) {
      logger.error('Erreur lors de la création du client Stripe:', error);
      throw new AppError('Erreur lors de la création du client', 500);
    }
  }

  // Créer une méthode de paiement
  async createPaymentMethod(type, cardData) {
    try {
      const paymentMethod = await stripe.paymentMethods.create({
        type: type,
        card: cardData,
      });

      return paymentMethod;
    } catch (error) {
      logger.error('Erreur lors de la création de la méthode de paiement:', error);
      throw new AppError('Erreur lors de la création de la méthode de paiement', 500);
    }
  }

  // Récupérer les frais de transaction
  async getTransactionFees(paymentIntentId) {
    try {
      const charges = await stripe.charges.list({
        payment_intent: paymentIntentId,
      });

      if (charges.data.length > 0) {
        const charge = charges.data[0];
        return {
          fees: charge.application_fee_amount || 0,
          net: charge.amount - (charge.application_fee_amount || 0),
          currency: charge.currency
        };
      }

      return null;
    } catch (error) {
      logger.error('Erreur lors de la récupération des frais:', error);
      throw new AppError('Erreur lors de la récupération des frais', 500);
    }
  }
}

export const stripeService = new StripeService();
