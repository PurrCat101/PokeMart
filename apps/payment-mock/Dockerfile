FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/payment-mock/package.json apps/payment-mock/package.json
RUN npm ci --workspace=@pokemart/payment-mock
COPY apps/payment-mock apps/payment-mock
CMD ["npm", "run", "start", "--workspace=@pokemart/payment-mock"]
