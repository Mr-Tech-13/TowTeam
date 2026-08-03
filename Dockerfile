FROM node:20-bookworm-slim AS build
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip \
  && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
COPY requirements.txt ./
RUN python3 -m pip install --break-system-packages -r requirements.txt
RUN npm install
COPY . .
RUN npm run build

FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip \
  && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
COPY requirements.txt ./
RUN python3 -m pip install --break-system-packages -r requirements.txt
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
COPY server ./server
COPY migrations ./migrations
COPY seed ./seed
RUN mkdir -p /app/data
EXPOSE 8080
CMD ["npm", "run", "start"]
