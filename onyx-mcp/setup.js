#!/usr/bin/env node
// setup.js — run once to store Onyx credentials encrypted with Windows DPAPI
// Usage: node setup.js
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');

const SECRETS_FILE = path.join(__dirname, '.secrets.json');

function encrypt(plaintext) {
  // Pass data via a temp file to avoid shell injection through cmd.exe quoting layers.
  // execFileSync bypasses the shell entirely — no injection surface.
  // Random suffix in os.tmpdir() avoids predictable path and keeps plaintext off the project dir.
  const tmpFile = path.join(os.tmpdir(), `.dpapi-tmp-${crypto.randomBytes(8).toString('hex')}`);
  try {
    fs.writeFileSync(tmpFile, plaintext, { encoding: 'utf8', mode: 0o600 });
    const ps = `
      Add-Type -AssemblyName System.Security;
      $b = [System.IO.File]::ReadAllBytes('${tmpFile.replace(/\\/g, '\\\\')}');
      $p = [System.Security.Cryptography.ProtectedData]::Protect($b, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser);
      [Convert]::ToBase64String($p)
    `;
    return execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' }).trim();
  } finally {
    try { fs.unlinkSync(tmpFile); } catch { /* best effort */ }
  }
}

function ask(rl, question) {
  return new Promise(resolve => rl.question(question, resolve));
}

function askPassword(prompt) {
  return new Promise((resolve) => {
    // Non-TTY (piped input) — fall back to plain readline without masking
    if (!process.stdin.isTTY) {
      const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl2.question(prompt, (answer) => { rl2.close(); resolve(answer.trim()); });
      return;
    }
    process.stdout.write(prompt);
    let password = '';
    const onData = (chunk) => {
      for (const char of chunk) {
        switch (char) {
          case '\r': case '\n': case '\u0004': // Enter or EOF
            process.stdin.removeListener('data', onData);
            process.stdin.setRawMode(false);
            process.stdin.pause();
            process.stdout.write('\n');
            resolve(password);
            return; // stop processing further chars in this chunk
          case '\u0003': // Ctrl+C
            process.stdout.write('\n');
            process.exit(1);
            break;
          case '\u007f': case '\b': // Backspace
            if (password.length > 0) {
              password = password.slice(0, -1);
              process.stdout.write('\b \b');
            }
            break;
          default:
            password += char;
            process.stdout.write('*');
        }
      }
    };
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', onData);
  });
}

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    console.log('Onyx MCP Proxy — Credential Setup');
    console.log('Credentials are encrypted with Windows DPAPI (current user only)\n');

    const urlRaw = (await ask(rl, 'Onyx URL (e.g. http://10.0.1.169:3000): ')).trim().replace(/\/$/, '');
    // Close readline before switching stdin to raw mode for password masking
    rl.close();
    const apiKey = (await askPassword('Onyx API key: ')).trim();

    // Validate URL before encrypting
    let parsedUrl;
    try { parsedUrl = new URL(urlRaw); } catch {
      console.error('Error: Invalid URL. Make sure it includes the protocol, e.g. http://10.0.1.169:3000');
      process.exit(1);
    }
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      console.error('Error: URL must use http:// or https://');
      process.exit(1);
    }

    if (!apiKey) {
      console.error('Error: API key cannot be empty');
      process.exit(1);
    }

    console.log('\nEncrypting credentials...');

    const secrets = {
      url: encrypt(urlRaw),
      apiKey: encrypt(apiKey)
    };

    fs.writeFileSync(SECRETS_FILE, JSON.stringify(secrets, null, 2), { mode: 0o600 });
    // Set NTFS ACLs — mode: 0o600 is ignored on Windows, so restrict explicitly
    try {
      execFileSync('icacls', [SECRETS_FILE, '/inheritance:r', '/grant:r', `${process.env.USERNAME}:(F)`], { encoding: 'utf8' });
    } catch { /* best effort — DPAPI ensures only this user can decrypt regardless */ }
    console.log(`\nCredentials saved to ${SECRETS_FILE}`);
    console.log('You can now use the proxy. Restart Claude Code to load the updated credentials.');
  } finally {
    rl.close();
  }
}

main().catch(err => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});
