FROM node:24-bookworm-slim
WORKDIR /app/soop-server
COPY soop-server/package*.json ./
RUN npm ci && npx playwright install --with-deps chromium
COPY soop-server/server.mjs soop-server/sdk-bridge.mjs ./
COPY index.html colosseum3d.bundle.js soop-client.js soop-chat.js soop.css soop.svg THREE-LICENSE.txt /app/
ENV HOST=0.0.0.0 PORT=8080
EXPOSE 8080
CMD ["node", "server.mjs"]
