# One image for both Render services (docs/decisions/0014-hosting-and-job-queue.md):
# the web service runs `next start`, the worker runs worker/index.ts (render.yaml).
#
# Dev dependencies stay installed: the worker runs TypeScript through tsx, and the
# worker's pre-deploy command runs migrations through drizzle-kit.

FROM node:26-slim

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
# The Supabase CLI is for the local database only (npm run db:start); deployed, everything
# connects through DATABASE_URL. Its binary is the largest package in the image.
RUN npm ci && npm cache clean --force \
  && rm -rf node_modules/supabase node_modules/@supabase/cli-* node_modules/.bin/supabase

COPY . .

# Placeholders so the build doesn't need real services, as in CI; nothing connects at
# build time. Set for this step only, so they never reach the running containers.
RUN DATABASE_URL=postgres://build:build@localhost:5432/build \
    BETTER_AUTH_SECRET=build-placeholder-secret \
    BETTER_AUTH_URL=http://localhost:3000 \
    SMTP_URL=smtp://localhost:1025 \
    EMAIL_FROM=build@example.com \
    npm run build \
  && chown -R node:node .next

ENV NODE_ENV=production
USER node

# The web service. The worker overrides this with its own command (render.yaml).
# Run without npm in between, so Render's SIGTERM reaches the server directly.
CMD ["node_modules/.bin/next", "start"]
