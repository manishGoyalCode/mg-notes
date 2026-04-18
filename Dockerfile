FROM node:18-alpine

WORKDIR /app

# Install dependencies (better-sqlite3 needs build tools on Alpine)
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Copy app source
COPY . .

# Create data directory for SQLite
RUN mkdir -p /app/data

# Expose port
EXPOSE 3000

# Persist database across container restarts
VOLUME ["/app/data"]

CMD ["node", "server/index.js"]
