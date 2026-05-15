FROM node:24.10.0-alpine AS build

WORKDIR /usr/src/nbflix-backend

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN npm run build

RUN rm -rf node_modules
RUN npm ci --omit=dev
RUN npx prisma generate


FROM node:24.10.0-alpine AS start

WORKDIR /usr/src/nbflix-backend

COPY --from=build /usr/src/nbflix-backend/dist ./dist
COPY --from=build /usr/src/nbflix-backend/node_modules ./node_modules
COPY --from=build /usr/src/nbflix-backend/package.json ./package.json
COPY --from=build /usr/src/nbflix-backend/.env ./.env
COPY --from=build /usr/src/nbflix-backend/prisma ./prisma
COPY --from=build /usr/src/nbflix-backend/generated ./generated


EXPOSE 3333

CMD ["node", "dist/server.js"]
