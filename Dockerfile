FROM ghcr.io/puppeteer/puppeteer:23.5.2

# Switch to root user for installation
USER root

# Set environment variables for npm
ENV NODE_ENV=production
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_CACHE_DIR=/home/pptruser/.cache/puppeteer

# Set working directory
WORKDIR /usr/src/app

# Copy package files and set proper ownership
COPY --chown=pptruser:pptruser package*.json ./

# Install build dependencies for native modules
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies (allow scripts for native modules like sqlite3)
RUN npm install --omit=dev && \
    npm rebuild sqlite3 && \
    npm cache clean --force

# Copy application files with proper ownership
COPY --chown=pptruser:pptruser . .

# Create data and logs directories with proper ownership
RUN mkdir -p data/sessions data/exports logs && \
    chown -R pptruser:pptruser data logs

# Switch back to pptruser
USER pptruser

# Expose port (Render uses PORT environment variable)
EXPOSE 10000

# Add health check endpoint
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:${PORT:-10000}/health || exit 1

# Start the application
CMD ["node", "app.js"]