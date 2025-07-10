import { databaseService } from '../services/databaseService.js';
import { paymentService } from '../services/paymentService.js';
import { stripeService } from '../services/stripeService.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../utils/AppError.js';

// Créer un nouveau paiement
export const createPayment = async (req, res, next) => {
  try {
    const paymentData = req.body;
    const userToken = req.userToken; // Récupérer le token utilisateur
    
    // Séparer les données sensibles des données à stocker AVANT de les utiliser
    const { paymentDetails, ...safePaymentData } = paymentData;
    
    logger.info('Création de paiement demandée', {
      reservationId: paymentData.reservationId,
      method: paymentData.paymentMethod,
      amount: paymentData.amount,
      hasUserToken: !!userToken,
      hasPaymentDetails: !!paymentDetails // Maintenant paymentDetails est défini
    });
    
    // Valider les données de paiement
    const validationErrors = paymentService.validatePaymentData(paymentData);
    if (validationErrors.length > 0) {
      return next(new AppError(validationErrors.join(', '), 400));
    }

    // Valider que la réservation existe (avec le token utilisateur)
    const reservation = await databaseService.findReservationById(paymentData.reservationId, userToken);
    if (!reservation) {
      return next(new AppError('Réservation non trouvée', 404));
    }

    // Préparer les données de paiement sans les détails sensibles
    const paymentDataForDB = {
      reservationId: paymentData.reservationId,
      paymentMethod: paymentData.paymentMethod,
      amount: Number(paymentData.amount),
      currency: paymentData.currency || "EUR",
      transactionId: `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, // ID temporaire unique
      status: 'en_attente' // Statut initial explicit
    };

    // Ajouter champs optionnels seulement s'ils existent
    if (paymentData.billingAddress) {
      paymentDataForDB.billingAddress = paymentData.billingAddress;
    }
    
    if (paymentData.description) {
      paymentDataForDB.description = paymentData.description;
    }

    // Créer le paiement en base via le service BDD (avec le token utilisateur)
    logger.debug('Données envoyées à la BDD:', JSON.stringify({
      ...paymentDataForDB,
      transactionId: '[TEMP_ID]' // Masquer l'ID temporaire dans les logs
    }, null, 2));
    // Créer le paiement en base via le service BDD (avec le token utilisateur)
    logger.debug('Données envoyées à la BDD:', JSON.stringify({
      ...paymentDataForDB,
      transactionId: '[TEMP_ID]' // Masquer l'ID temporaire dans les logs
    }, null, 2));
    
    const payment = await databaseService.createPayment(paymentDataForDB, userToken);
    
    // Vérifier que la création a réussi
    logger.debug('Réponse du service BDD:', payment);
    if (!payment) {
      throw new AppError('Échec de la création du paiement - Aucune réponse du service BDD', 500);
    }

    // Adapter la structure selon la réponse du service BDD
    const createdPaymentData = payment.data || payment; // Flexible: soit payment.data soit payment directement
    
    if (!createdPaymentData || !createdPaymentData._id) {
      logger.error('Structure de réponse inattendue:', payment);
      throw new AppError('Échec de la création du paiement - Structure de réponse invalide', 500);
    }

    logger.info(`Paiement créé avec succès: ${createdPaymentData._id}`, {
      status: createdPaymentData.status,
      amount: createdPaymentData.amount,
      method: createdPaymentData.paymentMethod
    });
    
    res.status(201).json({
      success: true,
      data: createdPaymentData,
      message: 'Paiement créé avec succès. Utilisez /create-stripe-link pour générer le lien de paiement.'
    });
  } catch (error) {
    logger.error('Erreur lors de la création du paiement:', error);
    
    // Si c'est déjà une AppError, la passer directement
    if (error instanceof AppError) {
      return next(error);
    }
    
    // Sinon, créer une nouvelle AppError avec plus de détails
    next(new AppError(`Erreur lors de la création du paiement: ${error.message}`, 500));
  }
};

// Récupérer un paiement par ID
export const getPayment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userToken = req.userToken; // Récupérer le token utilisateur
    
    const payment = await databaseService.findPaymentById(id, userToken);
    
    if (!payment) {
      return next(new AppError('Paiement non trouvé', 404));
    }

    res.json({
      success: true,
      data: payment.data
    });
  } catch (error) {
    logger.error('Erreur lors de la récupération du paiement:', error);
    
    if (error instanceof AppError) {
      return next(error);
    }
    
    next(new AppError('Erreur lors de la récupération du paiement', 500));
  }
};

// Récupérer tous les paiements avec pagination
export const getAllPayments = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const userToken = req.userToken; // Récupérer le token utilisateur
    
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

    const result = await databaseService.findPayments(filters, userToken);
    
    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination
    });
  } catch (error) {
    logger.error('Erreur lors de la récupération des paiements:', error);
    
    if (error instanceof AppError) {
      return next(error);
    }
    
    next(new AppError('Erreur lors de la récupération des paiements', 500));
  }
};

// Mettre à jour le statut d'un paiement
export const updatePaymentStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, transactionId } = req.body;
    const userToken = req.userToken; // Récupérer le token utilisateur
    
    const payment = await databaseService.findPaymentById(id, userToken);
    
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
    
    const updatedPayment = await databaseService.updatePayment(id, updateData, userToken);
    
    logger.info(`Statut du paiement ${id} mis à jour: ${status}`);
    
    res.json({
      success: true,
      data: updatedPayment.data,
      message: 'Statut du paiement mis à jour'
    });
  } catch (error) {
    logger.error('Erreur lors de la mise à jour du statut:', error);
    
    if (error instanceof AppError) {
      return next(error);
    }
    
    next(new AppError('Erreur lors de la mise à jour du statut', 500));
  }
};

// Traiter un remboursement
export const processRefund = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { amount, reason } = req.body;
    const userToken = req.userToken; // Récupérer le token utilisateur
    
    const payment = await databaseService.findPaymentById(id, userToken);
    
    if (!payment) {
      return next(new AppError('Paiement non trouvé', 404));
    }

    // Vérifier si le remboursement est possible
    const canRefund = paymentService.canRefund(payment.data, amount);
    if (!canRefund.canRefund) {
      return next(new AppError(canRefund.reason, 400));
    }

    // Effectuer le remboursement via le service BDD
    const refundedPayment = await databaseService.refundPayment(id, amount, reason, userToken);
    
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
    
    if (error instanceof AppError) {
      return next(error);
    }
    
    next(new AppError(error.message || 'Erreur lors du traitement du remboursement', 500));
  }
};

// Récupérer les paiements d'une réservation
export const getPaymentsByReservation = async (req, res, next) => {
  try {
    const { reservationId } = req.params;
    const userToken = req.userToken; // Récupérer le token utilisateur
    
    const payments = await databaseService.findPaymentsByReservation(reservationId, userToken);
    
    res.json({
      success: true,
      data: payments.data
    });
  } catch (error) {
    logger.error('Erreur lors de la récupération des paiements de la réservation:', error);
    
    if (error instanceof AppError) {
      return next(error);
    }
    
    next(new AppError('Erreur lors de la récupération des paiements', 500));
  }
};

// Obtenir les statistiques des paiements
export const getPaymentStats = async (req, res, next) => {
  try {
    const userToken = req.userToken; // Récupérer le token utilisateur
    const filters = {};
    
    // Filtres optionnels pour les stats
    if (req.query.dateFrom) {
      filters.dateFrom = req.query.dateFrom;
    }
    
    if (req.query.dateTo) {
      filters.dateTo = req.query.dateTo;
    }
    
    const stats = await databaseService.getPaymentStats(filters, userToken);
    
    res.json({
      success: true,
      data: stats.data
    });
  } catch (error) {
    logger.error('Erreur lors de la récupération des statistiques:', error);
    
    if (error instanceof AppError) {
      return next(error);
    }
    
    next(new AppError('Erreur lors de la récupération des statistiques', 500));
  }
};

// Annuler un paiement
export const cancelPayment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userToken = req.userToken; // Récupérer le token utilisateur
    
    const payment = await databaseService.findPaymentById(id, userToken);
    
    if (!payment) {
      return next(new AppError('Paiement non trouvé', 404));
    }
    
    if (payment.data.status === 'complété') {
      return next(new AppError('Impossible d\'annuler un paiement complété. Utilisez le remboursement.', 400));
    }
    
    const cancelledPayment = await databaseService.updatePayment(id, { 
      status: 'annulé' 
    }, userToken);
    
    logger.info(`Paiement ${id} annulé`);
    
    res.json({
      success: true,
      data: cancelledPayment.data,
      message: 'Paiement annulé avec succès'
    });
  } catch (error) {
    logger.error('Erreur lors de l\'annulation du paiement:', error);
    
    if (error instanceof AppError) {
      return next(error);
    }
    
    next(new AppError('Erreur lors de l\'annulation du paiement', 500));
  }
};

// Créer un lien de paiement Stripe pour un paiement existant
export const createStripePaymentLink = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { successUrl, cancelUrl } = req.body;
    const userToken = req.userToken;
    
    logger.info('Création de lien de paiement Stripe demandée', {
      paymentId: id,
      hasUserToken: !!userToken
    });
    
    // Récupérer le paiement existant
    const payment = await databaseService.findPaymentById(id, userToken);
    
    if (!payment) {
      return next(new AppError('Paiement non trouvé', 404));
    }
    
    const paymentData = payment.data || payment;
    
    // Vérifier le statut du paiement
    if (!['en_attente', 'traitement'].includes(paymentData.status)) {
      return next(new AppError(
        `Impossible de créer un lien de paiement. Statut actuel: ${paymentData.status}. ` +
        'Le paiement doit être en attente.', 
        400
      ));
    }
    
    // Vérifier la méthode de paiement
    if (paymentData.paymentMethod !== 'carte_credit') {
      return next(new AppError(
        `Cette fonction est dédiée aux paiements par carte de crédit. ` +
        `Méthode actuelle: ${paymentData.paymentMethod}`, 
        400
      ));
    }
    
    logger.debug('Paiement trouvé, création du lien Stripe:', {
      paymentId: id,
      amount: paymentData.amount,
      currency: paymentData.currency,
      reservationId: paymentData.reservationId
    });
    
    let paymentLink;
    
    try {
      // Déterminer le mode d'exécution
      const isSimulationMode = process.env.STRIPE_SIMULATION === 'true';
      
      if (isSimulationMode) {
        paymentLink = await createSimulatedPaymentLink(id, paymentData, successUrl, cancelUrl);
      } else {
        paymentLink = await createRealStripePaymentLink(id, paymentData, successUrl, cancelUrl);
      }
      
      // Mettre à jour le paiement avec les informations du lien
      await databaseService.updatePayment(id, {
        status: 'traitement',
        stripeSessionId: paymentLink.sessionId,
        paymentLinkUrl: paymentLink.url,
        linkCreatedAt: new Date()
      }, userToken);
      
    } catch (stripeError) {
      logger.error('Erreur lors de la création du lien Stripe:', stripeError);
      throw new AppError(`Erreur lors de la création du lien de paiement: ${stripeError.message}`, 400);
    }
    
    logger.info(`Lien de paiement Stripe créé avec succès pour le paiement ${id}`, {
      sessionId: paymentLink.sessionId,
      url: paymentLink.url
    });
    
    res.status(200).json({
      success: true,
      data: {
        paymentId: id,
        sessionId: paymentLink.sessionId,
        paymentUrl: paymentLink.url,
        expiresAt: paymentLink.expiresAt,
        status: 'traitement'
      },
      message: 'Lien de paiement Stripe créé avec succès'
    });
    
  } catch (error) {
    logger.error('Erreur lors de la création du lien de paiement:', {
      message: error.message,
      paymentId: req.params.id
    });
    
    if (error instanceof AppError) {
      return next(error);
    }
    
    next(new AppError(`Erreur lors de la création du lien de paiement: ${error.message}`, 500));
  }
};

// Fonction utilitaire pour créer un lien simulé
const createSimulatedPaymentLink = async (paymentId, paymentData, successUrl, cancelUrl) => {
  logger.info('SIMULATION: Création d\'un lien de paiement Stripe simulé');
  
  const sessionId = `cs_test_sim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const simulatedUrl = `${frontendUrl}/payment/simulate/${sessionId}`;
  
  return {
    sessionId: sessionId,
    url: simulatedUrl,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 heures
  };
};

// Fonction utilitaire pour créer un vrai lien Stripe
const createRealStripePaymentLink = async (paymentId, paymentData, successUrl, cancelUrl) => {
  // Vérifier que stripeService existe et est configuré
  if (!stripeService || !stripeService.createCheckoutSession) {
    logger.error('Service Stripe non disponible pour la création de session');
    throw new Error('Service Stripe non configuré');
  }
  
  logger.info('Création d\'une session Stripe Checkout réelle');
  
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  
  // Créer une session Stripe Checkout
  const checkoutSession = await stripeService.createCheckoutSession({
    paymentId: paymentId,
    amount: paymentData.amount * 100, // Convertir en centimes
    currency: paymentData.currency || 'EUR',
    description: `Paiement pour réservation ${paymentData.reservationId}`,
    successUrl: successUrl || `${frontendUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: cancelUrl || `${frontendUrl}/payment/cancel?payment_id=${paymentId}`,
    metadata: {
      paymentId: paymentId,
      reservationId: paymentData.reservationId,
      originalTransactionId: paymentData.transactionId
    }
  });
  
  return {
    sessionId: checkoutSession.id,
    url: checkoutSession.url,
    expiresAt: new Date(checkoutSession.expires_at * 1000)
  };
};

// Webhook pour traiter les événements Stripe
export const handleStripeWebhook = async (req, res, next) => {
  try {
    const sig = req.headers['stripe-signature'];
    
    logger.info('Webhook Stripe reçu');
    
    let event;
    
    try {
      // Utiliser le service Stripe pour traiter le webhook
      event = await stripeService.processWebhook(req.body, sig);
    } catch (err) {
      logger.error('Erreur de traitement webhook:', err.message);
      return res.status(400).send(`Webhook error: ${err.message}`);
    }
    
    // Traiter l'événement
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object);
        break;
      case 'checkout.session.expired':
        await handleCheckoutExpired(event.data.object);
        break;
      case 'payment_intent.succeeded':
        await handlePaymentSucceeded(event.data.object);
        break;
      case 'payment_intent.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;
      default:
        logger.info(`Événement Stripe non traité: ${event.type}`);
    }
    
    res.json({ received: true });
    
  } catch (error) {
    logger.error('Erreur lors du traitement du webhook:', error);
    res.status(500).json({ error: 'Erreur lors du traitement du webhook' });
  }
};

// Traiter le succès d'une session de checkout
const handleCheckoutCompleted = async (session) => {
  try {
    logger.info('Session checkout complétée:', session.id);
    
    const paymentId = session.metadata?.paymentId;
    if (!paymentId) {
      logger.error('PaymentId manquant dans les métadonnées de la session');
      return;
    }
    
    // Récupérer le paiement (utiliser un token système ou admin)
    const systemToken = process.env.SYSTEM_TOKEN || process.env.JWT_SECRET;
    const payment = await databaseService.findPaymentById(paymentId, systemToken);
    
    if (!payment) {
      logger.error(`Paiement ${paymentId} non trouvé lors du webhook`);
      return;
    }
    
    // Mettre à jour le paiement
    const updateData = {
      status: 'complété',
      transactionId: session.payment_intent || session.id,
      paymentDate: new Date(),
      stripeSessionId: session.id,
      paymentMethodInfo: {
        type: 'carte_credit'
      }
    };
    
    // Ajouter les détails du mode de paiement si disponible
    if (session.payment_method_details) {
      updateData.paymentMethodInfo = {
        ...updateData.paymentMethodInfo,
        last4: session.payment_method_details.card?.last4,
        brand: session.payment_method_details.card?.brand,
        country: session.payment_method_details.card?.country
      };
    }
    
    // Calculer les frais si disponibles
    if (session.amount_total) {
      const fees = calculateStripeFees(session.amount_total / 100); // Stripe utilise les centimes
      updateData.fees = fees;
      updateData.netAmount = (session.amount_total / 100) - fees;
    }
    
    await databaseService.updatePayment(paymentId, updateData, systemToken);
    
    // Marquer comme complété via la méthode d'instance si disponible
    try {
      await databaseService.markPaymentAsCompleted(paymentId, systemToken);
      logger.debug('Paiement marqué comme complété via la méthode d\'instance');
    } catch (markError) {
      logger.warn('Méthode markAsCompleted non disponible:', markError.message);
    }
    
    logger.info(`Paiement ${paymentId} marqué comme complété suite au webhook`);
    
  } catch (error) {
    logger.error('Erreur lors du traitement du checkout complété:', error);
  }
};

// Traiter l'expiration d'une session
const handleCheckoutExpired = async (session) => {
  try {
    logger.info('Session checkout expirée:', session.id);
    
    const paymentId = session.metadata?.paymentId;
    if (!paymentId) {
      return;
    }
    
    const systemToken = process.env.SYSTEM_TOKEN || process.env.JWT_SECRET;
    
    await databaseService.updatePayment(paymentId, {
      status: 'échoué',
      notes: 'Session de paiement expirée',
      failureDate: new Date()
    }, systemToken);
    
    logger.info(`Paiement ${paymentId} marqué comme échoué (session expirée)`);
    
  } catch (error) {
    logger.error('Erreur lors du traitement de l\'expiration:', error);
  }
};

// Traiter le succès d'un paiement
const handlePaymentSucceeded = async (paymentIntent) => {
  logger.info('Payment Intent réussi:', paymentIntent.id);
  // Logique supplémentaire si nécessaire
};

// Traiter l'échec d'un paiement
const handlePaymentFailed = async (paymentIntent) => {
  logger.info('Payment Intent échoué:', paymentIntent.id);
  // Logique supplémentaire si nécessaire
};

// Vérifier le statut d'une session Stripe
export const checkStripeSessionStatus = async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const userToken = req.userToken;
    
    logger.info('Vérification du statut de session Stripe:', sessionId);
    
    let sessionStatus;
    
    try {
      // Utiliser le service Stripe pour récupérer la session
      sessionStatus = await stripeService.retrieveSession(sessionId);
    } catch (error) {
      logger.error('Erreur lors de la récupération de session:', error);
      return next(new AppError('Session Stripe non trouvée', 404));
    }
    
    res.json({
      success: true,
      data: {
        sessionId: sessionStatus.id,
        status: sessionStatus.status,
        paymentStatus: sessionStatus.payment_status,
        paymentId: sessionStatus.metadata?.paymentId,
        customerEmail: sessionStatus.customer_email,
        amountTotal: sessionStatus.amount_total,
        currency: sessionStatus.currency,
        expiresAt: sessionStatus.expires_at
      }
    });
    
  } catch (error) {
    logger.error('Erreur lors de la vérification du statut:', error);
    
    if (error instanceof AppError) {
      return next(error);
    }
    
    next(new AppError('Erreur lors de la vérification du statut', 500));
  }
};

// Fonction utilitaire pour calculer les frais Stripe
const calculateStripeFees = (amount) => {
  const feeRate = parseFloat(process.env.STRIPE_FEE_RATE) || 0.029;
  const fixedFee = parseFloat(process.env.STRIPE_FIXED_FEE) || 0.25;
  return Math.round((amount * feeRate + fixedFee) * 100) / 100; // Arrondi à 2 décimales
};

