# ─────────────────────────────────────────────────────────────────────────────
# BharatShop — container image
# Single-stage build: keeps devDependencies (drizzle-kit) available at runtime
# because `npm start` runs `drizzle-kit push --force` to sync the schema
# (including the new product_images table) before `next start`.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS app

WORKDIR /app

# Install deps first for better layer caching
COPY package.json package-lock.json* ./
RUN npm install

# Copy the rest of the source and build
COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# DATABASE_URL and SEARXNG_URL are provided at runtime via the platform's
# environment variables (see render.yaml) — never baked into the image.
CMD ["npm", "start"]
