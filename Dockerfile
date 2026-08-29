FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .

ARG DATABASE_URL
ENV DATABASE_URL=$DATABASE_URL

RUN npm run build

ENV NODE_ENV=production

EXPOSE 3000

CMD ["npm", "run", "start"]
