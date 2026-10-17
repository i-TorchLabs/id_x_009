FROM node:24-alpine AS build

WORKDIR /app

ARG NEXT_PUBLIC_BASE_URL
ARG NEXT_PUBLIC_SUB_VERSION

COPY package.json ./
RUN npm install --registry=https://registry.npmmirror.com

COPY . .

ENV NEXT_PUBLIC_BASE_URL=${NEXT_PUBLIC_BASE_URL} \
    NEXT_PUBLIC_SUB_VERSION=${NEXT_PUBLIC_SUB_VERSION}

RUN npm run build

FROM node:24-alpine

WORKDIR /app

ENV NODE_ENV=production \
    PORT=2000 \
    HOSTNAME=0.0.0.0

COPY --from=build /app/package.json ./

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/next.config.ts ./
COPY --from=build /app/postcss.config.mjs ./
COPY --from=build /app/tsconfig.json ./

EXPOSE 2000
CMD ["npm", "start"]
