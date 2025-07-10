// Configuration Jest pour les tests
import dotenv from 'dotenv';

// Charger les variables d'environnement pour les tests
dotenv.config({ path: '.env.test' });

// Configuration globale pour les tests
global.console = {
  ...console,
  // Masquer les logs pendant les tests
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
