# Microservice de Paiements

## Description
Microservice dédié à la gestion des paiements pour le système de réservation. Ce service gère les transactions, les remboursements, et l'intégration avec les passerelles de paiement comme Stripe. **Il communique avec le microservice BDD pour la persistance des données.**

## Architecture

Ce microservice suit une architecture **sans base de données directe** et communique avec le **microservice BDD** pour toutes les opérations de persistance.

```
payment-microservice/
├── server.js                    # Point d'entrée du serveur
├── services/
│   ├── databaseService.js       # Communication avec microservice BDD
│   ├── paymentService.js        # Services métier
│   └── stripeService.js         # Intégration Stripe
├── routes/
│   ├── paymentRoutes.js         # Routes des paiements
│   └── webhookRoutes.js         # Routes des webhooks
├── controllers/
│   ├── paymentController.js     # Logique métier des paiements
│   └── webhookController.js     # Gestion des webhooks
├── middleware/
│   ├── authMiddleware.js        # Authentification
│   ├── errorHandler.js          # Gestion d'erreurs
│   └── validateRequest.js       # Validation des requêtes
└── utils/
    ├── logger.js                # Système de logging
    └── AppError.js              # Classes d'erreur personnalisées
```

### Communication avec le Microservice BDD

Le service `databaseService.js` gère toute la communication avec votre microservice BDD via des appels API REST :

- **Paiements** : CRUD complet via `/api/payments`
- **Réservations** : Consultation et mise à jour via `/api/reservations`
- **Statistiques** : Agrégations via `/api/payments/stats`

## Configuration

### Variables d'Environnement

```bash
# Service de base de données (OBLIGATOIRE)
DATABASE_SERVICE_URL=http://localhost:3005

# Authentification
JWT_SECRET=your_jwt_secret_key

# Intégrations paiement
STRIPE_SECRET_KEY=sk_test_your_stripe_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret

# Autres microservices
RESERVATION_SERVICE_URL=http://localhost:3001
NOTIFICATION_SERVICE_URL=http://localhost:3004
```

## API Endpoints

### Paiements
- `POST /api/payments` - Créer un paiement
- `GET /api/payments` - Lister les paiements (avec pagination)
- `GET /api/payments/:id` - Récupérer un paiement
- `PUT /api/payments/:id/status` - Mettre à jour le statut
- `DELETE /api/payments/:id` - Annuler un paiement
- `POST /api/payments/:id/refund` - Traiter un remboursement
- `GET /api/payments/reservation/:reservationId` - Paiements par réservation
- `GET /api/payments/stats` - Statistiques des paiements

### Webhooks
- `POST /api/webhooks/stripe` - Webhooks Stripe
- `POST /api/webhooks/paypal` - Webhooks PayPal

### Utilitaires
- `GET /health` - Vérification de santé du service
- `GET /` - Information sur le service

## Méthodes de Paiement Supportées

### Carte de Crédit
- Intégration complète Stripe
- Validation PCI DSS
- Support 3D Secure
- Gestion des erreurs et tentatives

### PayPal
- API PayPal REST
- Gestion des comptes sandbox/live
- Webhooks pour confirmation

### Virement Bancaire
- Références de paiement uniques
- Validation manuelle
- Notifications automatiques

### Espèces
- Confirmation manuelle
- Traçabilité complète

## Modèle de Données

### Payment
```javascript
{
  reservation: ObjectId,        // Référence à la réservation
  amount: Number,              // Montant du paiement
  currency: String,            // Devise (EUR par défaut)
  paymentMethod: String,       // Méthode de paiement
  status: String,              // Statut du paiement
  transactionId: String,       // ID de transaction unique
  paymentDate: Date,          // Date de paiement
  paymentDetails: Object,      // Détails spécifiques à la méthode
  billingAddress: Object,      // Adresse de facturation
  refundAmount: Number,        // Montant remboursé
  refundDate: Date,           // Date de remboursement
  refundReason: String,       // Raison du remboursement
  notes: String,              // Notes additionnelles
  createdAt: Date,            // Date de création
  updatedAt: Date             // Date de mise à jour
}
```

### Statuts de Paiement
- `en attente` - Paiement créé mais non traité
- `traitement` - Paiement en cours de traitement
- `complété` - Paiement réussi
- `échoué` - Paiement échoué
- `remboursé` - Paiement remboursé
- `annulé` - Paiement annulé

## Sécurité

### Authentification
- JWT tokens requis pour toutes les routes protégées
- Vérification des rôles et permissions
- Expiration automatique des tokens

### Validation
- Validation stricte des données d'entrée
- Sanitisation des paramètres
- Vérification des montants et devises

### Rate Limiting
- Limitation des requêtes par IP
- Protection contre les attaques par déni de service
- Configuration flexible par environnement

## Monitoring et Logs

### Logging
- Logs structurés avec Winston
- Rotation automatique des fichiers
- Niveaux de log configurables
- Logs d'audit pour les transactions

### Métriques
- Suivi des performances
- Alertes sur les erreurs
- Statistiques de paiement
- Monitoring de santé

## Tests

```bash
# Lancer les tests
npm test

# Tests avec couverture
npm run test:coverage

# Tests en mode watch
npm run test:watch
```

## Déploiement

### Docker
```bash
# Construire l'image
docker build -t payment-microservice .

# Lancer le conteneur
docker run -p 3003:3003 payment-microservice
```

### Variables d'Environnement de Production
- `NODE_ENV=production`
- `MONGODB_URI` - URI MongoDB de production
- `STRIPE_SECRET_KEY` - Clé Stripe de production
- `JWT_SECRET` - Secret JWT sécurisé
- `LOG_LEVEL=warn` - Niveau de log réduit

## Intégration avec les Autres Microservices

### Service de Réservation
- Validation des réservations avant paiement
- Mise à jour du statut après paiement
- Synchronisation des données

### Service de Notification
- Notifications de confirmation de paiement
- Alertes d'échec de paiement
- Rappels de remboursement

### Service Utilisateur
- Vérification des permissions
- Historique des paiements utilisateur
- Gestion des méthodes de paiement sauvegardées

## Support et Maintenance

### Logs d'Erreur
Les logs sont disponibles dans le dossier `logs/` :
- `error.log` - Erreurs uniquement
- `combined.log` - Tous les logs

### Debugging
Activer les logs de debug :
```bash
LOG_LEVEL=debug npm run dev
```

### Backup et Récupération
- Backup automatique de la base de données
- Procédures de récupération documentées
- Tests de restauration réguliers

---

## Licence
MIT

## Contributeurs
- YasserSeryas - Développeur principal
