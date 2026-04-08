# Auth Service Dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Port configuration via environment variable
ENV PORT=4001
EXPOSE 4001

CMD ["node", "src/server.js"]
