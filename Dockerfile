# Use Node.js 22.18.0 Alpine as the base image for smaller size
FROM node:22.18.0-alpine AS base

# Install necessary system dependencies
RUN apk add --no-cache libc6-compat openssl

# Enable pnpm and set packageManager field
RUN corepack enable
RUN corepack prepare pnpm@latest --activate

WORKDIR /app

# Set environment variable to skip Husky in Docker
ENV DOCKER=true

# Copy everything from api/ directory
COPY api/package.json api/pnpm-lock.yaml api/prisma.config.js ./
COPY api/prisma ./prisma/
COPY api/nest-cli.json api/tsconfig*.json ./
COPY api/src ./src/

# Install dependencies with optimizations
RUN pnpm config set store-dir ~/.pnpm-store \
    && pnpm install --frozen-lockfile --prod=false --ignore-scripts \
    && pnpm store prune

# Generate Prisma client
RUN pnpm prisma generate

# Build the application
RUN pnpm build

# Verify build output
RUN ls -la dist/ && test -f dist/main.js

# Production stage - Multi-stage build for smaller final image
FROM node:22.18.0-alpine AS production

RUN apk add --no-cache libc6-compat openssl curl
RUN corepack enable
RUN corepack prepare pnpm@latest --activate

WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nestjs

# Set environment variable to skip Husky in Docker
ENV DOCKER=true

# Copy package files
COPY api/package.json api/pnpm-lock.yaml api/prisma.config.js ./

# Install only production dependencies
RUN pnpm config set store-dir ~/.pnpm-store \
    && pnpm install --frozen-lockfile --prod=true --ignore-scripts \
    && pnpm store prune

# Copy prisma schema and generate client in production
COPY --from=base /app/prisma ./prisma

# Temporarily install Prisma CLI and generate client
RUN pnpm add prisma --save-dev \
    && pnpm prisma generate \
    && pnpm remove prisma

# Clean up pnpm store
RUN rm -rf ~/.pnpm-store

# Copy built application from base stage
COPY --from=base /app/dist ./dist

# Copy public folder (dashboard, static assets)
COPY api/public ./public/

# Change ownership to non-root user
RUN chown -R nestjs:nodejs /app
USER nestjs

EXPOSE 3000

# Use node directly instead of npm for better performance
CMD ["node", "dist/main.js"]