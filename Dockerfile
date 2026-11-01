# Stage 1: Build the React + TypeScript application
FROM node:20-alpine AS builder

WORKDIR /app

# Accept build-time environment variables for Vite
ARG VITE_API_BASE=https://api.famoacademy.ir/api/v1
ARG VITE_MAIN_SITE_URL=https://famoacademy.ir
ARG VITE_AUTH_URL=https://auth.famoacademy.ir
ENV VITE_API_BASE=$VITE_API_BASE
ENV VITE_MAIN_SITE_URL=$VITE_MAIN_SITE_URL
ENV VITE_AUTH_URL=$VITE_AUTH_URL

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm install

# Copy source code and build production bundle
COPY . .
RUN npm run build

# Stage 2: Serve static files with Nginx
FROM nginx:stable-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
