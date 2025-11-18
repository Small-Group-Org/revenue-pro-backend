FROM node:20-alpine

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy only necessary files for build
COPY tsconfig.json ./
COPY src/ ./src/

# Build TypeScript (uses local version from node_modules)
RUN npm run build

# Start the application
CMD ["node", "dist/server.js"]
