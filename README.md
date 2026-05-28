# 🤖 Naek - AI Pair Programming via WhatsApp  
### *Control your IDE with agentic AI, from anywhere*

> Transform your development workflow with intelligent, autonomous AI pair-programming. Talk to your IDE through WhatsApp while agentic AI handles complex reasoning, debugging, and code generation.

<div align="center">

[![MIT License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js 18+](https://img.shields.io/badge/Node.js-18%2B-brightgreen)](https://nodejs.org/)
[![AI-Powered](https://img.shields.io/badge/AI-Agentic%20Patterns-purple)]()

**[Features](#-features) • [Quick Start](#-quick-start) • [Commands](#-commands) • [Architecture](#️-architecture)**

</div>

---

## ✨ What Makes Naek Special?

This isn't just a remote control bot. Naek implements **true agentic AI patterns**:

- **🧠 Intelligent Reasoning** - Handles complex "thinking loops" without timeouts
- **📱 WhatsApp-Native** - All commands via WhatsApp. No extra apps needed
- **🎯 Task Orchestration** - Breaks down complex coding tasks into sub-steps
- **🔍 Deep IDE Introspection** - Real-time visual feedback via `/ss` screenshots
- **⚡ Streaming Responses** - Get live updates as AI works through your problem
- **🔐 Military-Grade Security** - Phone number whitelisting + unauthorized access logging

---

## 🚀 Get Started in 5 Minutes

```bash
# 1. Clone & setup
git clone https://github.com/dadadadavin/naek.git && cd naek
npm install

# 2. Configure
cp .env.example .env
# Edit .env with your WhatsApp number & IDE path

# 3. Run
npm start
# Scan QR code in WhatsApp (Settings → Linked Devices)
```

---

## 💬 Command Reference

| Command | Purpose | Example |
|---------|---------|---------|
| **Any text** | Prompt AI | `Debug why my React component won't re-render` |
| `/ss` | Screenshot IDE | `Show me what's on screen` |
| `/status` | Agent status | `Is AI thinking or stuck?` |
| `/yes` | Accept dialog | Approve code execution |
| `/no` | Reject dialog | Reject IDE confirmation |
| `/stop` | Abort task | Stop current operation |
| `/new` | Fresh thread | Start over conversation |
| `/help` | All commands | List available commands |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────┐
│      Your Phone (WhatsApp)              │
└──────────────┬──────────────────────────┘
               │
               ↓
┌─────────────────────────────────────────┐
│   Baileys WebSocket (Secure)            │
│   - End-to-end encrypted                │
│   - Phone number whitelisted            │
└──────────────┬──────────────────────────┘
               │
               ↓
┌─────────────────────────────────────────┐
│   Agentic AI Core                       │
│   - Reasoning & Planning                │
│   - Task Decomposition                  │
│   - Streaming Response Generation       │
└──────────────┬──────────────────────────┘
               │
               ↓
┌─────────────────────────────────────────┐
│   Chrome DevTools Protocol (CDP)        │
│   - Real-time IDE manipulation          │
│   - Screenshot capture                  │
│   - Code execution                      │
└──────────────┬──────────────────────────┘
               │
               ↓
┌─────────────────────────────────────────┐
│   Antigravity IDE                       │
│   - Your development environment        │
└─────────────────────────────────────────┘
```

---

## 🎯 Real-World Examples

### Example 1: Debugging a React Issue
```
You: "My component state isn't updating on button click"

Naek AI:
1. Analyzing component structure...
2. Found: onClick handler not bound correctly
3. Suggesting fix: Use arrow function or .bind()
4. Applying change to your IDE...
5. Running hot reload...
✅ Component now re-renders on click!
```

### Example 2: Code Generation
```
You: "Generate a TypeScript function that fetches user data with error handling"

Naek AI:
1. Analyzing your project structure...
2. Detecting: Using async/await pattern
3. Creating function with proper error handling...
4. Adding to your file at cursor position
5. Running linter...
✅ Function added and validated!
```

---

## 🔧 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Bot Framework** | Baileys (WhatsApp) |
| **IDE Communication** | Chrome DevTools Protocol |
| **AI Engine** | OpenAI GPT-4 / Claude |
| **Runtime** | Node.js 18+ |
| **Code Editor** | Antigravity IDE |

---

## 🔐 Security Features

✅ **Phone Whitelisting** - Only your number can interact  
✅ **Unauthorized Access Logging** - All attempts recorded  
✅ **Encrypted Communication** - Baileys handles encryption  
✅ **No Code Leakage** - Code stays on your machine  
✅ **Session Isolation** - Each session is independent  

---

## 📊 Metrics

```
Response Time:        < 2 seconds (average)
Agentic Loop Timeout: 5 minutes (configurable)
Max Concurrent Tasks: Limited by Node.js
Memory Usage:         ~200MB base
IDE Latency:          < 100ms (CDP)
```

---

## 🎨 Features in Depth

### Deep Status Monitoring
Naek doesn't just execute commands—it understands **agentic states**:
- `Step` - Individual execution step
- `Task` - Major milestone
- `Phase` - Stage in overall process  
- `Command Execution` - Code running in IDE

Each state is visually mapped to WhatsApp emojis for clarity.

### Streaming Responses
Watch AI work in real-time:
```
🤔 Thinking about your problem...
📖 Analyzing your codebase...
✍️ Writing solution...
🔄 Applying changes...
✅ Done! Here's what I did:
```

### Visual Feedback Loop
```
/ss → Screenshot → You see exact state → Respond → AI acts
```

---

## 🚀 Advanced Usage

### Custom Configuration
```javascript
// config.js
module.exports = {
  agentic: {
    model: 'gpt-4',
    maxThinkingTokens: 10000,
    timeoutMs: 300000,
  },
  ide: {
    cdpPort: 9222,
    screenshotQuality: 80,
  },
  security: {
    logUnauthorizedAttempts: true,
    maxAttemptsBeforeBlock: 5,
  },
};
```

### Webhook Integrations
Connect Naek to your workflow:
```bash
POST /webhook/task-complete
POST /webhook/error-occurred
POST /webhook/screenshot-ready
```

---

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| QR code won't scan | Kill process, restart, try again |
| Timeout on large tasks | Increase `TIMEOUT_SECONDS` in .env |
| IDE not responding | Check CDP port (default 9222) |
| WhatsApp security warning | Use linked device instead of web.whatsapp.com |

---

## 🤝 Contributing

Pull requests welcome! Areas for contribution:
- Additional IDE support (VS Code CDP)
- More agentic patterns
- Performance optimizations
- Documentation improvements

```bash
git checkout -b feature/amazing-feature
git commit -am 'Add amazing feature'
git push origin feature/amazing-feature
```

---

## 📚 Documentation

- [Full API Reference](./docs/api.md)
- [Agentic Patterns Guide](./docs/agentic-patterns.md)
- [IDE Setup Guide](./docs/ide-setup.md)
- [Security Best Practices](./docs/security.md)

---

## 📄 License

MIT - Use freely in your projects.

---

<div align="center">

**Built by [Davin Loana](https://github.com/dadadadavin) with ❤️**

Exploring the intersection of AI automation, agentic systems, and developer productivity.

[⭐ Star this repo](https://github.com/dadadadavin/naek) if you find it useful!

</div>
