FROM node:20-alpine AS base
WORKDIR /app

# Copy package files and prisma schema first for optimal Docker layer caching
COPY package*.json ./
COPY prisma ./prisma/

# Install production dependencies using --omit=dev (fixes npm warning)
RUN npm ci --omit=dev

# Explicitly generate Prisma Client to ensure @prisma/client is initialized
RUN npx prisma generate --schema=./prisma/schema.prisma

# Copy all source files
COPY . .

EXPOSE 3001
CMD ["node", "src/server.js"]
