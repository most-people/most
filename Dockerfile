FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

RUN addgroup -g 1001 -S nodejs && \
    adduser -S mostbox -u 1001

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/out ./out
COPY --from=builder /app/server ./server

RUN chown -R mostbox:nodejs /app

USER mostbox

EXPOSE 1976

ENV MOSTBOX_HOST=0.0.0.0
ENV PORT=1976

CMD ["node", "server/index.js"]
