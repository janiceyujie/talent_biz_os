# One image for both Render services (docs/decisions/0014-hosting-and-job-queue.md):
# the web service runs `next start`, the worker runs dist/worker.cjs (render.yaml).
#
# Two stages: the build stage has every dependency; the image that runs has only the
# production ones, plus what the build produced (.next, and dist/ from npm run build:worker).

FROM node:26-slim AS build

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Version skew: each deploy's id, so a browser holding a page from the previous deploy
# reloads instead of calling Server Functions or loading assets that no longer exist.
# Render passes the commit as a build argument; it must match at build and at runtime.
ARG RENDER_GIT_COMMIT
ENV NEXT_DEPLOYMENT_ID=$RENDER_GIT_COMMIT

# Error reporting (lib/errors). The browser's settings are built into its code: the
# DSN (public by design) and the environment. Render passes each env var as a build
# argument; none of these is a secret.
ARG DEPLOY_ENV
ARG NEXT_PUBLIC_SENTRY_DSN
ARG SENTRY_ORG
ARG SENTRY_PROJECT

# Placeholders so the build doesn't need real services, as in CI; nothing connects at
# build time. Set for this step only, and this stage isn't the one that runs.
#
# Sentry's token uploads the source maps (next.config.ts). It's a Render secret file,
# mounted for this step only, so no layer of the image holds it; without it (CI,
# laptops) nothing is uploaded. Then every source map is deleted, so none is shipped.
RUN --mount=type=secret,id=sentry_auth_token,required=false \
    SENTRY_AUTH_TOKEN="$(cat /run/secrets/sentry_auth_token 2>/dev/null)" \
    NEXT_PUBLIC_DEPLOY_ENV="$DEPLOY_ENV" \
    DATABASE_URL=postgres://build:build@localhost:5432/build \
    BETTER_AUTH_SECRET=build-placeholder-secret \
    BETTER_AUTH_URL=http://localhost:3000 \
    SMTP_URL=smtp://localhost:1025 \
    EMAIL_FROM=build@example.com \
    npm run build \
  && npm run build:worker \
  && find .next -name '*.map' -delete \
  && rm -rf .next/cache


FROM node:26-slim

WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ARG RENDER_GIT_COMMIT
ENV NEXT_DEPLOYMENT_ID=$RENDER_GIT_COMMIT

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build /app/dist ./dist
COPY public ./public
COPY drizzle ./drizzle
COPY assets/document-templates/content ./assets/document-templates/content
COPY next.config.ts ./

USER node

# The web service. The worker overrides this with its own command (render.yaml).
# Run without npm in between, so Render's SIGTERM reaches the server directly.
CMD ["node_modules/.bin/next", "start"]
