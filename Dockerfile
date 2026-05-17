# Multi-stage build for Hyper Alpha Arena
FROM node:18-alpine AS frontend-builder

# Build frontend
WORKDIR /app/frontend
COPY frontend/package.json ./
RUN npm install -g pnpm && pnpm install
COPY frontend/ ./
RUN pnpm build

# Python backend stage
FROM python:3.12-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy backend code
COPY backend/ ./backend/

# Install Python dependencies
WORKDIR /app/backend
RUN pip install --no-cache-dir -e .

# Copy built frontend
COPY --from=frontend-builder /app/frontend/dist /app/backend/static/

# Copy runtime startup scripts
COPY scripts/start-backend.sh /app/scripts/start-backend.sh
RUN chmod +x /app/scripts/start-backend.sh

# Expose port
EXPOSE 8802

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f "http://localhost:${BACKEND_PORT:-8802}/api/health" || exit 1

# Start application with database initialization
CMD ["/app/scripts/start-backend.sh"]
