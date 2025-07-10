import { logger } from '../utils/logger.js';

// Middleware pour extraire le token de l'utilisateur et l'ajouter à req.userToken
export const extractUserToken = (req, res, next) => {
  try {
    // Récupérer le token depuis le header Authorization
    const authHeader = req.header('Authorization');
    
    if (authHeader) {
      req.userToken = authHeader; // Garder le format complet "Bearer token"
      logger.debug('Token utilisateur extrait:', {
        hasToken: true,
        tokenPreview: authHeader.substring(0, 20) + '...'
      });
    } else {
      req.userToken = null;
      logger.debug('Aucun token utilisateur trouvé');
    }
    
    next();
  } catch (error) {
    logger.error('Erreur lors de l\'extraction du token:', error);
    req.userToken = null;
    next();
  }
};

// Middleware pour vérifier qu'un token est présent (optionnel, pour les routes qui l'exigent)
export const requireUserToken = (req, res, next) => {
  if (!req.userToken) {
    return res.status(401).json({
      success: false,
      error: {
        message: 'Token d\'authentification requis'
      }
    });
  }
  next();
};
