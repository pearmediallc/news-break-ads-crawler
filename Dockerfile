FROM ghcr.io/puppeteer/puppeteer:24.10.2

# Switch to root user for installation
USER root

# The puppeteer image has Chrome at this location
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV CHROME_PATH=/usr/bin/chromium

# Set working directory
WORKDIR /usr/src/app

# Copy package files and set proper ownership
COPY --chown=pptruser:pptruser package*.json ./

# Install dependencies
RUN npm install --omit=dev --no-package-lock

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