FROM node:22.18.0-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/shipping-mock/package.json apps/shipping-mock/package.json
RUN npm ci --omit=dev
COPY apps/shipping-mock apps/shipping-mock
WORKDIR /app/apps/shipping-mock
EXPOSE 3002
CMD ["npm", "run", "start"]
