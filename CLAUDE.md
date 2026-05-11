# Onyx MCP — Claude Code Integration

This project connects a self-hosted **Onyx** knowledge base (RAG platform) to **Claude Code** via a local MCP proxy, so Claude can search internal documents automatically.

---

## For Claude — Behavior Instructions

> This section is read by Claude Code at session start. It defines when and how to use the Onyx knowledge base tool.

You have access to a `search_onyx` tool connected to an internal Onyx knowledge base. This knowledge base contains documents from Confluence, SharePoint, Azure DevOps, and other internal sources.

**The full MCP tool name is `mcp__onyx__search_onyx`. Always call it by this name directly — do not use ToolSearch to find it first.**

**ALWAYS call `mcp__onyx__search_onyx` immediately — no confirmation needed — when the user says anything matching these patterns:**
- "search my knowledge base ..."
- "search onyx ..."
- "search onyx regarding ..."
- "search my knowledge base regarding ..."
- "find in onyx ..."
- "look up in onyx ..."
- Any variation of the above

**Also use `mcp__onyx__search_onyx` automatically (without being asked) when:**
- The user asks about a customer, project, company, or person (e.g. "TÜV SÜD", "Roboverse", "BASF")
- The user asks about internal processes, tickets, work items, or configurations
- The user asks a question that likely has an internal answer (e.g. "how do we handle X", "what is our approach to Y")
- The user asks you to find, look up, or summarize something that sounds internal
- You are about to say "I don't have information about that" — search first

**Do not use `mcp__onyx__search_onyx` for:**
- General programming questions, public documentation, or anything that is clearly not internal
- Questions the user explicitly wants you to answer from your own knowledge

**Search behavior:**
- Search with concise, specific terms — not full sentences
- If the first search returns no useful results, try a reformulated query before giving up
- Always show the source name and link for each result
- If results are found, lead with the most relevant ones and summarize what was found

---

## For New Users — Installation

### Quick install (recommended)

Run this once from the project root in PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File install.ps1
```

The script handles everything: installs Node.js if missing, copies files, stores credentials, registers the MCP globally, and installs the global Claude behavior instructions. Then start a new Claude Code session.

> **Your credentials are never in this repo.** During installation you will be prompted for your own Onyx URL and API key. These are encrypted with Windows DPAPI and stored only on your machine — they are not committed to git and are not shared with anyone.

---

### Manual installation (step by step)

Follow these steps if you prefer to install manually or if the script fails.

#### Prerequisites

- Windows 10 or 11
- Access to the Onyx instance (via Tailscale or local network)
- An Onyx API key — get one from the Onyx Admin Panel → API Keys

#### Step 1 — Install Node.js

Open **PowerShell as Administrator** and run:

```powershell
winget install OpenJS.NodeJS.LTS
```

Close and reopen PowerShell after installation.

### Step 2 — Copy the proxy files

Copy the entire `onyx-mcp` folder to your `.claude` directory:

```powershell
xcopy /E /I "<source>\onyx-mcp" "$env:USERPROFILE\.claude\onyx-mcp"
```

Or manually place these files at `C:\Users\<you>\.claude\onyx-mcp\`:
- `proxy.js`
- `setup.js`
- `search.js`
- `package.json`

### Step 3 — Install dependencies

```powershell
cd $env:USERPROFILE\.claude\onyx-mcp
npm install
```

### Step 4 — Store your credentials

```powershell
node setup.js
```

When prompted:
- **Onyx URL**: `http://<ip-address>:3000` — use the IP of the Onyx server, port **3000**
  - If accessing via Tailscale: use the Tailscale IP (e.g. `http://100.x.x.x:3000`)
  - If on the local network: use the LAN IP (e.g. `http://10.x.x.x>:3000`)
  - **Do not use port 8080** — the full API is only available on port 3000
- **Onyx API key**: paste your key from the Onyx admin panel

Your credentials are encrypted with **Windows DPAPI** and saved to `.secrets.json`. They are only decryptable by your Windows user account on this machine — not stored in plain text anywhere.

### Step 5 — Register the MCP server globally

> **Important:** The `-s user` flag is required. It registers the MCP server at the user level,
> making it available in **every Claude Code project and session** on this machine — not just this one.
> Without it, the tool only works inside this specific project directory.

> **Windows PATH note:** Use the absolute path to `node.exe`, not just `node`. Claude Code spawns
> MCP servers in a minimal environment that may not inherit your shell PATH.

```powershell
$NodeExe = (Get-Command node).Source
claude mcp add onyx "$NodeExe" "$env:USERPROFILE\.claude\onyx-mcp\proxy.js" -s user
```

After this step, you can open Claude Code in **any project** and use Onyx search directly.

### Step 6 — Install global behavior instructions

> This step makes Claude automatically use the Onyx tool in **every project**, not just this one.
> Without it, Claude will only search Onyx when explicitly told, and only in this project directory.

Copy the global CLAUDE.md to your `.claude` folder:

