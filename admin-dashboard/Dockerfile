# Multi-stage production image: build once, run the compiled server + static client.
FROM node:20-alpine AS build
WORKDIR /app

# Public URL prefix when nginx mounts under a path (must end with / for Vite, or / alone).
# Example: /dev/espazio-admin/
ARG VITE_BASE_PATH=/
ENV VITE_BASE_PATH=$VITE_BASE_PATH

COPY package.json package-lock.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/
RUN npm ci

COPY client ./client
COPY server ./server
RUN npm run build && npm prune --omit=dev

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

RUN addgroup -S app && adduser -S app -G app \
  && mkdir -p /app/uploads \
  && chown app:app /app/uploads

COPY --from=build --chown=app:app /app/package.json /app/package-lock.json ./
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/server/package.json ./server/
COPY --from=build --chown=app:app /app/server/dist ./server/dist
COPY --from=build --chown=app:app /app/client/dist ./client/dist

USER app
EXPOSE 3000
CMD ["node", "server/dist/index.js"]
