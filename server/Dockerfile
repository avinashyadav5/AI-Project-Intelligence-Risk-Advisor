FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma/
RUN npx prisma generate

COPY . .

EXPOSE 5000

# We use a script to ensure the db is pushed before starting
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && npm run dev"]
