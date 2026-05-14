FROM node:alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# 👇 IMPORTANT
RUN npx prisma generate

RUN npm run build


FROM node:alpine AS production

WORKDIR /app

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./

USER appuser

EXPOSE 3001

CMD ["node", "dist/main.js"]
