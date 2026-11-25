# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim
WORKDIR /opt/repharbor
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NODE_USE_ENV_PROXY=1
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl && apt-get clean && corepack enable pnpm
RUN chown node:node /opt/repharbor
USER node
COPY --chown=node:node . .
RUN --mount=type=secret,id=proxy_ca,uid=1000,gid=1000 \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    pnpm install --frozen-lockfile && pnpm contracts:build && pnpm db:generate && pnpm --filter @repharbor/api build
ENV NODE_ENV=production
WORKDIR /opt/repharbor/apps/api
CMD ["node", "dist/main.js"]
