import axios from 'axios';
import { logger } from '../utils/logger.js';
import { AppError } from '../utils/AppError.js';

class DatabaseService {
  constructor() {
    this.dbServiceUrl = process.env.DATABASE_SERVICE_URL || 'http://localhost:3005';
    this.timeout = 10000; // 10 secondes de timeout
  }

  // Configuration axios avec intercepteurs
  getAxiosInstance() {
    const instance = axios.create({
      baseURL: this.dbServiceUrl,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Name': 'payment-service'
      }
    });

    // Intercepteur pour les requêtes
    instance.interceptors.request.use(
      (config) => {
        logger.info(`Database request: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        logger.error('Database request error:', error);
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
        logger.error('Database response error:', error.response?.data || error.message);
        return Promise.reject(error);
      }
    );

    return instance;
  }

  // ===================== PAYMENTS CRUD =====================

  // Créer un paiement
  async createPayment(paymentData) {
    try {
      const response = await this.getAxiosInstance().post('/api/payments', paymentData);
      return response.data;
    } catch (error) {
      logger.error('Erreur lors de la création du paiement:', error);
      throw new AppError('Erreur lors de la création du paiement', 500);
    }
  }

  // Récupérer un paiement par ID
  async findPaymentById(id) {
    try {
      const response = await this.getAxiosInstance().get(`/api/payments/${id}`);
      return response.data;
    } catch (error) {
      if (error.response?.status === 404) {
        return null;
      }
      logger.error('Erreur lors de la récupération du paiement:', error);
      throw new AppError('Erreur lors de la récupération du paiement', 500);
    }
  }

  // Récupérer tous les paiements avec filtres
  async findPayments(filters = {}) {
    try {
      const queryParams = new URLSearchParams(filters).toString();
      const response = await this.getAxiosInstance().get(`/api/payments?${queryParams}`);
      return response.data;
    } catch (error) {
      logger.error('Erreur lors de la récupération des paiements:', error);
      throw new AppError('Erreur lors de la récupération des paiements', 500);
    }
  }

  // Mettre à jour un paiement
  async updatePayment(id, updateData) {
    try {
      const response = await this.getAxiosInstance().put(`/api/payments/${id}`, updateData);
      return response.data;
    } catch (error) {
      logger.error('Erreur lors de la mise à jour du paiement:', error);
      throw new AppError('Erreur lors de la mise à jour du paiement', 500);
    }
  }

  // Supprimer un paiement
  async deletePayment(id) {
    try {
      const response = await this.getAxiosInstance().delete(`/api/payments/${id}`);
      return response.data;
    } catch (error) {
      logger.error('Erreur lors de la suppression du paiement:', error);
      throw new AppError('Erreur lors de la suppression du paiement', 500);
    }
  }

  // ===================== MÉTHODES MÉTIER =====================

  // Marquer un paiement comme complété
  async markPaymentAsCompleted(id, transactionId) {
    try {
      const response = await this.getAxiosInstance().post(`/api/payments/${id}/complete`, {
        transactionId,
        paymentDate: new Date(),
        status: 'complété'
      });
      return response.data;
    } catch (error) {
      logger.error('Erreur lors de la completion du paiement:', error);
      throw new AppError('Erreur lors de la completion du paiement', 500);
    }
  }

  // Effectuer un remboursement
  async refundPayment(id, amount, reason) {
    try {
      const response = await this.getAxiosInstance().post(`/api/payments/${id}/refund`, {
        amount,
        reason,
        refundDate: new Date()
      });
      return response.data;
    } catch (error) {
      logger.error('Erreur lors du remboursement:', error);
      throw new AppError('Erreur lors du remboursement', 500);
    }
  }

  // Récupérer les paiements d'une réservation
  async findPaymentsByReservation(reservationId) {
    try {
      const response = await this.getAxiosInstance().get(`/api/payments/reservation/${reservationId}`);
      return response.data;
    } catch (error) {
      logger.error('Erreur lors de la récupération des paiements de la réservation:', error);
      throw new AppError('Erreur lors de la récupération des paiements', 500);
    }
  }

  // ===================== STATISTIQUES =====================

  // Obtenir les statistiques des paiements
  async getPaymentStats(filters = {}) {
    try {
      const queryParams = new URLSearchParams(filters).toString();
      const response = await this.getAxiosInstance().get(`/api/payments/stats?${queryParams}`);
      return response.data;
    } catch (error) {
      logger.error('Erreur lors de la récupération des statistiques:', error);
      throw new AppError('Erreur lors de la récupération des statistiques', 500);
    }
  }

  // ===================== VALIDATIONS =====================

  // Valider qu'un paiement peut être remboursé
  async canRefundPayment(id, amount) {
    try {
      const response = await this.getAxiosInstance().get(`/api/payments/${id}/can-refund?amount=${amount}`);
      return response.data;
    } catch (error) {
      logger.error('Erreur lors de la validation du remboursement:', error);
      throw new AppError('Erreur lors de la validation du remboursement', 500);
    }
  }

  // ===================== RÉSERVATIONS =====================

  // Récupérer une réservation
  async findReservationById(id) {
    try {
      const response = await this.getAxiosInstance().get(`/api/reservations/${id}`);
      return response.data;
    } catch (error) {
      if (error.response?.status === 404) {
        return null;
      }
      logger.error('Erreur lors de la récupération de la réservation:', error);
      throw new AppError('Erreur lors de la récupération de la réservation', 500);
    }
  }

  // Mettre à jour le statut d'une réservation
  async updateReservationStatus(id, status) {
    try {
      const response = await this.getAxiosInstance().put(`/api/reservations/${id}/status`, {
        status,
        updatedBy: 'payment-service'
      });
      return response.data;
    } catch (error) {
      logger.error('Erreur lors de la mise à jour du statut de la réservation:', error);
      throw new AppError('Erreur lors de la mise à jour de la réservation', 500);
    }
  }

  // ===================== SANTÉ =====================

  // Vérifier la santé du service BDD
  async checkHealth() {
    try {
      const response = await this.getAxiosInstance().get('/health');
      return response.data;
    } catch (error) {
      logger.error('Service BDD indisponible:', error);
      return { status: 'DOWN', error: error.message };
    }
  }
}

export const databaseService = new DatabaseService();
