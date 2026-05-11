# Onyx MCP — Claude Code Integration

Connects a self-hosted [Onyx](https://github.com/onyx-dot-app/onyx) knowledge base to **Claude Code** via a local MCP proxy. Once configured, Claude automatically searches your internal documents (Confluence, SharePoint, Azure DevOps, and more) whenever your question has an internal answer — no explicit prompting needed.

## What it does

- Registers a local Node.js MCP server (`proxy.js`) that Claude Code spawns at session start
- Exposes a `search_onyx` tool that queries your Onyx instance via its REST API
- Injects behavior instructions into Claude so it searches automatically for internal topics
- Credentials are encrypted with Windows DPAPI — never stored in plain text

## Prerequisites

- Windows 10 or 11
- Claude Code installed
- Access to the Onyx instance (via Tailscale or local network)
- An Onyx API key — generate one in the Onyx Panel → API Keys

## Setup

### Option A — One-command install (recommended)

Open PowerShell in the project root and run:

```powershell
powershell -ExecutionPolicy Bypass -File install.ps1
```

The script handles everything: installs Node.js if missing, copies files, encrypts and stores your credentials, registers the MCP globally, and installs the global Claude behavior instructions.

Start a **new Claude Code session** when it finishes — MCP tools are loaded at session startup.

---

### Option B — Manual install

#### 1. Install Node.js

```powershell
winget install OpenJS.NodeJS.LTS
```

Reopen PowerShell after installation.

#### 2. Copy proxy files

```powershell
xcopy /E /I "onyx-mcp" "$env:USERPROFILE\.claude\onyx-mcp"
```

#### 3. Install dependencies

```powershell
cd $env:USERPROFILE\.claude\onyx-mcp
npm install
```

#### 4. Store your credentials

```powershell
node setup.js
```

When prompted:
- **Onyx URL**: `http://<ip>:3000` 
- **Onyx API key**: paste your key from the Onyx panel

Credentials are encrypted with Windows DPAPI and saved to `.secrets.json`. Only your Windows user account on this machine can decrypt them.

#### 5. Register the MCP server globally

```powershell
$NodeExe = (Get-Command node).Source
claude mcp add onyx "$NodeExe" "$env:USERPROFILE\.claude\onyx-mcp\proxy.js" -s user
```

The `-s user` flag makes the tool available in every Claude Code project, not just this directory.

#### 6. Install global behavior instructions

```powershell
copy "global-CLAUDE.md" "$env:USERPROFILE\.claude\CLAUDE.md"
```

This makes Claude search Onyx automatically in every project, not just this one.

#### 7. Verify

```powershell
claude mcp list
```

You should see:

```
onyx: node ... - Connected
```

#### 8. Start a new Claude Code session

MCP tools are loaded at startup. Open a new session to activate the integration.

---

## Usage

Just talk to Claude normally. It will search your knowledge base automatically when your question is about internal topics, customers, projects, or configurations.

You can also search explicitly:

```
search my knowledge base for <topic>
find documents about <topic>
what do we have on <customer or project name>
```

Results always include the source name and a link back to the original document.

---

## Troubleshooting

See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for a full log of known issues and fixes.

**Quick checks:**

| Symptom | Fix |
|---|---|
| `onyx` shows `Failed` in `claude mcp list` | Run `node %USERPROFILE%\.claude\onyx-mcp\proxy.js` to see the error |
| `onyx` missing from `claude mcp list` | Re-run Step 5 |
| `node not found` error | Re-register with absolute path (Step 5) |
| URL or API key changed | Run `node %USERPROFILE%\.claude\onyx-mcp\setup.js` again |

---

## Security

- Credentials are encrypted with Windows DPAPI (`CurrentUser` scope) — undecryptable by other users or on other machines
- NTFS ACLs restrict `.secrets.json` to your account only
- API key input is masked during setup (`****`)
- Use a **standard user** API key in Onyx, not an admin key — admin keys bypass per-document ACLs

See [CLAUDE.md](./CLAUDE.md) for the full security audit notes.

---

## Tested with

- Onyx v2.12.5
- Node.js v24.14.1
- `@modelcontextprotocol/sdk ~1.10.2`
