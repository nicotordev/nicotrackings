<div align="center">
  <img src="public/logo.png" alt="NicoTrackings Logo" width="180" />
  <h1>📦 NicoTrackings</h1>
  <p><strong>Telegram Bot for International Package Tracking with Real-Time Webhooks & Automated Notifications.</strong></p>
  <p>
    <a href="https://bun.sh"><img src="https://img.shields.io/badge/Bun-1.2+-black?logo=bun" alt="Bun" /></a>
    <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.8+-blue?logo=typescript" alt="TypeScript" /></a>
    <a href="https://grammy.dev/"><img src="https://img.shields.io/badge/Telegram-grammY-2CA5E0?logo=telegram" alt="grammY" /></a>
    <a href="https://www.prisma.io/"><img src="https://img.shields.io/badge/Prisma-PostgreSQL-2D3748?logo=prisma" alt="Prisma" /></a>
    <a href="https://parcelsapp.com/developers/docs"><img src="https://img.shields.io/badge/Parcels-API%20v4-2F6F4E" alt="Parcels" /></a>
  </p>
</div>

---

## 🌟 Key Features

- 🌍 **Multi-Carrier Coverage**: Track packages across international carriers (DHL, FedEx, UPS, USPS, China Post, Correos, and more) via the **Parcels API v4**.
- ⚡ **Request Webhooks**: Each lookup can ask Parcels to POST the finished result to `/webhooks/parcels`. The `Parcels-Signature` header is HMAC-SHA256 over `timestamp.body`.
- 🔔 **Polling**: A cron job re-checks active packages (10 numbers per request). Parcels webhooks finish one request; they do not keep watching a shipment.
- 📱 **Interactive Telegram Commands**:
  - `/start` & `/help`: Interactive setup and command guide.
  - `/track <number> [country] [name]`: Register a tracking number. A two-letter country code is the destination (e.g. `/track RR123456789CN ES Keycaps`).
  - `/list`: Overview of all your tracked packages with real-time status badges.
  - `/status <number>`: Detailed timeline including carrier name, current milestone, and chronological checkpoints.
  - `/remove <number>`: Stop tracking and remove a package from your personal dashboard.
- 🧠 **Smart Auto-Detection**: Paste any tracking number directly into the Telegram conversation without typing `/track`, and the bot automatically registers and monitors it.
- 🛡️ **Type-Safe & Scalable**: Built on **Bun**, **TypeScript**, **Prisma ORM**, and **PostgreSQL** with high test coverage using Bun's native test runner.

---

## 📁 Project Structure

```
nicotrackings/
├── public/
│   └── logo.png              # Project logo
├── prisma/
│   └── schema.prisma         # Prisma schema (User, Package, TrackingEvent)
├── src/
│   ├── bot/
│   │   ├── commands/         # Telegram command handlers
│   │   │   ├── start.ts      # /start and /help
│   │   │   ├── track.ts      # /track <number> [name]
│   │   │   ├── list.ts       # /list
│   │   │   ├── status.ts     # /status <number>
│   │   │   ├── remove.ts     # /remove <number>
│   │   │   └── index.ts      # Command router & regex auto-detection
│   │   └── index.ts          # grammY bot setup, error handling & commands menu
│   ├── db/
│   │   ├── client.ts         # Prisma client singleton
│   │   └── packages.ts       # Database helper queries for packages & events
│   └── services/
│       ├── tracking.ts       # Parcels API v4 client (lookup, batch, signatures)
│       ├── notifier.ts       # HTML message formatters & Telegram alert dispatcher
│       ├── poller.ts         # Cron service for periodic status checks
│       └── webhook.ts        # Parcels webhook handler with signature verification
├── tests/
│   ├── db.test.ts            # Database integration tests
│   ├── notifier.test.ts      # Message formatting and badge tests
│   └── tracking.test.ts      # Parcels parser, signature, and client tests
├── .env.example              # Environment variables template
├── bun.lock                  # Bun lockfile
├── index.ts                  # Application entry point & Bun HTTP server
├── package.json
└── tsconfig.json
```

---

## 🚀 Quick Start Guide

### 1. Prerequisites

- [Bun](https://bun.sh/) (v1.0 or higher recommended)
  ```bash
  curl -fsSL https://bun.sh/install | bash
  ```
- [PostgreSQL](https://www.postgresql.org/) (v15 or higher) running locally or remotely.

### 2. Clone and Install Dependencies

```bash
git clone https://github.com/nicotordev/nicotrackings.git
cd nicotrackings
bun install
```

---

### 3. Setup Your Telegram Bot (`@BotFather`)

1. Open Telegram and message [`@BotFather`](https://t.me/BotFather).
2. Send `/newbot` and follow the instructions to set up your bot's name and username (e.g. `nicotrackings_bot`).
3. Copy the **HTTP API Token** provided by BotFather (`BOT_TOKEN`).

*(Optional)* Configure bot menu commands in BotFather with `/setcommands`:
```
track - Track a new package (/track <number> [name])
list - List all your tracked packages
status - Check detailed status of a package
remove - Stop tracking and remove a package
help - Show help and usage guide
```

---

### 4. Obtain a Parcels API key

1. Open the [Parcels API docs](https://parcelsapp.com/developers/docs) and create an API key.
2. Put it in `PARCELS_API_KEY`. The bot sends it as `Authorization: Bearer`.
3. Ordinary parcel numbers need a destination country: set `PARCELS_DESTINATION_COUNTRY` or pass it in the command (`/track NUMBER ES`).

The bot sends `webhook_url` on each lookup. On Railway that URL is `https://$RAILWAY_PUBLIC_DOMAIN/webhooks/parcels`. Override it with `PARCELS_WEBHOOK_URL` when you are not on Railway. Parcels requires HTTPS in production.

---

### 5. Configure Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Edit `.env` and set your configuration:

```env
# Telegram Bot Token from @BotFather
BOT_TOKEN=123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ

# Parcels API key (https://parcelsapp.com/developers/docs)
PARCELS_API_KEY=your_parcels_api_key_here

# PostgreSQL connection string
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/nicotrackings"

# Cron schedule for polling package updates (default: every 15 minutes)
POLL_INTERVAL_CRON="*/15 * * * *"

# Optional. Defaults to https://$RAILWAY_PUBLIC_DOMAIN/webhooks/parcels
# PARCELS_WEBHOOK_URL=https://example.com/webhooks/parcels
# WEBHOOK_PORT=3000
```

---

### 6. Initialize the Database

Generate Prisma client and sync database schema:

```bash
bun run db:push
```

---

### 7. Run the Bot

**Development mode (with auto-reload on changes):**
```bash
bun run dev
```

**Production mode:**
```bash
bun run start
```

---

## 🧪 Running Tests

Unit and integration tests are executed using Bun's native test runner:

```bash
bun test
```

---

## 🗄️ Database Management

- Sync Prisma Schema with DB:
  ```bash
  bun run db:push
  ```
- Generate Prisma Client:
  ```bash
  bun run db:generate
  ```
- Plan database migrations:
  ```bash
  bun run db:migrate
  ```

---

## 📄 License

MIT © [nicotordev](https://github.com/nicotordev)
