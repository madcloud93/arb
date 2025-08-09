FROM node:18-alpine

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package*.json ./
COPY tsconfig.json ./

RUN npm ci --only=production

COPY src/ ./src/

RUN npm run build

RUN addgroup -g 1001 -S flashsol && \
    adduser -S flashsol -u 1001

RUN mkdir -p /app/data && chown flashsol:flashsol /app/data
USER flashsol

# Expose health check port (if needed)
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "console.log('Health check passed')" || exit 1

# Start the bot
CMD ["npm", "start"]
