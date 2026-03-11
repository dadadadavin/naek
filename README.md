# 📱 naek

> **Secure, remote control AI pair-programming via WhatsApp and Antigravity IDE.**

`naek` bridges the gap between your mobile device and your development environment. By leveraging [Baileys](https://github.com/WhiskeySockets/Baileys) and [Chrome DevTools Protocol (CDP)](https://chromedevtools.github.io/devtools-protocol/), it allows you to securely prompt, steer, and monitor the Antigravity IDE directly from WhatsApp—without relying on finicky iframe workarounds.

---

## ✨ Features
- **Remote Prompting**: Inject prompts into the IDE from anywhere using your phone.
- **Deep Status Monitoring**: Intelligently handles complex agentic "Tasking" and "Thinking" loops without timing out.
- **Visual Feedback**: Commands like `/ss` will take a screenshot of your IDE layout.
- **Rich Formatting**: Native agent states (`Step`, `Task`, `Phase`, `Command Executions`) are visually mapped to WhatsApp emojis for a clean experience.
- **Personal Security**: Whitelists your specific phone number. Unrecognized `@lid` or phone number inquiries are logged and rejected automatically.

---

## 🚀 Getting Started

### Prerequisites
1. **Node.js** (v18+)
2. **Antigravity IDE**

### Installation

1. Clone or download this repository:
   ```bash
   git clone https://github.com/dadadadavin/naek.git
   cd naek
   ```
2. Install dependencies:
   ```bash
   npm install
   ```

### Configuration

Copy the example environment template and configure your details:
```bash
cp .env.example .env
```

Open `.env` and assign your details:
- `ALLOWED_PHONE`: Your WhatsApp number (e.g. `628123456789`). Drop the `+` sign.
- `CDP_PORT`: The Chrome Debugging Port exposed by Antigravity (Default: `9222`).
- `PROJECT_DIR`: The absolute path to the codebase you want Antigravity to open.

---

## 🕹️ Usage

To spawn both the IDE and the WhatsApp bot seamlessly, run:

### Windows
```cmd
start.bat
```

### Manual Method
1. Launch Antigravity manually with the CDP port exposed:
   ```bash
   antigravity D:\your\project\path --remote-debugging-port=9222
   ```
2. Start the WhatsApp listener:
   ```bash
   npm start
   ```
3. Scan the QR code using WhatsApp (*Settings -> Linked Devices -> Link*).

### Commands
Once paired, send any raw text to prompt the AI. You can also send special commands:
- `/ss` — Request a screenshot of the current IDE state.
- `/stop` — Abort the current generation/task.
- `/new` — Start a fresh chat thread.
- `/yes` — Accept an IDE dialog or execution boundary.
- `/no` — Reject an IDE dialog.
- `/status` — View connection and agent mode status.
- `/help` — List all commands.
