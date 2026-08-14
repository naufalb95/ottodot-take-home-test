# Shared by `web` (API) and `worker` — they differ only in the command.

FROM node:22-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat

# ---- dependencies -----------------------------------------------------------
FROM base AS deps
COPY package.json yarn.lock* ./
COPY prisma ./prisma/
RUN yarn install && npx prisma generate

# ---- development ------------------------------------------------------------
# Source is bind-mounted by Compose; only node_modules (with the generated
# Prisma client) needs to be baked in.
FROM base AS dev
ENV NODE_ENV=development
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
CMD ["yarn", "dev"]
