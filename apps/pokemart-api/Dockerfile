FROM node:22.18.0-alpine
WORKDIR /app
RUN apk add --no-cache curl
COPY package.json package-lock.json ./
COPY apps/pokemart-api/package.json apps/pokemart-api/package.json
COPY apps/bff/package.json apps/bff/package.json
RUN npm ci --omit=dev
COPY apps/pokemart-api apps/pokemart-api
WORKDIR /app/apps/pokemart-api
EXPOSE 3000
CMD ["npm", "run", "start"]
