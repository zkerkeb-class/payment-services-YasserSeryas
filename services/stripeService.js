import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * Service Stripe pour la gestion des paiements via liens Checkout
 * Gère la création de sessions, simulation, récupération de statut et webhooks
 */
class StripeService {
  constructor() {
    this.simulationMode = process.env.STRIPE_SIMULATION_MODE === 'true';
    this.baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  }

  /**
   * Crée une session Stripe Checkout
   * @param {Object} paymentData - Données du paiement
   * @param {string} paymentData.amount - Montant en centimes
   * @param {string} paymentData.currency - Devise (EUR, USD, etc.)
   * @param {string} paymentData.description - Description du paiement
   * @param {string} paymentData.paymentId - ID du paiement interne
   * @param {string} paymentData.successUrl - URL de redirection succès
   * @param {string} paymentData.cancelUrl - URL de redirection annulation
   * @param {Object} paymentData.metadata - Métadonnées additionnelles
   * @returns {Object} Session Stripe ou simulation
   */
  async createCheckoutSession(paymentData) {
    try {
      if (this.simulationMode) {
        return this.createSimulatedSession(paymentData);
      }

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: paymentData.currency.toLowerCase(),
              product_data: {
                name: paymentData.description || 'Paiement',
              },
              unit_amount: parseInt(paymentData.amount),
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: paymentData.successUrl,
        cancel_url: paymentData.cancelUrl,
        metadata: {
          paymentId: paymentData.paymentId,
          ...paymentData.metadata
        },
        expires_at: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 24h d'expiration
      });

