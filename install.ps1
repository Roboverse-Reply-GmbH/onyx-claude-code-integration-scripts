# Onyx MCP — Installer for Claude Code (Windows)
# Run this once as a new user: powershell -ExecutionPolicy Bypass -File install.ps1

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$ClaudeDir   = "$env:USERPROFILE\.claude"
$ProxyDir    = "$ClaudeDir\onyx-mcp"
$GlobalMd    = "$ClaudeDir\CLAUDE.md"

function Write-Step($n, $msg) { Write-Host "`n[$n] $msg" -ForegroundColor Cyan }
function Write-Ok($msg)       { Write-Host "    OK: $msg" -ForegroundColor Green }
function Write-Warn($msg)     { Write-Host "    WARN: $msg" -ForegroundColor Yellow }

# ── Step 1: Check Node.js ────────────────────────────────────────────────────
Write-Step 1 "Checking Node.js..."
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "    Node.js not found. Installing via winget..." -ForegroundColor Yellow
    winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
    Write-Host "    Node.js installed. Please close and re-run this script in a new PowerShell window." -ForegroundColor Yellow
    exit 0
}
$NodeExe = (Get-Command node).Source
Write-Ok "Node.js $(node --version) found at $NodeExe"

# ── Step 2: Copy proxy files ──────────────────────────────────────────────────
Write-Step 2 "Copying proxy files to $ProxyDir..."
if (-not (Test-Path $ProxyDir)) { New-Item -ItemType Directory -Path $ProxyDir | Out-Null }

foreach ($file in @("proxy.js", "setup.js", "search.js", "package.json")) {
    $src = Join-Path $ScriptDir "onyx-mcp\$file"
    if (-not (Test-Path $src)) {
        Write-Host "    ERROR: $src not found. Make sure you are running this from the project root." -ForegroundColor Red
        exit 1
    }
    Copy-Item $src "$ProxyDir\$file" -Force
    Write-Ok "Copied $file"
}

# ── Step 3: npm install ───────────────────────────────────────────────────────
Write-Step 3 "Installing Node.js dependencies..."
Push-Location $ProxyDir
npm install --silent
Pop-Location
Write-Ok "Dependencies installed"

# ── Step 4: Store credentials ─────────────────────────────────────────────────
Write-Step 4 "Storing Onyx credentials (encrypted with Windows DPAPI)..."
Write-Host "    You will be prompted for your Onyx URL and API key." -ForegroundColor White
node "$ProxyDir\setup.js"

# ── Step 5: Register MCP server globally ─────────────────────────────────────
Write-Step 5 "Registering Onyx MCP server globally..."
$existing = claude mcp list 2>&1
if ($existing -match "^\s*onyx\s*:") {
    Write-Warn "Onyx MCP already registered. Removing and re-adding..."
    claude mcp remove "onyx" -s user 2>$null
}
claude mcp add onyx "$NodeExe" "$ProxyDir\proxy.js" -s user
Write-Ok "MCP server registered with user scope (available in all projects)"

# ── Step 6: Install global Claude behavior instructions ───────────────────────
Write-Step 6 "Installing global Claude behavior instructions..."
$globalMdSrc = Join-Path $ScriptDir "global-CLAUDE.md"

if (Test-Path $GlobalMd) {
    Write-Warn "$GlobalMd already exists."
    $answer = Read-Host "    Overwrite? [y/N]"
    if ($answer -notmatch "^[Yy]$") {
        Write-Host "    Skipped. Your existing $GlobalMd was not changed." -ForegroundColor Yellow
        Write-Host "    To enable automatic Onyx search in all projects, manually merge the contents of global-CLAUDE.md into $GlobalMd" -ForegroundColor Yellow
    } else {
        Copy-Item $globalMdSrc $GlobalMd -Force
        Write-Ok "global-CLAUDE.md installed to $GlobalMd"
    }
} else {
    Copy-Item $globalMdSrc $GlobalMd -Force
    Write-Ok "global-CLAUDE.md installed to $GlobalMd"
}

# ── Step 7: Configure Claude desktop app ─────────────────────────────────────
Write-Step 7 "Configuring Claude desktop app..."
$DesktopConfigDir  = "$env:APPDATA\Claude"
$DesktopConfigFile = "$DesktopConfigDir\claude_desktop_config.json"

if (-not (Test-Path $DesktopConfigDir)) {
    Write-Warn "Claude desktop app config directory not found ($DesktopConfigDir). Skipping."
    Write-Host "    If you install the Claude desktop app later, add this to $DesktopConfigFile :" -ForegroundColor Yellow
    Write-Host "    { `"mcpServers`": { `"onyx`": { `"command`": `"$($NodeExe.Replace('\','/'))`", `"args`": [`"$($ProxyDir.Replace('\','/'))/proxy.js`"] } } }" -ForegroundColor Yellow
} else {
    $onyxEntry = @{
        mcpServers = @{
            onyx = @{
                command = $NodeExe.Replace('\', '/')
                args    = @("$($ProxyDir.Replace('\', '/'))/proxy.js")
            }
        }
    }

    if (Test-Path $DesktopConfigFile) {
        $existing = Get-Content $DesktopConfigFile -Raw | ConvertFrom-Json
        if ($existing.mcpServers -and $existing.mcpServers.onyx) {
            Write-Warn "Onyx already configured in Claude desktop app. Updating..."
        }
        # Merge: preserve existing mcpServers, add/overwrite onyx
        if (-not $existing.mcpServers) {
            $existing | Add-Member -MemberType NoteProperty -Name mcpServers -Value ([PSCustomObject]@{})
        }
        $existing.mcpServers | Add-Member -MemberType NoteProperty -Name onyx -Value $onyxEntry.mcpServers.onyx -Force
        $existing | ConvertTo-Json -Depth 10 | Set-Content $DesktopConfigFile -Encoding UTF8
    } else {
        $onyxEntry | ConvertTo-Json -Depth 10 | Set-Content $DesktopConfigFile -Encoding UTF8
    }
    Write-Ok "Claude desktop app configured at $DesktopConfigFile"
}

# ── Done ──────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "Installation complete." -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "  - Claude Code:    start a new session" -ForegroundColor White
Write-Host "  - Claude desktop: restart the app" -ForegroundColor White
Write-Host ""
Write-Host "Then try: 'search onyx regarding <topic>'" -ForegroundColor White
