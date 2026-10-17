FROM node:22.18.0-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/pokemart-api/package.json apps/pokemart-api/package.json
COPY apps/bff/package.json apps/bff/package.json
RUN npm ci --omit=dev
COPY apps/bff apps/bff
WORKDIR /app/apps/bff
EXPOSE 3001
CMD ["npm", "run", "start"]
