FROM node:22-alpine
RUN apk add --no-cache openssl

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY package.json package-lock.json* ./
RUN npm ci && npm cache clean --force

COPY . .
RUN npm run build:production

EXPOSE 3000

CMD ["npm", "run", "start:production"]