```powershell
copy "<source>\global-CLAUDE.md" "$env:USERPROFILE\.claude\CLAUDE.md"
```

Or create `%USERPROFILE%\.claude\CLAUDE.md` manually with the contents from this project's `global-CLAUDE.md`.

### Step 8 — Verify

```powershell
claude mcp list
```

You should see:

```
onyx: node ... - ✓ Connected
```

### Step 9 — Start a new Claude Code session

MCP tools are loaded at session startup. Open a new session after completing setup.

You are ready. Ask Claude anything about your internal knowledge base and it will search automatically.

---

## For Ongoing Users

### Daily use

Just talk to Claude normally. It will search your knowledge base automatically when your question is about internal topics, customers, projects, or anything that sounds like it could have an internal answer.

You can also ask explicitly:

```
search my knowledge base for <topic>
find documents about <topic>
what do we have on <customer or project>
```

### If the MCP is not connected

Run in PowerShell:

```powershell
claude mcp list
```

- If `onyx` shows `✗ Failed` — run `node %USERPROFILE%\.claude\onyx-mcp\proxy.js` manually to see the error
- If `onyx` is missing — re-run Step 5 from the installation guide above
- If the error is `node not found` — Claude Code may not have `node` in PATH. Re-register with the absolute path:
  ```powershell
  claude mcp remove onyx -s user
  $NodeExe = (Get-Command node).Source
  claude mcp add onyx "$NodeExe" "$env:USERPROFILE\.claude\onyx-mcp\proxy.js" -s user
  ```

### If your Onyx URL or API key changed

```powershell
node %USERPROFILE%\.claude\onyx-mcp\setup.js
```

Re-running overwrites the encrypted credentials. Then start a new Claude Code session.

### Updating the proxy

If `proxy.js` or `setup.js` are updated:
1. Replace the files in `%USERPROFILE%\.claude\onyx-mcp\`
2. Run `npm install` if `package.json` changed
3. Start a new Claude Code session

---

## Architecture

```
Claude Code (stdio)
      |
      v
proxy.js  ← Node.js MCP server
      |    decrypts credentials via Windows DPAPI at runtime
      |    no secrets in any config file
      v
Onyx REST API  http://<ip>:3000
POST /api/search/send-search-message
      |
      v
Onyx knowledge base
(Confluence, SharePoint, Azure DevOps, ...)
```

**Key facts:**
- The proxy runs as a child process of Claude Code, communicating over stdio
- Credentials are never in plain text — only DPAPI-encrypted blobs in `.secrets.json`
- The proxy supports both HTTP and HTTPS Onyx URLs
- Onyx's built-in MCP server (port 8080) was not used — it only exposes Azure DevOps action tools, not document search
- The full tool name inside Claude Code is `mcp__onyx__search_onyx`
- A fallback direct Node.js script (`search.js`) exists at `~/.claude/onyx-mcp/search.js` — used automatically if the MCP is unavailable
- Claude Code spawns MCP servers without the user's shell PATH — always register with the absolute path to `node.exe`
- The Claude desktop app uses a separate config: `%APPDATA%\Claude\claude_desktop_config.json` — `install.ps1` handles this automatically

---

## Project Structure

```
C:\Users\<you>\
│
├── .claude\
│   ├── settings.json              # Claude Code settings (no secrets)
│   │
│   └── onyx-mcp\                  # MCP proxy package
│       ├── proxy.js               # MCP server — started by Claude Code at session init
│       ├── setup.js               # One-time credential setup (run manually)
│       ├── package.json           # Node.js dependencies
│       ├── .secrets.json          # DPAPI-encrypted credentials (not plain text)
│       └── node_modules\          # npm dependencies
│
└── Desktop\
    └── Claude\
        └── Onyx\                  # This repository
            ├── CLAUDE.md          # This file — loaded by Claude Code automatically
            ├── TROUBLESHOOTING.md # Full log of what failed during setup and why
            ├── global-CLAUDE.md   # Claude behavior instructions — copied to ~/.claude/CLAUDE.md
            ├── install.ps1        # One-command installer for new users
            └── onyx-mcp\          # Source copy of proxy files (for distribution)
                ├── proxy.js
                ├── setup.js
                ├── search.js          # Fallback direct search script (no MCP needed)
                └── package.json
