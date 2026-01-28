# Agent Hub 🤖

A centralized platform for managing AI agents with a modern web interface. Built as a lightweight, open-source alternative to proprietary AI IDEs.

![Agent Hub](https://img.shields.io/badge/Status-Alpha-yellow)
![Next.js](https://img.shields.io/badge/Next.js-15-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)

## ✨ Features

### CLI Chat
- **Real Gemini CLI integration** - Uses your authenticated Gemini CLI, not API keys
- **Token statistics** - Track usage per message (tokens, response time)
- **Project context** - Conversations are scoped to a project path
- **Markdown rendering** - Full markdown support with syntax highlighting

### Terminal Hub
- **Multi-project terminals** - Manage multiple PTY sessions via WebSocket
- **Real-time streaming** - Live terminal output in browser
- **Session persistence** - Sessions survive page reloads

### Dashboard
- **Modern UI** - Dark glassmorphism design
- **Connection status** - Real-time daemon health monitoring
- **Project switching** - Quick navigation between projects

## ⚠️ Limitations (vs Antigravity/Cursor)

| Feature | Agent Hub | Antigravity/Cursor |
|---------|-----------|-------------------|
| **Code editing** | ❌ No | ✅ Full file editing |
| **Codebase search** | ❌ No | ✅ Semantic search |
| **Auto-complete** | ❌ No | ✅ AI completions |
| **Tool use** | ❌ No | ✅ File/terminal tools |
| **Multi-model** | 🟡 Gemini only | ✅ Claude, GPT, Gemini |
| **Context window** | 🟡 Manual | ✅ Automatic indexing |
| **Streaming** | 🟡 Buffered* | ✅ Token-by-token |

*\* Gemini CLI buffers output - tokens arrive in chunks, not individually*

### What Agent Hub IS:
- A **chat interface** using the Gemini CLI
- A **terminal manager** for multiple projects
- A **learning project** for understanding AI agent architecture

### What Agent Hub is NOT:
- A full IDE replacement
- An agentic coding assistant (no file modifications)
- A production-ready tool

## 🏗 Architecture

```
AgentHub/
├── daemon/           # WebSocket daemon (Node.js)
│   └── src/
│       ├── index.ts              # Main server (:3100)
│       ├── terminal-manager.ts   # PTY session management
│       ├── cli-chat-manager.ts   # Gemini CLI wrapper
│       └── cli-parser.ts         # stream-json output parser
├── website/          # Next.js web application (:3000)
│   └── app/
│       ├── cli-chat/             # Chat interface
│       ├── terminals/            # Terminal management
│       ├── brainstorm/           # Multi-agent brainstorm
│       └── antigravity/          # Conversation import
└── .env.example      # Environment template
```

## 🚀 Getting Started

### Prerequisites

- **Node.js 20+**
- **Gemini CLI** installed and authenticated
  ```bash
  npm i -g @anthropic-ai/gemini-cli
  gemini  # Follow auth prompts
  ```

### Installation

```bash
# Clone the repository
git clone https://github.com/ateliersam86/AgentHub.git
cd AgentHub

# Install dependencies
cd daemon && npm install && cd ..
cd website && npm install && cd ..

# Copy environment template (optional)
cp .env.example .env
```

### Running

```bash
# Terminal 1: Start the daemon
cd daemon && npm run dev

# Terminal 2: Start the website
cd website && npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## 🔌 How It Works

### CLI Chat Flow
```
Browser → WebSocket → Daemon → spawn gemini -o stream-json → Parse JSON → WebSocket → Browser
```

The daemon spawns `gemini -o stream-json -p "your message"` for each message, parses the streaming JSON output, and forwards events to the browser.

### Why CLI instead of API?
- **OAuth authentication** - Uses your Google account quota, not API keys
- **No billing** - Included with Gemini Advanced subscription
- **Same capabilities** - Full Gemini 2.0 Flash model

## 🔧 Environment Variables

All optional - the project works without any configuration:

| Variable | Description |
|----------|-------------|
| `DAEMON_AUTH_TOKEN` | Custom auth token (auto-generated if empty) |
| `GEMINI_PROJECT_ID` | GCP project ID for API mode |
| `GEMINI_OAUTH_CLIENT_ID` | For token refresh (API mode only) |
| `GEMINI_OAUTH_CLIENT_SECRET` | For token refresh (API mode only) |

## 🛠 Tech Stack

- **Frontend**: Next.js 15, React, TailwindCSS
- **Backend**: Node.js, WebSocket (ws), node-pty
- **CLI**: Gemini CLI with stream-json output

## 🗺 Roadmap (Maybe)

- [ ] Multi-model support (Claude, Codex)
- [ ] Conversation history/database
- [ ] File context injection
- [ ] Basic code editing

## 📄 License

MIT

---

Built with ❤️ as a learning project for AI agent architecture
