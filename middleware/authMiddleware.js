import jwt from 'jsonwebtoken';
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';

export const authMiddleware = (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return next(new AppError('Token d\'authentification requis', 401));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    
    logger.info(`Utilisateur authentifié: ${JSON.stringify(decoded)}`);
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return next(new AppError('Token invalide', 401));
    }
    if (error.name === 'TokenExpiredError') {
      return next(new AppError('Token expiré', 401));
    }
    
    logger.error('Erreur d\'authentification:', error);
    next(new AppError('Erreur d\'authentification', 401));
  }
};

// Middleware pour vérifier les rôles
export const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Authentification requise', 401));
    }

    if (!roles.includes(req.user.role)) {
      return next(new AppError('Permissions insuffisantes', 403));
    }

    next();
  };
};

// Middleware pour vérifier si l'utilisateur peut accéder à ses propres données
export const requireOwnership = (req, res, next) => {
  // Logique pour vérifier que l'utilisateur accède à ses propres données
  // À adapter selon votre logique métier
  next();
};
