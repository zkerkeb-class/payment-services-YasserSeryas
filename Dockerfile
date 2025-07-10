# Multi-stage build pour supporter développement et production
FROM node:18-alpine as base

WORKDIR /app

# Copier les fichiers package
COPY package*.json ./

# Stage de développement
FROM base as development
ENV NODE_ENV=development

# Installer toutes les dépendances (dev incluses)
RUN npm install

# Exposer le port
EXPOSE 3003

# Commande pour démarrer en mode développement avec hot reload
CMD ["npm", "run", "dev"]

# Stage de production
FROM base as production

# Installer les dépendances de production uniquement
RUN npm ci --only=production

# Copier le code source
COPY . .

# Créer un utilisateur non-root
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Créer le dossier logs
RUN mkdir -p logs && chown -R nodejs:nodejs logs

# Changer vers l'utilisateur non-root
USER nodejs

# Exposer le port
EXPOSE 3003

# Santé du conteneur
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3003/health || exit 1

# Démarrer l'application
CMD ["npm", "start"]
