# Agent Hub 🤖

A centralized platform for managing AI agents with a modern web interface.

![Agent Hub](https://img.shields.io/badge/Status-Alpha-yellow)
![Next.js](https://img.shields.io/badge/Next.js-15-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)

## ✨ Features

- **CLI Chat** - Chat with Gemini CLI directly from the web interface
- **Terminal Hub** - Multi-project terminal sessions via WebSocket
- **Real-time Streaming** - Live output from AI agents
- **Token Statistics** - Track usage and response times
- **Modern UI** - Dark glassmorphism design

## 🏗 Architecture

```
AgentHub/
├── daemon/           # WebSocket daemon for terminal & CLI management
│   └── src/
│       ├── index.ts          # Main daemon server
│       ├── terminal-manager.ts
│       └── cli-chat-manager.ts
├── website/          # Next.js 15 web application
│   └── app/
│       ├── cli-chat/         # CLI Chat interface
│       ├── terminals/        # Terminal management
│       └── ...
└── .env.example      # Environment template
```

## 🚀 Getting Started

### Prerequisites

- Node.js 20+
- Gemini CLI installed and authenticated (`npm i -g @anthropic-ai/gemini-cli`)

### Installation

```bash
# Clone the repository
git clone https://github.com/ateliersam86/AgentHub.git
cd AgentHub

# Install dependencies
npm install
cd daemon && npm install
cd ../website && npm install

# Copy environment template
cp .env.example .env
```

### Running

```bash
# Terminal 1: Start the daemon
cd daemon && npm run dev

# Terminal 2: Start the website
cd website && npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to access the interface.

## 📸 Screenshot

CLI Chat with token statistics and real-time responses.

## 🔧 Environment Variables

Copy `.env.example` to `.env` and configure:

| Variable | Description |
|----------|-------------|
| `DAEMON_AUTH_TOKEN` | Authentication token for daemon (auto-generated if empty) |
| `GEMINI_API_KEY` | Optional: Gemini API key for direct mode |

## 🛠 Tech Stack

- **Frontend**: Next.js 15, React, TailwindCSS
- **Backend**: Node.js, WebSocket (ws)
- **Terminal**: node-pty, xterm.js
- **CLI Integration**: Gemini CLI

## 📄 License

MIT

---

Built with ❤️ for AI-powered development
