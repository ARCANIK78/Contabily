# syntax=docker/dockerfile:1

# ============================================================
# Multi-stage: build con todas las dependencias, runtime mínimo.
# El objetivo es que la imagen final no arrastre typescript,
# @nestjs/cli ni el resto de devDependencies.
# ============================================================

# ---------- base: node con el pnpm que fija package.json#packageManager
FROM node:22-alpine AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

# ---------- dependencias completas: necesarias para compilar
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ---------- build: src/ -> dist/
FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json pnpm-lock.yaml tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN pnpm build

# ---------- dependencias de producción: solo lo que corre la app
FROM base AS prod-deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

# ---------- runtime
FROM node:22-alpine AS runtime
ENV NODE_ENV=production

# TZ para que las fechas contables no dependan del huso de la imagen.
RUN apk add --no-cache tzdata

WORKDIR /app

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# package.json hace falta para que pnpm/node reconozcan "type": "module",
# sin eso los .js compilados se interpretan como CommonJS y todo revienta.
COPY package.json ./

EXPOSE 3000

USER node

# No healthcheck aquí: el orquestador (Render) ya hace el suyo contra /health.
CMD ["node", "dist/main.js"]
