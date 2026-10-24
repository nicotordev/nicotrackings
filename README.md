# 📦 NicoTrackings

> **Telegram Bot for International Package Tracking with Automated Status Change Notifications.**

Built with **TypeScript**, **Bun**, **grammY**, **Prisma**, **SQLite**, and the **17TRACK API v2.2**.

---

## 🌟 Features

- 🌍 **Multi-Carrier Coverage**: Track packages across hundreds of international carriers (DHL, FedEx, UPS, USPS, China Post, Correos de Chile, Correos de España, and more) through the 17TRACK API.
- 🔔 **Automated Status Notifications**: A background cron poller periodically queries tracking checkpoints and immediately notifies users via Telegram when a status change is detected.
- ⚡ **Lightning-Fast & Lightweight**: Powered by Bun and SQLite via Prisma ORM for quick setup and zero-friction deployment.
- 📱 **User-Friendly Commands**:
  - `/start` & `/help`: Interactive welcome guide with bot instructions.
  - `/track <number> [name]`: Start tracking a package with an optional custom label (e.g., `/track 1Z9999999999999999 My Mechanical Keyboard`).
  - `/list`: Overview of all your tracked packages with real-time status emojis.
  - `/status <number>`: Detailed view including carrier, current milestone, and recent checkpoint history.
  - `/remove <number>`: Stop tracking and remove a package from your list.
- 🧠 **Smart Number Detection**: Paste any tracking number directly in the chat, and the bot will automatically register and start tracking it!
- 🛡️ **Batch API Polling**: Queries up to 40 tracking numbers per HTTP request to minimize API usage and maximize efficiency.

---

## 📁 Project Structure

```
nicotrackings/
├── prisma/
│   └── schema.prisma         # Prisma schema (User & Package models)
├── src/
│   ├── bot/
│   │   ├── commands/         # Telegram command handlers
│   │   │   ├── start.ts      # /start and /help
│   │   │   ├── track.ts      # /track <number> [name]
│   │   │   ├── list.ts       # /list
│   │   │   ├── status.ts     # /status <number>
│   │   │   ├── remove.ts     # /remove <number>
│   │   │   └── index.ts      # Command router & regex listeners
│   │   └── index.ts          # grammY bot setup, error handling & command menu
│   ├── db/
│   │   └── client.ts         # Prisma client singleton
│   └── services/
│       ├── tracking.ts       # 17TRACK API client (register, fetch & batch tracking)
│       ├── notifier.ts       # Telegram message formatters & notification sender
│       └── poller.ts         # Cron service for periodic status checks
├── tests/
│   ├── db.test.ts            # Database integration tests
│   ├── notifier.test.ts      # Message formatting and badge tests
│   └── tracking.test.ts      # Tracking service and fallback tests
├── .env.example              # Template for environment variables
├── bun.lock                  # Bun lockfile
├── index.ts                  # Application entry point
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

### 2. Clone and Install Dependencies

```bash
git clone https://github.com/nicotordev/nicotrackings.git
cd nicotrackings
bun install
```

---

### 3. Setup Your Telegram Bot (`@BotFather`)

1. Open Telegram and search for [`@BotFather`](https://t.me/BotFather).
2. Send `/newbot` and follow the instructions to choose a name and username (e.g., `nicotrackings_bot`).
3. Copy the **HTTP API Token** provided by BotFather (looks like `123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ`).

*(Optional)* Configure bot commands in BotFather with `/setcommands`:
```
track - Track a new package (/track <number> [name])
list - List all your tracked packages
status - Check detailed status of a package
remove - Stop tracking and remove a package
help - Show help and usage guide
```

---

### 4. Obtain 17TRACK API Key

1. Register or sign in at the [17TRACK Developer Console](https://api.17track.net/).
2. Navigate to **API Security Key** in your dashboard.
3. Copy your Security Key (Token).
> *Note: If no API key is provided, the bot will run in sandbox/mock mode for development and local testing.*

---

### 5. Configure Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Edit `.env` and fill in your values:

```env
# Telegram Bot Token from @BotFather
BOT_TOKEN=123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ

# 17TRACK API Security Key
TRACKING_API_KEY=your_17track_api_key_here

# SQLite Database connection
DATABASE_URL="file:./dev.db"

# Cron schedule for polling package updates (default: every 15 minutes)
POLL_INTERVAL_CRON="*/15 * * * *"
```

---

### 6. Initialize Database

Generate Prisma client and sync SQLite schema:

```bash
bun run db:push
```

---

### 7. Run the Bot

**Development mode (with hot reload):**
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

- Open Prisma Studio to inspect and manage users and packages visually:
  ```bash
  bun run db:studio
  ```
- Generate Prisma Client:
  ```bash
  bun run db:generate
  ```

---

## 📄 License

MIT © [nicotordev](https://github.com/nicotordev)
