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

# Default plan storage location
ENV PLAN_FILE=/config/plan.json

# Create config directory for plan storage
RUN mkdir -p /config

# Entry point
ENTRYPOINT ["bun", "run", "src/main.ts"]

# Default command shows help
CMD ["--help"]
