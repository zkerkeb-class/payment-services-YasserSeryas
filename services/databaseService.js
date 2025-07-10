import axios from 'axios';
import { logger } from '../utils/logger.js';
import { AppError } from '../utils/AppError.js';

class DatabaseService {
  constructor() {
    this.dbServiceUrl = process.env.DATABASE_SERVICE_URL || 'http://localhost:3000';
    this.timeout = 10000; // 10 secondes de timeout
  }

  // Configuration axios avec intercepteurs - maintenant avec token dynamique
  getAxiosInstance(userToken = null) {
    const headers = {
      'Content-Type': 'application/json',
      'X-Service-Name': 'payment-service'
    };

    // Utiliser le token de l'utilisateur si fourni
    if (userToken) {
      headers['Authorization'] = userToken.startsWith('Bearer ') ? userToken : `Bearer ${userToken}`;
    }

    const instance = axios.create({
      baseURL: this.dbServiceUrl,
      timeout: this.timeout,
      headers
    });

    // Intercepteur pour les requêtes
    instance.interceptors.request.use(
      (config) => {
        logger.info(`Database request: ${config.method?.toUpperCase()} ${config.url}`);
        logger.debug('Request headers:', {
          'Authorization': config.headers['Authorization'] ? 'Bearer [TOKEN_SET]' : 'NO_AUTH_HEADER',
          'X-Service-Name': config.headers['X-Service-Name']
        });
        return config;
      },
      (error) => {
        const errorMessage = error.message || 'Unknown request error';
        logger.error('Database request error:', { message: errorMessage });
        return Promise.reject(error);
      }
    );

    // Intercepteur pour les réponses
    instance.interceptors.response.use(
      (response) => {
        logger.info(`Database response: ${response.status} ${response.config.url}`);
        return response;
      },
      (error) => {
        // Gestion sécurisée des erreurs sans références circulaires
        const errorInfo = {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          message: error.message,
          url: error.config?.url
        };
        logger.error('Database response error:', errorInfo);
        return Promise.reject(error);
      }
    );

    return instance;
  }

  // ===================== PAYMENTS CRUD =====================

  // Créer un paiement
  async createPayment(paymentData, userToken = null) {
    try {
      const response = await this.getAxiosInstance(userToken).post('/api/payments', paymentData);
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'Erreur inconnue';
      logger.error('Erreur lors de la création du paiement:', {
        status: error.response?.status,
        message: errorMessage,
        data: error.response?.data
      });
      
      if (error.response?.status === 401) {
        throw new AppError('Non autorisé à créer le paiement', 401);
      }
      
      throw new AppError(`Erreur lors de la création du paiement: ${errorMessage}`, error.response?.status || 500);
    }
  }

  // Récupérer un paiement par ID
  async findPaymentById(id, userToken = null) {
    try {
      const response = await this.getAxiosInstance(userToken).get(`/api/payments/${id}`);
      return response.data;
    } catch (error) {
      if (error.response?.status === 404) {
        return null;
      }
      const errorMessage = error.response?.data?.message || error.message || 'Erreur inconnue';
      logger.error('Erreur lors de la récupération du paiement:', {
        status: error.response?.status,
        message: errorMessage
      });
      throw new AppError('Erreur lors de la récupération du paiement', error.response?.status || 500);
    }
  }

  // Récupérer tous les paiements avec filtres
  async findPayments(filters = {}, userToken = null) {
    try {
      const queryParams = new URLSearchParams(filters).toString();
      const response = await this.getAxiosInstance(userToken).get(`/api/payments?${queryParams}`);
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'Erreur inconnue';
      logger.error('Erreur lors de la récupération des paiements:', {
        status: error.response?.status,
        message: errorMessage
      });
      throw new AppError('Erreur lors de la récupération des paiements', error.response?.status || 500);
    }
  }

  // Mettre à jour un paiement
  async updatePayment(id, updateData, userToken = null) {
    try {
      const response = await this.getAxiosInstance(userToken).put(`/api/payments/${id}`, updateData);
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'Erreur inconnue';
      logger.error('Erreur lors de la mise à jour du paiement:', {
        status: error.response?.status,
        message: errorMessage
      });
      throw new AppError('Erreur lors de la mise à jour du paiement', error.response?.status || 500);
    }
  }

  // Supprimer un paiement
  async deletePayment(id, userToken = null) {
    try {
      const response = await this.getAxiosInstance(userToken).delete(`/api/payments/${id}`);
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'Erreur inconnue';
      logger.error('Erreur lors de la suppression du paiement:', {
        status: error.response?.status,
        message: errorMessage
      });
      throw new AppError('Erreur lors de la suppression du paiement', error.response?.status || 500);
    }
  }

  // ===================== MÉTHODES MÉTIER =====================

