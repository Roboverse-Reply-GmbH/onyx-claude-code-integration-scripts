# Troubleshooting Log — Onyx MCP Setup

This documents everything that failed during setup and why, so future attempts on a Windows machine avoid the same issues.

---

## 1. `mcpServers` in `settings.json` — Does not work

**What we tried**: Adding `mcpServers` directly to `~/.claude/settings.json`.

**Why it failed**: Claude Code's `settings.json` schema does not support a top-level `mcpServers` key. The validator rejects it with `Unrecognized field: mcpServers`.

**Fix**: Use the CLI command `claude mcp add` or create `~/.claude/mcp.json`. However, `mcp.json` turned out to also not be the right approach — use `claude mcp add` exclusively.

---

## 2. Node.js not installed

**What happened**: Running `npm install` and `node setup.js` failed with `'node' is not recognized`.

**Why**: Node.js was not installed on the machine.

**Fix**:
```powershell
winget install OpenJS.NodeJS.LTS
```
Open a **new** PowerShell window after installation for PATH to take effect.

---

## 3. Wrong port — Onyx API is on port 3000, not 8080

**What happened**: Stored URL `http://10.0.1.169:8080`. All REST API calls returned 404.

**Why**: Onyx runs two services:
- Port **3000**: Next.js web frontend, which also proxies all `/api/*` REST calls to the backend.
- Port **8080**: Raw Python backend — only the `/mcp` endpoint is exposed externally; the full REST API is not reachable directly on this port from outside the container network.

**Fix**: Always use port **3000** for the Onyx API.

---

## 4. Wrong MCP transport — SSE vs Streamable HTTP

**What happened**: The proxy initially used `SSEClientTransport` from `@modelcontextprotocol/sdk`. The connection failed with `SSE error: Non-200 status code (400)`.

**Why**: Onyx v2.12.5 implements the newer **Streamable HTTP** MCP transport (spec 2025-03-26), not the legacy SSE transport. The GET request to `/mcp` without a session ID returns `400: No sessionId`.

**Fix**: Switch to `StreamableHTTPClientTransport`:
```js
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
```

---

## 5. Onyx MCP exposes Azure DevOps tools, not document search

**What happened**: After connecting via the correct transport, the MCP server exposed ~80 Azure DevOps tools (`work_create_iterations`, `repo_create_pull_request`, etc.) — not a knowledge base search tool.

**Why**: Onyx's built-in MCP server on port 8080 is an **Actions** MCP — it re-exposes the native tools of connected integrations (Azure DevOps in this case). It is not the same as the document search / RAG functionality.

**Fix**: Bypass Onyx's MCP entirely. Use the Onyx REST API directly:
```
POST /api/search/send-search-message
{ "search_query": "...", "include_content": true, "num_hits": 10 }
```
Build a custom MCP server (`proxy.js`) that wraps this endpoint.

---

## 6. Wrong API endpoint names

**What happened**: Tried common Onyx endpoint names — `/api/query/document-search`, `/api/search`, `/api/query/search` — all returned 404.

**Why**: Onyx v2.12.5 renamed/reorganised endpoints. The correct search endpoint is `/api/search/send-search-message` with field `search_query` (not `query`).

**How we found it**: Fetched `/openapi.json` from port 3000, filtered paths containing `search`, identified `SendSearchQueryRequest` schema with required field `search_query`.

---

## 7. MCP registered as project-local, not global

**What happened**: `claude mcp add onyx node "..."` registered the server as local to the `C:\Users\a.lacatusu\Desktop\Claude\Onyx` project. Tools were not available in other sessions.

**Why**: The default scope for `claude mcp add` is the local project config.

**Fix**: Add `-s user` flag to register globally:
```powershell
claude mcp add onyx node "C:/Users/<you>/.claude/onyx-mcp/proxy.js" -s user
```

---

## 8. MCP tools not available until new session

**What happened**: After registering the MCP server, tools were not visible in the current Claude Code session.

**Why**: Claude Code loads MCP tool lists at session startup. Existing sessions do not hot-reload.

**Fix**: Start a new Claude Code session after any MCP registration or proxy changes.

---

## 9. MCP shows `✗ Failed to connect` — `node` not found in PATH

**What happened**: `claude mcp list` showed `onyx: node ... - ✗ Failed to connect`. The fallback script (`search.js`) still worked. The MCP had been working at some point but stopped, or appeared to work only via fallback all along.

**Why**: The MCP was registered with `"command": "node"` (bare name). Claude Code spawns MCP servers in a minimal environment that does not inherit the user's full shell PATH. Even though Node.js was installed (at `C:/Program Files/nodejs/node.exe`), the bare `node` command was not resolvable when Claude Code tried to launch the proxy process.

This is a Windows-specific issue. The terminal (bash/PowerShell) finds `node` because it loads the full user PATH from the shell profile. Claude Code does not.

**Fix**: Use the absolute path to `node.exe` in the MCP config:

In `~/.claude.json`, change:
```json
"command": "node"
```
to:
```json
"command": "C:/Program Files/nodejs/node.exe"
```

Or re-register via CLI with the full path:
```powershell
claude mcp remove onyx -s user
$NodeExe = (Get-Command node).Source
claude mcp add onyx "$NodeExe" "C:/Users/<you>/.claude/onyx-mcp/proxy.js" -s user
```

The `install.ps1` script was updated to resolve the Node.js path at install time using `(Get-Command node).Source` so this is handled automatically for new installs.

**Effect on Claude Desktop app**: Fixing `~/.claude.json` also fixed the MCP inside the Desktop app's Code mode. This is because Claude Code — whether launched from the terminal, a VS Code extension, or the Desktop app's Code sidebar — all share the same `~/.claude.json`. One fix covers all surfaces.

Note: the Desktop app's **chat interface** uses a separate config (`AppData/Roaming/Claude/claude_desktop_config.json`). That config has no Onyx entry and would need one added separately if you ever want Onyx search from the chat tab.

**Fallback**: A fallback script (`search.js`) at `~/.claude/onyx-mcp/search.js` bypasses the MCP entirely and calls the Onyx REST API directly via Node.js using its full path. The global `CLAUDE.md` instructs Claude to use this automatically if the MCP tool is unavailable. This ensures search continues to work even when the MCP connection fails.
