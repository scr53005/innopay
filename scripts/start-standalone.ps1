# Start the hub from its production build (output: 'standalone'), e.g. for the e2e suite.
# A dev server compiles and watches files while it runs; on a busy PC that delayed answers
# beyond the spokes' time limits (20-30 s). The built hub answers in milliseconds.
#
# Usage, from innopay/:  npm run build ; .\scripts\start-standalone.ps1
#
# The standalone server contains only the server code: the static assets, public/ and the .env
# files must be copied next to it after every build. Copies only; nothing is deleted. Safe to re-run.

$ErrorActionPreference = 'Stop'
$hub = Split-Path -Parent $PSScriptRoot
$standalone = Join-Path $hub '.next\standalone'

if (-not (Test-Path (Join-Path $standalone 'server.js'))) {
  Write-Error "No standalone build in $standalone. Run 'npm run build' in innopay first."
}

Copy-Item -Recurse -Force (Join-Path $hub '.next\static') (Join-Path $standalone '.next\static')
if (Test-Path (Join-Path $hub 'public')) {
  Copy-Item -Recurse -Force (Join-Path $hub 'public') (Join-Path $standalone 'public')
}
# Every env file a production build reads, not only .env: secrets such as RESEND_API_KEY live in
# .env.local, and without it the webhook route fails to load (every Stripe event → 500).
# (.env.development* is not read by a production build.)
foreach ($name in '.env', '.env.local', '.env.production', '.env.production.local') {
  if (Test-Path (Join-Path $hub $name)) {
    Copy-Item -Force (Join-Path $hub $name) $standalone
    Write-Host "Copied $name"
  }
}

$env:PORT = if ($env:PORT) { $env:PORT } else { '3000' }
Write-Host "Hub (production build) on http://localhost:$($env:PORT)"
node (Join-Path $standalone 'server.js')
