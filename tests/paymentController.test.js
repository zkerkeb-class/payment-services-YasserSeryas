import request from 'supertest';
import app from '../server.js';
import { databaseService } from '../services/databaseService.js';

// Mock du service de base de données
jest.mock('../services/databaseService.js');

describe('Payment Controller', () => {
  beforeEach(() => {
    // Réinitialiser les mocks avant chaque test
    jest.clearAllMocks();
  });

  describe('POST /api/payments', () => {
    it('devrait créer un nouveau paiement', async () => {
      const paymentData = {
        reservation: '507f1f77bcf86cd799439011',
        amount: 100,
        currency: 'EUR',
        paymentMethod: 'carte_credit',
        billingAddress: {
          name: 'Test User',
          street: '123 Test Street',
          city: 'Test City',
          postalCode: '12345',
          country: 'France'
        }
      };

      const mockPayment = {
        success: true,
        data: {
          _id: '507f1f77bcf86cd799439012',
          ...paymentData,
          status: 'en attente',
          createdAt: new Date()
        }
      };

      const mockReservation = {
        success: true,
        data: {
          _id: '507f1f77bcf86cd799439011',
          status: 'en attente'
        }
      };

      databaseService.findReservationById.mockResolvedValue(mockReservation);
      databaseService.createPayment.mockResolvedValue(mockPayment);

      const response = await request(app)
        .post('/api/payments')
        .set('Authorization', 'Bearer valid_jwt_token')
        .send(paymentData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.amount).toBe(100);
    });

    it('devrait échouer avec des données invalides', async () => {
      const invalidData = {
        amount: -10,
        paymentMethod: 'methode_invalide'
      };

      const response = await request(app)
        .post('/api/payments')
        .set('Authorization', 'Bearer valid_jwt_token')
        .send(invalidData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
    });
  });

  describe('GET /api/payments/:id', () => {
    it('devrait récupérer un paiement par son ID', async () => {
      const mockPayment = {
        success: true,
        data: {
          _id: '507f1f77bcf86cd799439012',
          amount: 50,
          paymentMethod: 'paypal',
          status: 'complété'
        }
      };

      databaseService.findPaymentById.mockResolvedValue(mockPayment);

      const response = await request(app)
        .get('/api/payments/507f1f77bcf86cd799439012')
        .set('Authorization', 'Bearer valid_jwt_token')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data._id).toBe('507f1f77bcf86cd799439012');
    });

    it('devrait retourner 404 pour un ID inexistant', async () => {
      databaseService.findPaymentById.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/payments/507f1f77bcf86cd799439999')
        .set('Authorization', 'Bearer valid_jwt_token')
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/payments/:id/refund', () => {
    it('devrait traiter un remboursement', async () => {
      const mockPayment = {
        success: true,
        data: {
          _id: '507f1f77bcf86cd799439012',
          amount: 100,
          paymentMethod: 'carte_credit',
          status: 'complété',
          paymentDate: new Date(),
          refundAmount: 0
        }
      };

      const mockRefundedPayment = {
        success: true,
        data: {
          ...mockPayment.data,
          refundAmount: 50,
          refundDate: new Date(),
          refundReason: 'Remboursement partiel demandé par le client'
        }
      };

      databaseService.findPaymentById.mockResolvedValue(mockPayment);
      databaseService.refundPayment.mockResolvedValue(mockRefundedPayment);

      const refundData = {
        amount: 50,
        reason: 'Remboursement partiel demandé par le client'
      };

      const response = await request(app)
        .post('/api/payments/507f1f77bcf86cd799439012/refund')
        .set('Authorization', 'Bearer valid_jwt_token')
        .send(refundData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.refundAmount).toBe(50);
    });
  });

  describe('GET /api/payments/stats', () => {
    it('devrait retourner les statistiques des paiements', async () => {
      const mockStats = {
        success: true,
        data: {
          statusStats: [
            { _id: 'complété', count: 5, totalAmount: 500 },
            { _id: 'en attente', count: 2, totalAmount: 150 }
          ],
          methodStats: [
            { _id: 'carte_credit', count: 4, totalAmount: 400 },
            { _id: 'paypal', count: 3, totalAmount: 250 }
          ],
          totalPayments: 7,
          totalAmount: 650
        }
      };

      databaseService.getPaymentStats.mockResolvedValue(mockStats);

      const response = await request(app)
        .get('/api/payments/stats')
        .set('Authorization', 'Bearer valid_jwt_token')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.statusStats).toBeDefined();
      expect(response.body.data.methodStats).toBeDefined();
    });
  });
});