      return {
        id: session.id,
        url: session.url,
        status: session.status,
        amount_total: session.amount_total,
        currency: session.currency,
        expires_at: session.expires_at,
        metadata: session.metadata
      };
    } catch (error) {
      console.error('Erreur création session Stripe:', error);
      throw new Error(`Erreur Stripe: ${error.message}`);
    }
  }

  /**
   * Crée une session simulée pour les tests
   * @param {Object} paymentData - Données du paiement
   * @returns {Object} Session simulée
   */
  createSimulatedSession(paymentData) {
    const sessionId = `cs_sim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const simulatedUrl = `https://checkout.stripe.com/c/pay/${sessionId}#fidkdWxOYHwnPyd1blpxYHZxWjA0S0tgNUtUTHAxZEwybTNkXU1KS0hNQGp8S11MPDM2Nk5KVzVJfDdqSm40YDFKdz1SaVAxMDBOYlFBZmJfbTJtNGxqTX1idk1hdDV8S1VXYVJxMEZqYGhpaGlAcUZcNVBAaHU9QjVBQVZhJyk`;
    
    return {
      id: sessionId,
      url: simulatedUrl,
      status: 'open',
      amount_total: parseInt(paymentData.amount),
      currency: paymentData.currency.toLowerCase(),
      expires_at: Math.floor(Date.now() / 1000) + (24 * 60 * 60),
      metadata: {
        paymentId: paymentData.paymentId,
        simulation: 'true',
        ...paymentData.metadata
      }
    };
  }

  /**
   * Récupère une session Stripe par son ID
   * @param {string} sessionId - ID de la session
   * @returns {Object} Session Stripe ou simulée
   */
  async retrieveSession(sessionId) {
    try {
      if (this.simulationMode || sessionId.startsWith('cs_sim_')) {
        return this.getSimulatedSessionStatus(sessionId);
      }

      const session = await stripe.checkout.sessions.retrieve(sessionId);
      
      return {
        id: session.id,
        status: session.status,
        payment_status: session.payment_status,
        amount_total: session.amount_total,
        currency: session.currency,
        customer_email: session.customer_details?.email,
        expires_at: session.expires_at,
        metadata: session.metadata,
        payment_intent: session.payment_intent
      };
    } catch (error) {
      console.error('Erreur récupération session Stripe:', error);
      throw new Error(`Session non trouvée: ${error.message}`);
    }
  }

  /**
   * Simule le statut d'une session pour les tests
   * @param {string} sessionId - ID de la session simulée
   * @returns {Object} Statut simulé
   */
  getSimulatedSessionStatus(sessionId) {
    // Simulation basée sur l'ID pour des tests prévisibles
    const now = Date.now();
    const sessionTime = parseInt(sessionId.split('_')[2]) || now;
    const timeDiff = now - sessionTime;
    
    let status = 'open';
    let payment_status = null;
    
    // Simulation de différents états selon l'âge de la session
    if (timeDiff > 3600000) { // Plus d'1 heure = expiré
      status = 'expired';
    } else if (sessionId.includes('success') || Math.random() > 0.7) {
      status = 'complete';
      payment_status = 'paid';
    }
    
    return {
      id: sessionId,
      status: status,
      payment_status: payment_status,
      amount_total: 5000, // Montant par défaut pour simulation
      currency: 'eur',
      customer_email: 'test@simulation.com',
      expires_at: Math.floor(sessionTime / 1000) + (24 * 60 * 60),
      metadata: {
        simulation: 'true'
      },
      payment_intent: status === 'complete' ? `pi_sim_${sessionId.split('_')[2]}` : null
    };
  }

  /**
   * Traite les webhooks Stripe
   * @param {string} payload - Corps de la requête webhook
   * @param {string} signature - Signature Stripe
   * @returns {Object} Événement traité
   */
  async processWebhook(payload, signature) {
    try {
      if (this.simulationMode) {
        return this.processSimulatedWebhook(payload);
      }

      const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
      if (!endpointSecret) {
        throw new Error('STRIPE_WEBHOOK_SECRET non configuré');
      }

      const event = stripe.webhooks.constructEvent(payload, signature, endpointSecret);
      
      return {
        id: event.id,
        type: event.type,
        data: event.data,
        created: event.created
      };
    } catch (error) {
      console.error('Erreur traitement webhook Stripe:', error);
      throw new Error(`Webhook invalide: ${error.message}`);
    }
  }

  /**
   * Traite un webhook simulé pour les tests
   * @param {string} payload - Corps de la requête
   * @returns {Object} Événement simulé
   */
  processSimulatedWebhook(payload) {
    try {
      const data = JSON.parse(payload);
      
      return {
        id: `evt_sim_${Date.now()}`,
        type: data.type || 'checkout.session.completed',
        data: {
          object: {
            id: data.session_id || 'cs_sim_test',
            status: 'complete',
            payment_status: 'paid',
            metadata: data.metadata || {}
          }
        },
        created: Math.floor(Date.now() / 1000)
      };
    } catch (error) {
      throw new Error('Format webhook simulé invalide');
    }
  }

  /**
   * Crée un remboursement
   * @param {string} paymentIntentId - ID du PaymentIntent Stripe
   * @param {number} amount - Montant à rembourser (optionnel, remboursement total par défaut)
   * @param {string} reason - Raison du remboursement
   * @returns {Object} Remboursement créé
   */
  async createRefund(paymentIntentId, amount = null, reason = 'requested_by_customer') {
    try {
      if (this.simulationMode || paymentIntentId.startsWith('pi_sim_')) {
        return this.createSimulatedRefund(paymentIntentId, amount, reason);
      }

      const refundData = {
        payment_intent: paymentIntentId,
        reason: reason
      };

      if (amount) {
        refundData.amount = amount;
      }

      const refund = await stripe.refunds.create(refundData);
      
      return {
        id: refund.id,
        amount: refund.amount,
        currency: refund.currency,
        status: refund.status,
        reason: refund.reason,
        created: refund.created
      };
    } catch (error) {
      console.error('Erreur création remboursement Stripe:', error);
      throw new Error(`Erreur remboursement: ${error.message}`);
    }
  }

  /**
   * Crée un remboursement simulé
   * @param {string} paymentIntentId - ID du PaymentIntent
   * @param {number} amount - Montant à rembourser
   * @param {string} reason - Raison du remboursement
   * @returns {Object} Remboursement simulé
   */
  createSimulatedRefund(paymentIntentId, amount, reason) {
    return {
      id: `re_sim_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      amount: amount || 5000,
      currency: 'eur',
      status: 'succeeded',
      reason: reason,
      created: Math.floor(Date.now() / 1000),
      payment_intent: paymentIntentId,
      simulation: true
    };
  }

  /**
   * Valide la configuration Stripe
   * @returns {Object} État de la configuration
   */
  validateConfiguration() {
    const config = {
      hasSecretKey: !!process.env.STRIPE_SECRET_KEY,
      hasWebhookSecret: !!process.env.STRIPE_WEBHOOK_SECRET,
      simulationMode: this.simulationMode,
      baseUrl: this.baseUrl
    };

    const isValid = config.hasSecretKey && (this.simulationMode || config.hasWebhookSecret);

    return {
      ...config,
      isValid,
      warnings: this.getConfigurationWarnings(config)
    };
  }

  /**
   * Retourne les avertissements de configuration
   * @param {Object} config - Configuration actuelle
   * @returns {Array} Liste des avertissements
   */
  getConfigurationWarnings(config) {
    const warnings = [];

    if (!config.hasSecretKey) {
      warnings.push('STRIPE_SECRET_KEY manquant');
    }

    if (!config.simulationMode && !config.hasWebhookSecret) {
      warnings.push('STRIPE_WEBHOOK_SECRET recommandé pour la production');
    }

    if (config.simulationMode) {
      warnings.push('Mode simulation activé - pas de vrais paiements');
    }

    return warnings;
  }
}

export const stripeService = new StripeService();
