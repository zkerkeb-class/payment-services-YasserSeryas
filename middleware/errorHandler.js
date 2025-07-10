import { logger } from '../utils/logger.js';

export const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    const message = 'Ressource non trouvée';
    error = { message, statusCode: 404, isOperational: true };
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const message = 'Ressource dupliquée';
    error = { message, statusCode: 400, isOperational: true };
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map(val => val.message).join(', ');
    error = { message, statusCode: 400, isOperational: true };
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    const message = 'Token invalide';
    error = { message, statusCode: 401, isOperational: true };
  }

  if (err.name === 'TokenExpiredError') {
    const message = 'Token expiré';
    error = { message, statusCode: 401, isOperational: true };
  }

  // Stripe errors
  if (err.type && err.type.startsWith('Stripe')) {
    const message = 'Erreur de traitement du paiement';
    error = { message, statusCode: 400, isOperational: true };
  }

  // Log de l'erreur
  logger.error('Erreur capturée:', {
    message: error.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  res.status(error.statusCode || 500).json({
    success: false,
    error: {
      message: error.message || 'Erreur interne du serveur',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    }
  });
};
