# Production Multi-Stage Dockerfile for local-ai-relay
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json tsconfig.json ./
RUN npm ci

COPY src ./src
RUN npm run build

FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.1
ENV PORT=8787

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

USER node

EXPOSE 8787

CMD ["node", "dist/index.js"]
