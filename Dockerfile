FROM docker.io/node:22-alpine AS base

RUN npm i -g pnpm@11

FROM base AS deps

WORKDIR /app
COPY package.json ./
COPY pnpm-lock.yaml ./
COPY pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/root/.pnpm-store/v3 pnpm install --frozen-lockfile

FROM deps AS build

WORKDIR /app
COPY ./prisma ./prisma/
COPY ./prisma.config.ts ./
COPY ./src ./src/
COPY ./tsconfig*.json ./
COPY ./nest-cli.json ./
COPY --from=deps /app/node_modules ./node_modules/
RUN DATABASE_URL="postgresql://build-placeholder" pnpm prisma generate
RUN pnpm build
RUN pnpm prune --prod

FROM base AS final
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/pnpm-lock.yaml ./
COPY --from=build /app/pnpm-workspace.yaml ./
COPY --from=build /app/dist ./dist/
COPY --from=build /app/node_modules ./node_modules/
COPY ./public ./public/
COPY ./views ./views/
COPY ./prisma ./prisma/
COPY ./prisma.config.ts ./
COPY docker-entrypoint.sh /app/

ENTRYPOINT [ "/app/docker-entrypoint.sh" ]
