FROM oven/bun:1.3-alpine

# Install rsync for file transfers
RUN apk add --no-cache rsync

WORKDIR /app

# Copy package files
COPY package.json bun.lock ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY src ./src
COPY tsconfig.json ./
COPY vite.config.ts ./

# Build the frontend
RUN bun run web:build

# Create config directory for plan storage
RUN mkdir -p /config

# Entry point runs web server
ENTRYPOINT ["bun", "run", "src/cli/main.ts", "web"]
