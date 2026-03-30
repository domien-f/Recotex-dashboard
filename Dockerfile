# ═══ Stage 1: Build Frontend ═══
FROM node:20-alpine AS frontend-build
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/
COPY backend/package.json ./backend/
RUN npm ci --workspace=frontend
COPY frontend ./frontend
RUN npm -w frontend run build

# ═══ Stage 2: Build Backend ═══
FROM node:20-alpine AS backend-build
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/
COPY backend/package.json ./backend/
RUN npm ci --workspace=backend
COPY backend ./backend
RUN npm -w backend run build 2>/dev/null || true

# ═══ Stage 3: Production ═══
FROM node:20-alpine
RUN apk add --no-cache nginx chromium nss freetype harfbuzz ca-certificates ttf-freefont

# Set Puppeteer to use system Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app

# Install production dependencies
COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/
COPY backend/package.json ./backend/
RUN npm ci --omit=dev --workspace=backend && npm cache clean --force

# Copy backend source (tsx runs TypeScript directly)
COPY backend ./backend
COPY --from=backend-build /app/node_modules ./node_modules

# Copy built frontend
COPY --from=frontend-build /app/frontend/dist /app/frontend/dist

# Copy nginx config
COPY nginx.conf /etc/nginx/http.d/default.conf

# Create uploads dir
RUN mkdir -p /app/backend/uploads

# Copy entrypoint
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 80

CMD ["/docker-entrypoint.sh"]
