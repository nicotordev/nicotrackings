FROM oven/bun:1.4.3 AS install

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM oven/bun:1.4.3

WORKDIR /app

COPY --from=install --chown=bun:bun /app/node_modules ./node_modules
COPY --chown=bun:bun package.json bun.lock prisma.config.ts ./
COPY --chown=bun:bun prisma ./prisma
COPY --chown=bun:bun migrations ./migrations
COPY --chown=bun:bun index.ts ./index.ts
COPY --chown=bun:bun src ./src

ENV NODE_ENV=production
EXPOSE 8080

CMD ["bun", "run", "start"]
