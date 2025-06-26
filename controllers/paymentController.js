import { databaseService } from '../services/databaseService.js';
import { paymentService } from '../services/paymentService.js';
import { stripeService } from '../services/stripeService.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../utils/AppError.js';

// Créer un nouveau paiement
export const createPayment = async (req, res, next) => {
  try {
    const paymentData = req.body;
    
    // Valider les données de paiement
    const validationErrors = paymentService.validatePaymentData(paymentData);
    if (validationErrors.length > 0) {
      return next(new AppError(validationErrors.join(', '), 400));
    }

    // Valider que la réservation existe
    const reservation = await databaseService.findReservationById(paymentData.reservation);
    if (!reservation) {
      return next(new AppError('Réservation non trouvée', 404));
    }

    // Créer le paiement en base via le service BDD
    const payment = await databaseService.createPayment(paymentData);

    // Traiter le paiement selon la méthode
    let processedPayment;
    
    switch (paymentData.paymentMethod) {
      case 'carte_credit':
        processedPayment = await stripeService.processPayment(payment.data, paymentData.paymentDetails);
        // Mettre à jour le paiement avec les infos Stripe
        await databaseService.updatePayment(payment.data._id, {
          status: processedPayment.status,
          transactionId: processedPayment.transactionId,
          paymentDetails: processedPayment.paymentDetails
        });
        break;
      case 'paypal':
        processedPayment = await paymentService.processPayPalPayment(payment.data, paymentData.paymentDetails);
        await databaseService.updatePayment(payment.data._id, {
          status: processedPayment.status,
          notes: processedPayment.notes
        });
        break;
      default:
        // Pour les autres méthodes, garder comme en attente
        processedPayment = payment.data;
    }

    logger.info(`Paiement créé avec succès: ${payment.data._id}`);
    
    res.status(201).json({
      success: true,
      data: processedPayment,
      message: 'Paiement créé avec succès'
    });
  } catch (error) {
    logger.error('Erreur lors de la création du paiement:', error);
    next(new AppError('Erreur lors de la création du paiement', 500));
  }
};

// Récupérer un paiement par ID
export const getPayment = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const payment = await databaseService.findPaymentById(id);
    
    if (!payment) {
      return next(new AppError('Paiement non trouvé', 404));
    }

    res.json({
      success: true,
      data: payment.data
    });
  } catch (error) {
    logger.error('Erreur lors de la récupération du paiement:', error);
    next(new AppError('Erreur lors de la récupération du paiement', 500));
  }
};

// Récupérer tous les paiements avec pagination
export const getAllPayments = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    
    const filters = {
      page,
      limit
    };
    
    // Filtres optionnels
    if (req.query.status) {
      filters.status = req.query.status;
    }
    
    if (req.query.paymentMethod) {
      filters.paymentMethod = req.query.paymentMethod;
    }
    
    if (req.query.dateFrom) {
      filters.dateFrom = req.query.dateFrom;
    }
    
    if (req.query.dateTo) {
      filters.dateTo = req.query.dateTo;
    }

    const result = await databaseService.findPayments(filters);
    
    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination
    });
  } catch (error) {
    logger.error('Erreur lors de la récupération des paiements:', error);
    next(new AppError('Erreur lors de la récupération des paiements', 500));
  }
};

// Mettre à jour le statut d'un paiement
export const updatePaymentStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, transactionId } = req.body;
    
    const payment = await databaseService.findPaymentById(id);
    
    if (!payment) {
      return next(new AppError('Paiement non trouvé', 404));
    }

    const updateData = {
      status
    };
    
    if (transactionId) {
      updateData.transactionId = transactionId;
    }
    
    if (status === 'complété') {
      updateData.paymentDate = new Date();
    }
    
    const updatedPayment = await databaseService.updatePayment(id, updateData);
    
    logger.info(`Statut du paiement ${id} mis à jour: ${status}`);
    
    res.json({
      success: true,
      data: updatedPayment.data,
      message: 'Statut du paiement mis à jour'
    });
  } catch (error) {
    logger.error('Erreur lors de la mise à jour du statut:', error);
    next(new AppError('Erreur lors de la mise à jour du statut', 500));
  }
};

// Traiter un remboursement
export const processRefund = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { amount, reason } = req.body;
    
    const payment = await databaseService.findPaymentById(id);
    
    if (!payment) {
      return next(new AppError('Paiement non trouvé', 404));
    }

    // Vérifier si le remboursement est possible
    const canRefund = paymentService.canRefund(payment.data, amount);
    if (!canRefund.canRefund) {
      return next(new AppError(canRefund.reason, 400));
    }

    // Effectuer le remboursement via le service BDD
    const refundedPayment = await databaseService.refundPayment(id, amount, reason);
    
    // Traiter le remboursement avec le service de paiement externe
    if (payment.data.paymentMethod === 'carte_credit' && payment.data.transactionId) {
      await stripeService.processRefund(payment.data.transactionId, amount);
    }
    
    logger.info(`Remboursement traité pour le paiement ${id}: ${amount}`);
    
    res.json({
      success: true,
      data: refundedPayment.data,
      message: 'Remboursement traité avec succès'
    });
  } catch (error) {
    logger.error('Erreur lors du traitement du remboursement:', error);
    next(new AppError(error.message || 'Erreur lors du traitement du remboursement', 500));
  }
};

// Récupérer les paiements d'une réservation
export const getPaymentsByReservation = async (req, res, next) => {
  try {
    const { reservationId } = req.params;
    
    const payments = await databaseService.findPaymentsByReservation(reservationId);
    
    res.json({
      success: true,
      data: payments.data
    });
  } catch (error) {
    logger.error('Erreur lors de la récupération des paiements de la réservation:', error);
    next(new AppError('Erreur lors de la récupération des paiements', 500));
  }
};

// Obtenir les statistiques des paiements
export const getPaymentStats = async (req, res, next) => {
  try {
    const filters = {};
    
    // Filtres optionnels pour les stats
    if (req.query.dateFrom) {
      filters.dateFrom = req.query.dateFrom;
    }
    
    if (req.query.dateTo) {
      filters.dateTo = req.query.dateTo;
    }
    
    const stats = await databaseService.getPaymentStats(filters);
    
    res.json({
      success: true,
      data: stats.data
    });
  } catch (error) {
    logger.error('Erreur lors de la récupération des statistiques:', error);
    next(new AppError('Erreur lors de la récupération des statistiques', 500));
  }
};

// Annuler un paiement
export const cancelPayment = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const payment = await databaseService.findPaymentById(id);
    
    if (!payment) {
      return next(new AppError('Paiement non trouvé', 404));
    }
    
    if (payment.data.status === 'complété') {
      return next(new AppError('Impossible d\'annuler un paiement complété. Utilisez le remboursement.', 400));
    }
    
    const cancelledPayment = await databaseService.updatePayment(id, { 
      status: 'annulé' 
    });
    
    logger.info(`Paiement ${id} annulé`);
    
    res.json({
      success: true,
      data: cancelledPayment.data,
      message: 'Paiement annulé avec succès'
    });
  } catch (error) {
    logger.error('Erreur lors de l\'annulation du paiement:', error);
    next(new AppError('Erreur lors de l\'annulation du paiement', 500));
  }
};
