# Onyx Knowledge Base — Internal Documentation

**Platform:** Onyx v2.12.5 | **Access:** Tailscale VPN required (external) or LAN (internal) | **Last updated:** April 2026

---

## Table of Contents

1. [What is Onyx?](#1-what-is-onyx)
2. [How to Access — Tailscale Setup](#2-how-to-access--tailscale-setup)
3. [How to Log In to the Onyx UI](#3-how-to-log-in-to-the-onyx-ui)
4. [Data Sources & SharePoint Connectors](#4-data-sources--sharepoint-connectors)
5. [Using the Onyx Web Interface](#5-using-the-onyx-web-interface)
6. [Internal AI Agent](#6-internal-ai-agent)
7. [Claude Code Integration (MCP)](#7-claude-code-integration-mcp)
8. [Usage Examples](#8-usage-examples)
9. [Admins & Contacts](#9-admins--contacts)

---

## 1. What is Onyx?

Onyx is our self-hosted **AI-powered knowledge base** (RAG — Retrieval-Augmented Generation platform). It indexes all internal documents and makes them searchable via natural language — either through its own web UI, a built-in AI chat agent, or directly from developer tools like Claude Code.

**Key capabilities:**

| Capability | Description |
|---|---|
| **Semantic search** | Find documents by meaning, not just keywords |
| **AI chat agent** | Ask questions in natural language; get answers with source citations |
| **Multi-source indexing** | SharePoint, Confluence, Azure DevOps, and more |
| **Claude Code integration** | Claude searches Onyx automatically during your work sessions |
| **Access control** | Documents respect per-user permissions from the source system |

---

## 2. How to Access — Tailscale Setup

Onyx runs on our internal network. You need **Tailscale VPN** to reach it from outside the office.

> **Tailscale contact:** @Nishant is the responsible person — contact him if you are not connected yet or need an invite.

If you are already on the office LAN (wired or Wi-Fi), Tailscale is not required.

---

## 3. How to Log In to the Onyx UI

### Access URL

Open your browser and navigate to:

```
http://10.0.1.169:3000
```

> **Note:** This is the current LAN IP of the Onyx server. If it changes, contact an admin (see section 9).

### First-time login

1. Go to the Onyx URL above.
2. Click **Sign In** on the landing page.
3. On first login, your account is created automatically with standard user permissions.

### Admin login

Admins log in the same way. Admin privileges are granted separately in the Onyx Admin Panel — contact an existing admin if you need elevated access.

### Generating an Access Token (for developers)

Any user can generate their own access token — no admin access required:

1. Log in to the Onyx UI.
2. Click your profile → **Settings → Accounts & Access**.
3. Under **Access Tokens**, click **New Access Token**.
4. Copy it immediately — it is shown only once.

---

## 4. Data Sources & SharePoint Connectors

Onyx indexes documents from multiple internal sources. The primary data store is **SharePoint**, which currently holds approximately **1 TB of internal project data**.

**Connected sources:**

| Source | Details |
|---|---|
| **SharePoint (per project)** | ~1 TB total; split by project connector |
| **Confluence** | Internal wikis and team pages |
| **Azure DevOps** | Work items, tickets, boards, pipelines |
| **Other** | Additional sources can be added by admins as needed |

### SharePoint — Connector Strategy

Because the SharePoint volume is large and spans many projects, we have divided the indexing into **separate connectors per project**. This approach provides:

- **Faster targeted searches** — Onyx can prioritize the right project scope
- **Cleaner access control** — each connector can be scoped to the right users
- **Easier maintenance** — connectors can be paused, re-indexed, or removed per project independently

Each project connector pulls documents from its dedicated SharePoint site or document library and keeps the Onyx index fresh on a scheduled sync cycle.

### Connector Management

Connectors are managed in the **Onyx Admin Panel → Connectors**. Only admins can add, edit, or remove connectors. If you need a new project added or a connector fixed, contact an admin.

---

## 5. Using the Onyx Web Interface

### Semantic Search

1. Open the Onyx UI and navigate to **Search**.
2. Type your question or topic in natural language — no need for exact keywords.
3. Onyx returns the most relevant document snippets, ranked by semantic similarity.
4. Click any result to open the source document.

**Example searches:**

- `BASF data migration requirements`
- `TÜV SÜD integration architecture`
- `authentication flow for customer portal`
- `Q1 budget approval process`
- `release checklist onboarding`

### Filters

Use the sidebar filters to narrow results by:

- **Source** (SharePoint, Confluence, Azure DevOps)
- **Document type**
- **Date range**
- **Project / connector**

---

## 6. Internal AI Agent

Onyx includes a built-in **AI chat agent** that goes beyond plain search. Instead of just returning document snippets, it reads the relevant documents and generates a synthesized answer — with citations so you can verify the source.

### How to use it

1. Navigate to **Chat** in the Onyx UI.
2. Start a new conversation and type your question.
3. The agent retrieves relevant documents, reads them, and responds with an answer + source links.
4. You can continue the conversation — the agent maintains context across turns.

### What it is good for

- **Summarizing a project** — *"Summarize the current status of the Roboverse project"*
- **Finding a process** — *"What is our process for onboarding a new enterprise customer?"*
- **Cross-document synthesis** — *"What were the key decisions made about the API design across all architecture docs?"*
- **Quick fact lookup** — *"Who is the technical contact at TÜV SÜD?"*
- **Comparing documents** — *"How does the Q1 plan differ from the Q4 retrospective?"*

### What it is not good for

- Real-time data (the index is updated on a schedule, not live)
- Documents not yet indexed or outside the connected sources
- Actions — the agent reads and answers but cannot modify documents

### Personas / Assistants

Onyx supports configuring specialized **assistants** (personas) with pre-set instructions and document scope. If your team has a specific assistant configured, you can select it from the **Assistants** dropdown in the Chat view.

---

## 7. Claude Code Integration (MCP)

For developers using **Claude Code** (Anthropic's CLI), Onyx is integrated directly via an MCP (Model Context Protocol) server. Claude will automatically search the Onyx knowledge base as part of your coding sessions — no manual switching needed.

### What this means in practice

While you work in Claude Code, Claude searches Onyx in the background when your question sounds internal. You can also trigger a search explicitly:

- *"search my knowledge base for \<topic\>"*
- *"find documents about \<project name\>"*
- *"what do we have on \<customer\>"*

### Setup

Before running the installer, you need an **Onyx access token** (any user can generate one — no admin access required):

1. Log in to the Onyx UI at `http://10.0.1.169:3000`
2. Go to **Settings → Accounts & Access**
3. Under **Access Tokens**, click **New Access Token** and copy it — it is shown only once

Then run the installer from the project root in PowerShell and paste the token when prompted:

```powershell
powershell -ExecutionPolicy Bypass -File install.ps1
```

Contact an admin if you do not have access or run into issues during setup.

### How it works

```
Claude Code  →  local MCP proxy  →  Onyx REST API (port 3000)
```

Credentials are stored encrypted on your machine using Windows DPAPI. No secrets are stored in plain text or committed to any repository.

---

## 8. Usage Examples

### Example 1 — Find project documentation

**In Onyx UI (Search):** *"requirements specification for Roboverse integration"*

Onyx returns the most relevant spec documents from SharePoint, ranked by relevance, with a content preview and a direct link.

### Example 2 — Ask the AI agent about a customer

**In Onyx UI (Chat):** *"What is the current status of the TÜV SÜD project and who are the key contacts?"*

The agent reads across project documents, meeting notes, and Azure DevOps tickets, then gives a synthesized answer with citations.

### Example 3 — Search from Claude Code

While working in Claude Code, type: *"search my knowledge base for the authentication flow we agreed on with BASF"*

Claude calls Onyx automatically and returns matching documents inline in your session — no context switch needed.

### Example 4 — Find an internal process

**In Onyx UI (Chat):** *"How do we handle data migration when onboarding a new enterprise client?"*

The agent searches process documents, handover notes, and Confluence pages and gives a step-by-step answer based on internal documentation.

### Example 5 — Cross-project search

**In Onyx UI (Search):** *"API rate limiting"*

With all project connectors active, Onyx searches across all SharePoint sites and returns relevant snippets from every project that has discussed this topic.

---

## 9. Admins & Contacts

| Role | Name | Contact |
|---|---|---|
| **Onyx Admin** | Ana-Maria Lacatusu | a.lacatusu@reply.de |
| **Onyx Admin** | Korbinian Hörmann | k.hoermann@reply.de |
| **Tailscale Admin** | Nishant | Contact for VPN access and Tailscale invitations |

**Who to contact for what:**

| Issue | Contact |
|---|---|
| Can't log in / account access | Onyx Admin |
| New connector needed / project not indexed | Onyx Admin |
| Can't connect via Tailscale / need invite | Nishant |
| MCP setup help or access token issues | Onyx Admin |
| Document not appearing in search | Onyx Admin (connector re-sync) |

