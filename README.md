# Agent Hub 🤖

A centralized platform for remote terminal management and AI-powered development. Control terminals, chat with Gemini, and manage multiple projects from anywhere.

![Agent Hub](https://img.shields.io/badge/Status-Alpha-yellow)
![Next.js](https://img.shields.io/badge/Next.js-15-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)

## ✨ Features

### 🖥 Remote Terminal Hub
- **Multi-project terminals** - Manage multiple PTY sessions via WebSocket
- **Real-time streaming** - Live terminal output in browser from anywhere
- **Session persistence** - Sessions survive page reloads
- **Network accessible** - Access your dev machine terminals remotely

### 💬 CLI Chat
- **Gemini CLI integration** - Chat with AI using your authenticated CLI
- **Token statistics** - Track usage per message (tokens, response time)
- **Project context** - Conversations scoped to project paths
- **Markdown rendering** - Full markdown with syntax highlighting

### 🎛 Dashboard
- **Modern UI** - Dark glassmorphism design
- **Connection status** - Real-time daemon health monitoring
- **Project switching** - Quick navigation between projects

## 🏗 Architecture

```
AgentHub/
├── daemon/           # WebSocket daemon (Node.js) - runs on your dev machine
│   └── src/
│       ├── index.ts              # Main server (:3100)
│       ├── terminal-manager.ts   # PTY session management
│       ├── cli-chat-manager.ts   # Gemini CLI wrapper
│       └── cli-parser.ts         # stream-json output parser
├── website/          # Next.js web application (:3000)
│   └── app/
│       ├── cli-chat/             # Chat interface
│       ├── terminals/            # Terminal management
│       └── brainstorm/           # Multi-agent brainstorm
└── .env.example      # Environment template
```

## 🚀 Getting Started

### Prerequisites

- **Node.js 20+**
- **Gemini CLI** (optional, for CLI Chat)
  ```bash
  npm i -g @google/gemini-cli
  gemini  # Follow auth prompts
  ```

### Installation

```bash
git clone https://github.com/ateliersam86/AgentHub.git
cd AgentHub

# Install dependencies
cd daemon && npm install && cd ..
cd website && npm install && cd ..
```

### Running

```bash
# Terminal 1: Start the daemon
cd daemon && npm run dev

# Terminal 2: Start the website  
cd website && npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Remote Access

The daemon listens on `0.0.0.0:3100`, so you can access your terminals from any device on your network:

```
ws://YOUR_IP:3100
```

## 🔌 How It Works

```
Browser (anywhere) ←→ WebSocket ←→ Daemon (dev machine) ←→ PTY/CLI
```

The daemon runs on your development machine and exposes:
- **Terminal sessions** via node-pty
- **Gemini CLI** via spawn with stream-json output

## 🛠 Tech Stack

- **Frontend**: Next.js 15, React, TailwindCSS
- **Backend**: Node.js, WebSocket (ws), node-pty
- **CLI**: Gemini CLI with stream-json output

## 📄 License

MIT
