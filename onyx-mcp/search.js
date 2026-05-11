'use strict';
/**
 * Onyx direct search — fallback when MCP is unavailable.
 * Usage: node search.js "your query here" [num_hits]
 *
 * Decrypts credentials from .secrets.json via Windows DPAPI at runtime.
 * No secrets are stored in plain text.
 */

const { execFileSync } = require('child_process');
const http = require('http');
const https = require('https');
const path = require('path');

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024; // 2 MB

const query = process.argv[2];
const numHits = Math.min(Math.max(parseInt(process.argv[3], 10) || 10, 1), 50);

if (!query) {
  process.stderr.write('Usage: node search.js "query" [num_hits]\n');
  process.exit(1);
}

function decrypt(blob) {
  if (!/^[A-Za-z0-9+/=]+$/.test(blob)) throw new Error('Invalid encrypted value in secrets file');
  const ps = [
    'Add-Type -AssemblyName System.Security;',
    `$b = [Convert]::FromBase64String('${blob}');`,
    '$d = [System.Security.Cryptography.ProtectedData]::Unprotect($b, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser);',
    '[Text.Encoding]::UTF8.GetString($d)'
  ].join(' ');
  return execFileSync('powershell.exe', ['-NoProfile', '-Command', ps], { encoding: 'utf8', timeout: 10000 }).trim();
}

const secrets = require(path.join(__dirname, '.secrets.json'));
const baseUrl = decrypt(secrets.url);
const apiKey = decrypt(secrets.apiKey);

const parsed = new URL(baseUrl);
const body = JSON.stringify({ search_query: query, include_content: true, num_hits: numHits });
const lib = parsed.protocol === 'https:' ? https : http;

const options = {
  hostname: parsed.hostname,
  port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
  path: '/api/search/send-search-message',
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  },
};

const req = lib.request(options, (res) => {
  let data = '';
  let tooLarge = false;

  res.on('data', chunk => {
    if (data.length + chunk.length > MAX_RESPONSE_BYTES) {
      tooLarge = true;
      res.destroy();
      return;
    }
    data += chunk;
  });

  res.on('end', () => {
    if (tooLarge) {
      process.stderr.write('Error: response from Onyx exceeded size limit\n');
      process.exit(1);
    }
    if (res.statusCode !== 200) {
      process.stderr.write(`Error: HTTP ${res.statusCode} from Onyx\n`);
      process.exit(1);
    }
    try {
      const json = JSON.parse(data);
      const docs = json.search_docs || [];
      if (docs.length === 0) {
        console.log('No results found.');
        return;
      }
      // Output as JSON so the caller can parse it
      const results = docs.map((doc, i) => ({
        index: i + 1,
        title: doc.semantic_identifier,
        source: doc.source_type,
        link: doc.link || '',
        score: doc.score,
        content: doc.content ? doc.content.substring(0, 1200) : '',
      }));
      console.log(JSON.stringify(results, null, 2));
    } catch (e) {
      process.stderr.write(`Parse error: ${e.message}\n`);
      process.exit(1);
    }
  });
});

req.on('error', e => { process.stderr.write(`Request error: ${e.message}\n`); process.exit(1); });
req.setTimeout(15000, () => req.destroy(new Error('Request timed out')));
req.write(body);
req.end();
