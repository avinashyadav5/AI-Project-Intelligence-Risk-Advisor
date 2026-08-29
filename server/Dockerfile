FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY prisma ./prisma/
RUN npx prisma generate

COPY . .

# Uploaded files live here and are backed by a named volume in compose.
RUN mkdir -p uploads

EXPOSE 5000

# Push the schema, then start with `npm start` (not `npm run dev`, which used
# to be referenced despite no such script existing, so the container exited).
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && npm start"]
