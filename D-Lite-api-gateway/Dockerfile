FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV GATEWAY_PORT=4000
EXPOSE 4000

CMD ["npm", "start"]

