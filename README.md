# Telegram Package Tracker Bot

A production-ready Telegram bot that tracks packages and notifies users about status changes using the 17TRACK API.

## Features

- 📦 Track packages from international and cross-border carriers
- 🔔 Automatic notifications when package status changes
- 🏷️ Optional labels for easier package identification
- 📊 View all tracked packages with current status
- 🔄 Periodic polling for status updates
- 🪝 Optional webhook support for push notifications
- 💾 SQLite database (easily switchable to PostgreSQL)
- 🔒 Type-safe with strict TypeScript
- 📝 Structured logging with Pino

## Stack

- **Runtime:** Node.js 18+ with ESM modules
- **Language:** TypeScript (strict mode)
- **Bot Framework:** grammY
- **Database:** Prisma with SQLite (PostgreSQL-ready)
- **Tracking API:** 17TRACK API v2
- **Configuration:** dotenv + Zod validation
- **Logging:** Pino

## Prerequisites

1. **Node.js 18+** - [Download](https://nodejs.org/)
2. **Telegram Bot Token** - Get from [@BotFather](https://t.me/botfather)
3. **17TRACK API Key** - Register at [17TRACK API](https://api.17track.net/)

## Getting Started

### 1. Create a Telegram Bot

1. Open Telegram and search for [@BotFather](https://t.me/botfather)
2. Send `/newbot` and follow the instructions
3. Choose a name and username for your bot
4. Copy the bot token provided by BotFather

### 2. Get 17TRACK API Key

1. Visit [17TRACK API Registration](https://api.17track.net/en/register)
2. Sign up for an account
3. Navigate to the API section in your dashboard
4. Copy your API key

### 3. Clone and Install

```bash
# Install dependencies
npm install

# Generate Prisma client
npm run prisma:generate
```

### 4. Configure Environment

Create a `.env` file in the root directory:

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather
TRACK17_API_KEY=your_17track_api_key
DATABASE_URL="file:./dev.db"
POLL_INTERVAL_MS=300000
```

### 5. Initialize Database

Run the initial migration:

```bash
npm run prisma:migrate
```

When prompted for a migration name, you can use: `init`

### 6. Start the Bot

**Development mode** (with auto-reload):
```bash
npm run dev
```

**Production mode:**
```bash
# Build the project
npm run build

# Run the built code
npm start
```

## Usage

### Commands

- `/start` - Welcome message and overview
- `/help` - Show help and available commands
- `/track <number> [label]` - Track a new package
  - Example: `/track 1234567890 iPhone Case`
- `/list` - View all your tracked packages
- `/status <number>` - Get current status of a package
  - Example: `/status 1234567890`
- `/remove <number>` - Stop tracking a package
  - Example: `/remove 1234567890`

### Quick Tracking

Send just a tracking number (without any command) to quickly register it:
```
1234567890
```

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TELEGRAM_BOT_TOKEN` | Yes | - | Your Telegram bot token from BotFather |
| `TRACK17_API_KEY` | Yes | - | Your 17TRACK API key |
| `DATABASE_URL` | Yes | `file:./dev.db` | Database connection string |
| `POLL_INTERVAL_MS` | No | `300000` | Polling interval in milliseconds (5 minutes) |
| `WEBHOOK_ENABLED` | No | `false` | Enable webhook mode for push notifications |
| `WEBHOOK_URL` | No | - | URL for webhook endpoint |
| `WEBHOOK_SECRET` | No | - | Secret for webhook signature verification |
| `WEBHOOK_PORT` | No | `3000` | Port for webhook server |
| `LOG_LEVEL` | No | `info` | Logging level (trace, debug, info, warn, error, fatal) |
| `NODE_ENV` | No | `development` | Environment (development, production, test) |

### Switching to PostgreSQL

1. Install PostgreSQL and create a database
2. Update `DATABASE_URL` in `.env`:
   ```env
   DATABASE_URL="postgresql://user:password@localhost:5432/package_tracker?schema=public"
   ```
3. Update `prisma/schema.prisma`:
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```
4. Run migrations:
   ```bash
   npm run prisma:migrate
   ```

## Project Structure

```
.
├── prisma/
│   └── schema.prisma          # Database schema
├── src/
│   ├── bot/
│   │   ├── index.ts           # Bot setup and initialization
│   │   └── handlers.ts        # Command handlers
│   ├── config/
│   │   └── env.ts             # Environment configuration and validation
│   ├── db/
│   │   └── client.ts          # Prisma client setup
│   ├── services/
│   │   ├── tracking/
│   │   │   ├── types.ts       # Tracking provider interface
│   │   │   ├── track17.ts     # 17TRACK implementation
│   │   │   └── index.ts       # Service exports
│   │   └── notifier.ts        # Polling and notification service
│   ├── utils/
│   │   └── logger.ts          # Logging configuration
│   └── index.ts               # Application entry point
├── .env.example               # Environment variables template
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

## Development

### Available Scripts

- `npm run dev` - Start in development mode with auto-reload
- `npm run build` - Build for production
- `npm start` - Run production build
- `npm run typecheck` - Run TypeScript type checking
- `npm run lint` - Lint code with ESLint
- `npm run prisma:generate` - Generate Prisma client
- `npm run prisma:migrate` - Create and apply a new migration
- `npm run prisma:migrate:deploy` - Apply migrations in production
- `npm run prisma:studio` - Open Prisma Studio (database GUI)

### Adding New Tracking Providers

The tracking provider is abstracted behind an interface. To add AfterShip or another provider:

1. Create a new provider in `src/services/tracking/` implementing the `TrackingProvider` interface
2. Update `src/services/tracking/index.ts` to allow provider selection
3. Add provider-specific configuration to `src/config/env.ts`

Example structure:
```typescript
export class AfterShipProvider implements TrackingProvider {
  readonly name = 'AfterShip';
  
  async register(request: RegisterTrackingRequest): Promise<RegisterTrackingResponse> {
    // Implementation
  }
  
  async getTrackingInfo(trackingNumber: string): Promise<TrackingInfo | null> {
    // Implementation
  }
  
  async batchGetTrackingInfo(trackingNumbers: string[]): Promise<Map<string, TrackingInfo>> {
    // Implementation
  }
}
```

## Production Deployment

### Using PM2

```bash
# Install PM2
npm install -g pm2

# Build the project
npm run build

# Start with PM2
pm2 start dist/index.js --name package-tracker

# Save PM2 configuration
pm2 save
pm2 startup
```

### Using Docker

Create a `Dockerfile`:
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build
RUN npm run prisma:generate

CMD ["npm", "start"]
```

Build and run:
```bash
docker build -t package-tracker .
docker run -d --env-file .env --name package-tracker package-tracker
```

## Troubleshooting

### Database Issues

**Migration errors:**
```bash
# Reset database (WARNING: deletes all data)
rm dev.db
npm run prisma:migrate
```

**Prisma client not generated:**
```bash
npm run prisma:generate
```

### Bot Not Responding

1. Check bot token is correct
2. Ensure bot is not already running elsewhere
3. Verify network connectivity
4. Check logs for error messages

### Tracking API Issues

1. Verify 17TRACK API key is valid
2. Check API rate limits
3. Ensure tracking numbers are valid
4. Review logs for API error responses

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

For issues and questions:
- Check the [17TRACK API Documentation](https://api.17track.net/en/doc)
- Review [grammY Documentation](https://grammy.dev/)
- Open an issue in this repository
