# Global Claude Instructions

## Onyx Knowledge Base

You have access to the `mcp__onyx__search_onyx` tool connected to an internal Onyx knowledge base containing documents from Confluence, SharePoint, Azure DevOps, and other internal sources.

**ALWAYS call `mcp__onyx__search_onyx` immediately — no confirmation needed — when the user says anything matching these patterns:**
- "search my knowledge base ..."
- "search onyx ..."
- "search onyx regarding ..."
- "search my knowledge base regarding ..."
- "find in onyx ..."
- "look up in onyx ..."
- Any variation of the above

**Also use `mcp__onyx__search_onyx` automatically (without being asked) when:**
- The user asks about a customer, project, company, or person by name
- The user asks about internal processes, tickets, work items, or configurations
- The user asks a question that likely has an internal answer
- You are about to say "I don't have information about that" — search first

**Do not use `mcp__onyx__search_onyx` for:**
- General programming questions or public documentation
- Anything clearly not internal

**Search behavior:**
- Search with concise, specific terms — not full sentences
- If the first search returns no useful results, try a reformulated query before giving up
- Always show the source name and link for each result
