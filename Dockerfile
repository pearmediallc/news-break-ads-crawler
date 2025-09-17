FROM ghcr.io/puppeteer/puppeteer:24.10.2

# Switch to root user for installation
USER root

# The puppeteer Docker image installs Chrome in its cache directory
# Set the cache directory to match the image's setup
ENV PUPPETEER_CACHE_DIR=/home/pptruser/.cache/puppeteer

# Set working directory
WORKDIR /usr/src/app

# Copy package files and set proper ownership
COPY --chown=pptruser:pptruser package*.json ./

# Install dependencies
RUN npm install --omit=dev --no-package-lock

# The puppeteer Docker image comes with Chrome pre-installed
# But we need to ensure puppeteer knows where to find it
# Install Chrome through puppeteer to ensure compatibility
RUN npx puppeteer browsers install chrome --install-deps

# Copy application files with proper ownership
COPY --chown=pptruser:pptruser . .

# Create data and logs directories with proper ownership
RUN mkdir -p data/sessions data/exports ui/data logs && \
    chown -R pptruser:pptruser data ui/data logs

# Switch back to pptruser
USER pptruser

# Set environment variables
ENV NODE_ENV=production

# Expose port
EXPOSE 3000

# Start the application
CMD ["node", "app.js"]