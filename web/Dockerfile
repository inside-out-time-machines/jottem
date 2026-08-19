# Jottem web - EUPL-1.2
FROM node:22-alpine AS bouw
WORKDIR /bouw
COPY package.json package-lock.json ./
# npm ci gebruikt de gecommitte lockfile: reproduceerbare build, exact dezelfde
# afhankelijkheden als lokaal getest
RUN npm ci --no-audit --no-fund
COPY . .
ARG NEXT_PUBLIC_API_URL=https://api.dev.iotm.nl
ARG NEXT_PUBLIC_DEV_AUTH=0
ARG NEXT_PUBLIC_OIDC_ISSUER=https://auth.dev.iotm.nl/application/o/jottem/
ARG NEXT_PUBLIC_DEV_SUB=dev-piet
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL NEXT_PUBLIC_DEV_AUTH=$NEXT_PUBLIC_DEV_AUTH \
    NEXT_PUBLIC_OIDC_ISSUER=$NEXT_PUBLIC_OIDC_ISSUER NEXT_PUBLIC_DEV_SUB=$NEXT_PUBLIC_DEV_SUB
RUN npm run build

FROM node:22-alpine
WORKDIR /srv/web
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
COPY --from=bouw /bouw/.next/standalone ./
COPY --from=bouw /bouw/.next/static ./.next/static
COPY --from=bouw /bouw/public ./public
# het node-image levert de gebruiker `node` (uid 1000); draaien als root is nergens voor nodig
USER node
EXPOSE 3000
CMD ["node", "server.js"]
