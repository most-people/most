FROM node:24-bookworm AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:24-bookworm AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV HOME=/data

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/out ./out
COPY --from=build /app/public ./public
COPY --from=build /app/server ./server

RUN mkdir -p /data

EXPOSE 1976
CMD ["node", "server/cli.js", "--host", "0.0.0.0"]
