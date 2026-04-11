# Build stage
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/core/package.json ./packages/core/
COPY packages/nodes/package.json ./packages/nodes/
COPY packages/server/package.json ./packages/server/
COPY packages/editor/package.json ./packages/editor/
RUN pnpm install --frozen-lockfile || pnpm install

# Build all packages
FROM deps AS build
COPY . .
RUN pnpm build

# Server production image
FROM base AS server
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/
COPY --from=build /app/packages/core/dist ./packages/core/dist
COPY --from=build /app/packages/core/package.json ./packages/core/
COPY --from=build /app/packages/nodes/dist ./packages/nodes/dist
COPY --from=build /app/packages/nodes/package.json ./packages/nodes/
COPY --from=build /app/packages/server/dist ./packages/server/dist
COPY --from=build /app/packages/server/package.json ./packages/server/
COPY package.json pnpm-workspace.yaml ./
EXPOSE 3001
CMD ["node", "packages/server/dist/main.js"]

# Editor production image (static files served by nginx)
FROM nginx:alpine AS editor
COPY --from=build /app/packages/editor/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
