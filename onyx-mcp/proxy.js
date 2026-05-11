#!/usr/bin/env node
// proxy.js — Onyx knowledge base MCP server for Claude Code
// Exposes Onyx document search as an MCP tool
// Credentials are DPAPI-encrypted, no secrets in config files
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const SECRETS_FILE = path.join(__dirname, '.secrets.json');
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024; // 2 MB

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');

function decrypt(encrypted) {
  // encrypted is a DPAPI Base64 blob — character set is [A-Za-z0-9+/=], safe to interpolate
  if (!/^[A-Za-z0-9+/=]+$/.test(encrypted)) throw new Error('Invalid encrypted value in secrets file');
  const ps = [
    'Add-Type -AssemblyName System.Security;',
    `$b = [Convert]::FromBase64String('${encrypted}');`,
    '$d = [System.Security.Cryptography.ProtectedData]::Unprotect($b, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser);',
    '[Text.Encoding]::UTF8.GetString($d)'
  ].join(' ');
  // execFileSync bypasses cmd.exe — no shell quoting layer, consistent with setup.js
  return execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8', timeout: 10000 }).trim();
}

function loadSecrets() {
  if (!fs.existsSync(SECRETS_FILE)) throw new Error(`Secrets not found. Run: node setup.js`);
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(SECRETS_FILE, 'utf8'));
  } catch {
    throw new Error(`Secrets file is corrupted: ${SECRETS_FILE}`);
  }
  return { url: decrypt(raw.url), apiKey: decrypt(raw.apiKey) };
}

function searchOnyx(baseUrl, apiKey, query, numHits) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(baseUrl);
    const transport = parsed.protocol === 'https:' ? https : http;
    const defaultPort = parsed.protocol === 'https:' ? 443 : 80;
    const body = JSON.stringify({ search_query: query, include_content: true, num_hits: numHits });

    const req = transport.request({
      hostname: parsed.hostname,
      port: parsed.port || defaultPort,
      path: '/api/search/send-search-message',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let buf = '';
      let tooLarge = false;

      res.on('data', d => {
        if (buf.length + d.length > MAX_RESPONSE_BYTES) {
          tooLarge = true;
          res.destroy();
          return;
        }
        buf += d;
      });

      res.on('end', () => {
        if (tooLarge) return reject(new Error('Response from Onyx exceeded size limit'));
        if (res.statusCode !== 200) {
          process.stderr.write(`[onyx-mcp] HTTP ${res.statusCode}: ${buf.slice(0, 500)}\n`);
          return reject(new Error(`HTTP error ${res.statusCode}`));
        }
        try {
          resolve(JSON.parse(buf));
        } catch {
          process.stderr.write(`[onyx-mcp] Invalid JSON from server (status ${res.statusCode}): ${buf.slice(0, 200)}\n`);
          reject(new Error('Onyx returned an invalid response'));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('Request timed out')));
    req.write(body);
    req.end();
  });
}

async function main() {
  const { url, apiKey } = loadSecrets();

  const server = new Server(
    { name: 'onyx', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [{
      name: 'search_onyx',
      description: 'Search the Onyx knowledge base (Confluence, SharePoint, Azure DevOps, and other connected sources) using semantic search.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search query' },
          num_results: { type: 'number', description: 'Number of results to return (1–50, default: 20)', minimum: 1, maximum: 50 }
        },
        required: ['query']
      }
    }]
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name !== 'search_onyx') {
      throw new Error(`Unknown tool: ${request.params.name}`);
    }

    const args = request.params.arguments ?? {};
    const { query, num_results } = args;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return { content: [{ type: 'text', text: 'Error: query is required and must be a non-empty string' }], isError: true };
    }

    const numHits = Math.min(Math.max(parseInt(num_results, 10) || 20, 1), 50);

    try {
      const data = await searchOnyx(url, apiKey, query.trim(), numHits);

      const docs = (data.search_docs || []).map(doc => {
        const lines = [`**${doc.semantic_identifier}**`];
        if (doc.link) lines.push(`URL: ${doc.link}`);
        if (doc.source_type) lines.push(`Source: ${doc.source_type}`);
        if (doc.score != null) lines.push(`Score: ${doc.score.toFixed(3)}`);
        if (doc.content && doc.content.length > 10) lines.push(`\n${doc.content.slice(0, 1200)}`);
        else if (doc.blurb) lines.push(`\n${doc.blurb.slice(0, 1200)}`);
        return lines.join('\n');
      });

      return {
        content: [{
          type: 'text',
          text: docs.length > 0
            ? `Found ${docs.length} results for "${query}":\n\n${docs.join('\n\n---\n\n')}`
            : `No results found for "${query}".`
        }]
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Search failed: ${err.message}` }],
        isError: true
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  const shutdown = async () => { await server.close(); process.exit(0); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(err => {
  process.stderr.write(`[onyx-mcp] Fatal: ${err.message}\n`);
  process.exit(1);
});