```

| File | Purpose |
|------|---------|
| `proxy.js` | MCP server. Decrypts credentials at startup, exposes `search_onyx` tool, calls Onyx REST API. |
| `setup.js` | Run once to store credentials. Encrypts via DPAPI, writes `.secrets.json`. Uses `execFileSync` to avoid shell injection. |
| `.secrets.json` | DPAPI-encrypted Base64 blobs. Only decryptable by the same Windows user on the same machine. |
| `package.json` | Single dependency: `@modelcontextprotocol/sdk` (~1.10.2, pinned to minor). Declares `engines` (Node ≥18) and `os` (win32). |
| `CLAUDE.md` | Loaded by Claude Code at session start. Contains AI behavior instructions and user documentation. |
| `TROUBLESHOOTING.md` | Everything that went wrong during initial setup, with explanations. |
| `global-CLAUDE.md` | Claude behavior instructions for global scope. Copied to `~/.claude/CLAUDE.md` by the installer. |
| `install.ps1` | One-command installer. Runs all setup steps automatically for a new user, including Claude desktop app config. |
| `onyx-mcp/` | Source copy of proxy files included for distribution with this project. |
| `search.js` | Fallback direct search script. Calls Onyx REST API via Node.js without MCP. Used automatically by Claude if MCP is unavailable. |

---

## Onyx API Reference

```
POST /api/search/send-search-message
Host: <onyx-ip>:3000
Authorization: Bearer <api-key>
Content-Type: application/json

{
  "search_query": "string",   // required
  "include_content": true,    // return document text
  "num_hits": 10              // max results (1–50)
}
```

Response field used: `search_docs[]` — each item has `semantic_identifier`, `link`, `source_type`, `score`, `content`.

---

## Security Notes

> Summary of a full security + code audit performed 2026-04-07.

### Authentication approach

The DPAPI-encrypted static API key is the correct and proportionate approach for this use case. No alternative (OAuth2, session cookies, Windows Credential Manager, env vars) offers a material security improvement for a single-user local tool. See analysis below.

**Important:** Verify in the Onyx Admin Panel that the API key is bound to a **standard user account**, not an admin account. An admin-scoped key bypasses Onyx's per-document ACLs, giving Claude access to documents the user's personal login would not normally see.

### API key rotation runbook

The correct order matters — do not reverse steps 1 and 2:

1. **Revoke the old key** in Onyx Admin Panel first
2. Generate a new key in Onyx Admin Panel
3. Run `node %USERPROFILE%\.claude\onyx-mcp\setup.js`
4. Restart Claude Code

### Credential entry masking

`setup.js` masks the API key input (`****`) using stdin raw mode. The URL prompt is plain text (not sensitive). If stdin is not a TTY (piped input), falls back to unmasked readline automatically.

### What DPAPI protects against

- Another local user account reading `.secrets.json` — blocked by DPAPI `CurrentUser` scope + NTFS ACLs (`icacls`)
- File-system backup read by an attacker — DPAPI blob is undecryptable without the user's Windows credentials
- Shell injection during decryption — blocked by Base64 validation + `execFileSync` (no cmd.exe layer)
- Malicious process reading the file — can read the bytes, cannot decrypt them

### Known residual risks (accepted)

- API key lives in Node.js heap for the full MCP session — unavoidable with any symmetric-key approach
- No automatic key expiry or rotation — rotate manually on a schedule (e.g. quarterly)
- HTTP transport sends the API key in cleartext — acceptable on Tailscale/LAN; use HTTPS if the Onyx server supports it
- Prompt injection: document content from Onyx is passed to Claude as tool output without sanitization — a malicious internal document could influence Claude's behavior

---

## Changelog

### 2026-04-07 — Security & code audit fixes

Full audit by code-reviewer, security-auditor, and mcp-expert agents. The following fixes were applied:

**proxy.js**
- `execSync` → `execFileSync` in `decrypt()` — eliminates cmd.exe shell layer, consistent with `setup.js`; added 10s timeout
- `req.destroy()` → `res.destroy()` on response size-limit breach
- Error messages sanitized — full server error body logged to stderr only; callers receive a generic message
- Tool schema: replaced non-standard `default: 10` with `minimum: 1, maximum: 50`

**setup.js**
- Temp file moved to `os.tmpdir()` with random hex suffix (was fixed path in script dir)
- URL protocol validation — rejects non-http/https schemes at setup time
- NTFS ACLs set on `.secrets.json` via `icacls` after write (`mode: 0o600` is ignored on Windows)
- API key prompt now masked (`****`) via stdin raw mode

**search.js** (fallback script)
- Added `'use strict'`
- Added Base64 validation in `decrypt()` (was missing, unlike `proxy.js`)
- Added 2 MB response size cap with `res.destroy()` on overflow
- Added 15s request timeout
- Added HTTP status check before JSON parsing
- Default `num_hits` changed from 20 → 10 (consistent with `proxy.js`)
- Error output no longer echoes raw response body

**install.ps1**
- `search.js` added to the file copy list (was missing — fallback script would not be installed)
- MCP existence check regex anchored: `"onyx:"` → `"^\s*onyx\s*:"` (prevents false positives)

**package.json**
- Semver pin tightened: `^1.10.2` → `~1.10.2`
- Added `engines` (`>=18.0.0`) and `os` (`win32`) fields

---

## Reference

- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) — what failed during setup and why
- Onyx version tested: **v2.12.5**
- MCP SDK version: `@modelcontextprotocol/sdk ~1.10.2`
- Node.js tested: **v24.14.1**
