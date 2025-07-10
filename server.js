import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Import des routes
import paymentRoutes from './routes/paymentRoutes.js';
import webhookRoutes from './routes/webhookRoutes.js';

// Import des middlewares
import { errorHandler } from './middleware/errorHandler.js';
import { logger } from './utils/logger.js';
import { databaseService } from './services/databaseService.js';

// Configuration des variables d'environnement
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3003;

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limite chaque IP à 100 requêtes par windowMs
  message: {
    error: 'Trop de requêtes depuis cette IP, veuillez réessayer plus tard.'
  }
});

// Middlewares de sécurité
app.use(helmet());
app.use(compression());
app.use(limiter);

// CORS
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));

// Webhook Stripe (avant le parsing JSON)
app.use('/api/webhooks', webhookRoutes);

// Parsing JSON
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging des requêtes
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path} - ${req.ip}`);
  next();
});

// Routes
app.use('/api/payments', paymentRoutes);

// Route de santé
app.get('/health', async (req, res) => {
  try {
    // Vérifier la santé du service BDD
    const dbHealth = await databaseService.checkHealth();
    
    res.status(200).json({
      status: 'OK',
      service: 'Payment Microservice',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      dependencies: {
        database: dbHealth
      }
    });
  } catch (error) {
    logger.error('Erreur lors de la vérification de santé:', error);
    res.status(503).json({
      status: 'ERROR',
      service: 'Payment Microservice',
      timestamp: new Date().toISOString(),
      error: 'Service dependencies unavailable'
    });
  }
});

// Route par défaut
app.get('/', (req, res) => {
  res.json({
    message: 'Microservice de Paiements',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      payments: '/api/payments',
      webhooks: '/api/webhooks'
    }
  });
});

// Middleware de gestion des erreurs (doit être en dernier)
app.use(errorHandler);

// Démarrage du serveur
const startServer = async () => {
  try {
    // Vérifier que le service BDD est disponible
    const dbHealth = await databaseService.checkHealth();
    if (dbHealth.status === 'DOWN') {
      logger.warn('Service BDD non disponible au démarrage, continuons quand même...');
    } else {
      logger.info('Service BDD disponible ✓');
    }
    
    app.listen(PORT, () => {
      logger.info(`🚀 Microservice de paiements démarré sur le port ${PORT}`);
      logger.info(`🌍 Environnement: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`🗄️  Service BDD: ${process.env.DATABASE_SERVICE_URL || 'http://localhost:3005'}`);
    });
  } catch (error) {
    logger.error('Erreur lors du démarrage du serveur:', error);
    process.exit(1);
  }
};

// Gestion propre de l'arrêt
process.on('SIGTERM', async () => {
  logger.info('SIGTERM reçu, arrêt en cours...');
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT reçu, arrêt en cours...');
  process.exit(0);
});

// Gestion des erreurs non capturées
process.on('unhandledRejection', (err) => {
  logger.error('Unhandled Promise Rejection:', err);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  process.exit(1);
});

startServer().catch(error => {
  logger.error('Erreur lors du démarrage du serveur:', error);
  process.exit(1);
});

export default app;
