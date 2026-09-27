FROM node:20-alpine AS base
WORKDIR /app

# Copy package files first for optimal Docker layer caching
COPY package*.json ./

# Install production dependencies using --omit=dev
RUN npm ci --omit=dev

# Copy all source files
COPY . .

EXPOSE 3001
CMD ["node", "src/server.js"]
