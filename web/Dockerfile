# Jottem web - EUPL-1.2
FROM node:22-alpine AS bouw
WORKDIR /bouw
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY . .
ARG NEXT_PUBLIC_API_URL=https://api.dev.iotm.nl
ARG NEXT_PUBLIC_DEV_AUTH=0
ARG NEXT_PUBLIC_OIDC_ISSUER=https://auth.dev.iotm.nl/application/o/jottem/
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL NEXT_PUBLIC_DEV_AUTH=$NEXT_PUBLIC_DEV_AUTH \
    NEXT_PUBLIC_OIDC_ISSUER=$NEXT_PUBLIC_OIDC_ISSUER
RUN npm run build

FROM node:22-alpine
WORKDIR /srv/web
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
COPY --from=bouw /bouw/.next/standalone ./
COPY --from=bouw /bouw/.next/static ./.next/static
COPY --from=bouw /bouw/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
