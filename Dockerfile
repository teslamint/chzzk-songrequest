FROM node:20-alpine AS base

RUN npm i -g pnpm

FROM base AS deps

WORKDIR /app
COPY pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/root/.pnpm-store/v3 pnpm install

FROM base AS build

WORKDIR /app
COPY src ./
COPY prisma ./
COPY tsconfig*.json ./
COPY nest-cli.json ./
COPY --from=deps /app/node_modules ./node_modules
RUN pnpm build
RUN pnpm prune --prod

FROM base AS final
WORKDIR /app
COPY .env ./
COPY --from=build /app/dist/ ./dist/
COPY --from=build /app/node_modules ./node_modules

RUN pnpm prisma generate --no-engine
RUN pnpm prisma migrate deploy

CMD [ "node", "dist/main.js" ]
