FROM node:24.12.0-bookworm-slim AS build
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./backend/
COPY prototype/package.json prototype/package-lock.json ./prototype/
RUN npm ci --prefix backend --ignore-scripts && npm ci --prefix prototype --ignore-scripts
COPY backend/bin/build-lab.mjs ./backend/bin/build-lab.mjs
COPY backend/lab/wallets.entry.js ./backend/lab/wallets.entry.js
COPY prototype/index.html prototype/vite.config.mjs ./prototype/
COPY prototype/src ./prototype/src
COPY prototype/public ./prototype/public
RUN npm run build:lab --prefix backend && npm run build --prefix prototype && npm prune --prefix backend --omit=dev --ignore-scripts

FROM node:24.12.0-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production APP_ENV=production PORT=8080 APP_STATE_DIR=/data/state
COPY --from=build /app/backend/node_modules ./backend/node_modules
COPY --from=build /app/backend/package.json ./backend/package.json
COPY --from=build /app/backend/lab/dist ./backend/lab/dist
COPY --from=build /app/prototype/dist ./prototype/dist
COPY backend/src ./backend/src
COPY deployments/mainnet.json deployments/qualification.json ./deployments/
COPY backend/bin/server.mjs ./backend/bin/server.mjs
EXPOSE 8080
CMD ["node", "backend/bin/server.mjs"]
