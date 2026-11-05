FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/kyc-api/package.json apps/kyc-api/package.json
RUN npm ci --workspace=@pokemart/kyc-api
COPY apps/kyc-api apps/kyc-api
CMD ["npm", "run", "start", "--workspace=@pokemart/kyc-api"]
