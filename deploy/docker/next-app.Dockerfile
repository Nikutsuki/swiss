FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS deps
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps ./apps
COPY packages ./packages
COPY services ./services
RUN --mount=type=cache,target=/pnpm/store pnpm install --frozen-lockfile

FROM deps AS builder
ARG APP_DIR
ARG APP_NAME
WORKDIR /repo
RUN pnpm --filter ${APP_NAME} build
RUN pnpm deploy --filter ${APP_NAME} --prod /out
RUN cp -R ${APP_DIR}/.next /out/.next
RUN cp -R ${APP_DIR}/public /out/public || true

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0

COPY --from=builder /out ./

EXPOSE 3000
CMD ["pnpm", "start"]
