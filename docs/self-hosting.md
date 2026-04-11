# Self-Hosting Guide

## Docker (Recommended)

```bash
git clone https://github.com/your-username/sibercron.git
cd sibercron

# Copy and configure environment variables
cp .env.example .env

# Start all services
docker compose -f docker/docker-compose.yml up -d
```

Services:
- **Editor**: http://localhost:5173
- **API Server**: http://localhost:3001
- **Redis**: localhost:6379

## Manual Setup

### Prerequisites
- Node.js >= 18
- pnpm >= 9
- Redis (optional, for BullMQ queue)

### Steps

```bash
# Install dependencies
pnpm install

# Build all packages (order matters: shared -> core -> nodes -> server -> editor)
pnpm build

# Start server
cd packages/server && pnpm start

# In another terminal, start editor
cd packages/editor && pnpm preview
```

### Environment Variables

See `.env.example` for all available configuration options.

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 3001 | API server port |
| REDIS_URL | redis://localhost:6379 | Redis connection URL |
| ENCRYPTION_KEY | (dev default) | AES-256 key for credential encryption |
| CORS_ORIGIN | http://localhost:5173 | Allowed CORS origin |
| OPENAI_API_KEY | (none) | OpenAI API key for AI nodes |
| ANTHROPIC_API_KEY | (none) | Anthropic API key for AI nodes |
