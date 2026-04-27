# Stage 1: Build
FROM node:18-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Runtime
FROM ghcr.io/puppeteer/puppeteer:latest AS runtime
USER root
WORKDIR /app

# 1. Copy dulu semua file hasil build dari builder ke runtime
# Ini harus dilakukan DI AWAL agar tidak menimpa folder .cache nanti
COPY --from=builder /app /app

# 2. Set environment folder cache
ENV PUPPETEER_CACHE_DIR=/app/.cache/puppeteer

# 3. Install browser (Jalankan SETELAH copy file aplikasi)
# Kita hapus folder cache lama dulu buat jaga-jaga, baru install fresh
RUN rm -rf /app/.cache/puppeteer && \
    mkdir -p /app/.cache/puppeteer && \
    npx puppeteer browsers install chrome --path /app/.cache/puppeteer

# 4. Set Permission agar user pptruser bisa eksekusi
RUN chown -R pptruser:pptruser /app

# 5. HAPUS ENV EXECUTABLE_PATH YANG MANUAL! 
# Biar Puppeteer cari sendiri di folder cache yang kita set tadi.
# ENV PUPPETEER_EXECUTABLE_PATH="..." <--- HAPUS BARIS INI

USER pptruser

ENTRYPOINT ["node", "dist/main.js"]