  // Marquer un paiement comme complété (utilise la méthode d'instance du modèle)
  async markPaymentAsCompleted(id, userToken = null) {
    try {
      const response = await this.getAxiosInstance(userToken).post(`/api/payments/${id}/mark-completed`);
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'Erreur inconnue';
      logger.error('Erreur lors de la completion du paiement via méthode d\'instance:', {
        status: error.response?.status,
        message: errorMessage
      });
      throw new AppError('Erreur lors de la completion du paiement', error.response?.status || 500);
    }
  }

  // Marquer un paiement comme complété avec transactionId (méthode legacy)
  async markPaymentAsCompletedWithTransaction(id, transactionId, userToken = null) {
    try {
      const response = await this.getAxiosInstance(userToken).post(`/api/payments/${id}/complete`, {
        transactionId,
        paymentDate: new Date(),
        status: 'complété'
      });
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'Erreur inconnue';
      logger.error('Erreur lors de la completion du paiement:', {
        status: error.response?.status,
        message: errorMessage
      });
      throw new AppError('Erreur lors de la completion du paiement', error.response?.status || 500);
    }
  }

  // Effectuer un remboursement
  async refundPayment(id, amount, reason, userToken = null) {
    try {
      const response = await this.getAxiosInstance(userToken).post(`/api/payments/${id}/refund`, {
        amount,
        reason,
        refundDate: new Date()
      });
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'Erreur inconnue';
      logger.error('Erreur lors du remboursement:', {
        status: error.response?.status,
        message: errorMessage
      });
      throw new AppError('Erreur lors du remboursement', error.response?.status || 500);
    }
  }

  // Récupérer les paiements d'une réservation
  async findPaymentsByReservation(reservationId, userToken = null) {
    try {
      const response = await this.getAxiosInstance(userToken).get(`/api/payments/reservation/${reservationId}`);
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'Erreur inconnue';
      logger.error('Erreur lors de la récupération des paiements de la réservation:', {
        status: error.response?.status,
        message: errorMessage
      });
      throw new AppError('Erreur lors de la récupération des paiements', error.response?.status || 500);
    }
  }

  // ===================== STATISTIQUES =====================

  // Obtenir les statistiques des paiements
  async getPaymentStats(filters = {}, userToken = null) {
    try {
      const queryParams = new URLSearchParams(filters).toString();
      const response = await this.getAxiosInstance(userToken).get(`/api/payments/stats?${queryParams}`);
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'Erreur inconnue';
      logger.error('Erreur lors de la récupération des statistiques:', {
        status: error.response?.status,
        message: errorMessage
      });
      throw new AppError('Erreur lors de la récupération des statistiques', error.response?.status || 500);
    }
  }

  // ===================== VALIDATIONS =====================

  // Valider qu'un paiement peut être remboursé
  async canRefundPayment(id, amount, userToken = null) {
    try {
      const response = await this.getAxiosInstance(userToken).get(`/api/payments/${id}/can-refund?amount=${amount}`);
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'Erreur inconnue';
      logger.error('Erreur lors de la validation du remboursement:', {
        status: error.response?.status,
        message: errorMessage
      });
      throw new AppError('Erreur lors de la validation du remboursement', error.response?.status || 500);
    }
  }

  // ===================== RÉSERVATIONS =====================

  // Récupérer une réservation
  async findReservationById(id, userToken = null) {
    try {
      const response = await this.getAxiosInstance(userToken).get(`/api/reservations/${id}`);
      return response.data;
    } catch (error) {
      if (error.response?.status === 404) {
        return null;
      }
      const errorMessage = error.response?.data?.message || error.message || 'Erreur inconnue';
      logger.error('Erreur lors de la récupération de la réservation:', {
        status: error.response?.status,
        message: errorMessage
      });
      throw new AppError('Erreur lors de la récupération de la réservation', error.response?.status || 500);
    }
  }

  // Mettre à jour le statut d'une réservation
  async updateReservationStatus(id, status, userToken = null) {
    try {
      const response = await this.getAxiosInstance(userToken).put(`/api/reservations/${id}/status`, {
        status,
        updatedBy: 'payment-service'
      });
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'Erreur inconnue';
      logger.error('Erreur lors de la mise à jour du statut de la réservation:', {
        status: error.response?.status,
        message: errorMessage
      });
      throw new AppError('Erreur lors de la mise à jour de la réservation', error.response?.status || 500);
    }
  }

  // ===================== SANTÉ =====================

  // Vérifier la santé du service BDD
  async checkHealth(userToken = null) {
    try {
      const response = await this.getAxiosInstance(userToken).get('/health');
      return response.data;
    } catch (error) {
      const errorMessage = error.message || 'Erreur inconnue';
      logger.error('Service BDD indisponible:', { message: errorMessage });
      return { status: 'DOWN', error: errorMessage };
    }
  }
}

export const databaseService = new DatabaseService();
