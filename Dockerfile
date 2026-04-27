FROM node:20-slim

# Install build dependencies for native modules
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install dependencies (forcing build from source)
COPY package*.json ./
RUN npm install --build-from-source sqlite3

# Copy source code
COPY . .

# Build TypeScript
RUN npx tsc

# Create directory for SQLite database
RUN mkdir -p /app/data && chown -R node:node /app/data

EXPOSE 3000

CMD ["node", "dist/index.js"]
