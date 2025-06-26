import axios from 'axios';
import { databaseService } from './databaseService.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../utils/AppError.js';

class PaymentService {
  constructor() {
    this.reservationServiceUrl = process.env.RESERVATION_SERVICE_URL || 'http://localhost:3001';
    this.notificationServiceUrl = process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3004';
  }
  // Valider qu'une réservation existe et peut être payée
  async validateReservation(reservationId) {
    try {
      const reservation = await databaseService.findReservationById(reservationId);
      
      if (!reservation) {
        throw new AppError('Réservation non trouvée', 404);
      }

      if (reservation.data.status === 'annulée') {
        throw new AppError('Impossible de payer une réservation annulée', 400);
      }

      if (reservation.data.status === 'confirmée') {
        throw new AppError('Cette réservation a déjà été payée', 400);
      }

      return reservation.data;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error('Erreur lors de la validation de la réservation:', error);
      throw new AppError('Erreur lors de la validation de la réservation', 500);
    }
  }

  // Notifier les autres services du changement de statut de paiement
  async notifyPaymentStatusChange(paymentId, status, reservationId) {
    try {
      // Notifier le service de réservation
      await axios.put(`${this.reservationServiceUrl}/api/reservations/${reservationId}/payment-status`, {
        paymentId,
        status
      });

      // Notifier le service de notification
      await axios.post(`${this.notificationServiceUrl}/api/notifications`, {
        type: 'payment_status_change',
        recipientId: reservationId,
        data: {
          paymentId,
          status,
          reservationId
        }
      });

      logger.info(`Notification envoyée pour le changement de statut de paiement: ${paymentId} - ${status}`);
    } catch (error) {
      logger.error('Erreur lors de la notification des services:', error);
      // Ne pas faire échouer le paiement si la notification échoue
    }
  }
  // Traiter un paiement PayPal (placeholder)
  async processPayPalPayment(payment, paymentDetails) {
    try {
      // Logique d'intégration PayPal à implémenter
      logger.info(`Traitement du paiement PayPal pour: ${payment._id}`);
      
      // Pour l'instant, retourner les données de mise à jour
      return {
        ...payment,
        status: 'en attente',
        notes: 'Paiement PayPal en attente de traitement'
      };
    } catch (error) {
      logger.error('Erreur lors du traitement du paiement PayPal:', error);
      throw new AppError('Erreur lors du traitement du paiement PayPal', 500);
    }
  }

  // Calculer les frais de transaction
  calculateTransactionFees(amount, paymentMethod) {
    const fees = {
      carte_credit: 0.029, // 2.9% + 0.30€
      paypal: 0.034, // 3.4% + 0.35€
      virement: 0.005, // 0.5%
      especes: 0,
      autre: 0
    };

    const fixedFees = {
      carte_credit: 0.30,
      paypal: 0.35,
      virement: 0,
      especes: 0,
      autre: 0
    };

    const percentageFee = amount * (fees[paymentMethod] || 0);
    const fixedFee = fixedFees[paymentMethod] || 0;
    const totalFees = percentageFee + fixedFee;

    return {
      amount,
      percentageFee: Math.round(percentageFee * 100) / 100,
      fixedFee,
      totalFees: Math.round(totalFees * 100) / 100,
      netAmount: Math.round((amount - totalFees) * 100) / 100
    };
  }

  // Valider les données de paiement
  validatePaymentData(paymentData) {
    const errors = [];

    if (!paymentData.reservation) {
      errors.push('ID de réservation requis');
    }

    if (!paymentData.amount || paymentData.amount <= 0) {
      errors.push('Montant invalide');
    }

    if (!paymentData.paymentMethod) {
      errors.push('Méthode de paiement requise');
    }

    const validMethods = ['carte_credit', 'paypal', 'virement', 'especes', 'autre'];
    if (paymentData.paymentMethod && !validMethods.includes(paymentData.paymentMethod)) {
      errors.push('Méthode de paiement invalide');
    }

    if (paymentData.paymentMethod === 'carte_credit') {
      if (!paymentData.paymentDetails?.cardNumber) {
        errors.push('Numéro de carte requis');
      }
      if (!paymentData.paymentDetails?.expiryDate) {
        errors.push('Date d\'expiration requise');
      }
      if (!paymentData.paymentDetails?.cvv) {
        errors.push('Code CVV requis');
      }
    }

    return errors;
  }

  // Générer un identifiant de transaction unique
  generateTransactionId() {
    const timestamp = Date.now().toString(36);
    const randomStr = Math.random().toString(36).substring(2, 15);
    return `TXN_${timestamp}_${randomStr}`.toUpperCase();
  }

  // Vérifier si un remboursement est possible
  canRefund(payment, requestedAmount) {
    if (payment.status !== 'complété') {
      return { canRefund: false, reason: 'Seuls les paiements complétés peuvent être remboursés' };
    }

    const maxRefundAmount = payment.amount - payment.refundAmount;
    if (requestedAmount > maxRefundAmount) {
      return { 
        canRefund: false, 
        reason: `Montant maximum remboursable: ${maxRefundAmount}€` 
      };
    }

    // Vérifier la date limite de remboursement (ex: 30 jours)
    const refundDeadline = new Date(payment.paymentDate);
    refundDeadline.setDate(refundDeadline.getDate() + 30);
    
    if (new Date() > refundDeadline) {
      return { 
        canRefund: false, 
        reason: 'Délai de remboursement dépassé (30 jours)' 
      };
    }

    return { canRefund: true };
  }
}

export const paymentService = new PaymentService();
