FROM ghcr.io/puppeteer/puppeteer:24.10.2

# Switch to root user for installation
USER root

# Set working directory
WORKDIR /usr/src/app

# Copy package files and set proper ownership
COPY --chown=pptruser:pptruser package*.json ./

# Install dependencies
RUN npm install --omit=dev --no-package-lock

# Copy application files with proper ownership
COPY --chown=pptruser:pptruser . .

# Create data directories with proper ownership
RUN mkdir -p data/sessions data/exports ui/data && \
    chown -R pptruser:pptruser data ui/data

# Switch back to pptruser
USER pptruser

# Set environment variables
ENV NODE_ENV=production
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

# Expose port
EXPOSE 3000

# Start the application
CMD ["node", "app.js"]