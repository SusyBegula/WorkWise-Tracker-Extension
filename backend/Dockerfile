FROM node:20-slim
WORKDIR /app

# Install deps first for layer caching. npm ci requires package-lock.json.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

# Backend listens on PORT (default 3000). Render injects PORT at runtime.
EXPOSE 3000
ENV NODE_ENV=production

CMD ["npm", "start"]
