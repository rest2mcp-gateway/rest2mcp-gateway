$ErrorActionPreference = "Stop"

if (Test-Path ".env") {
  Write-Error ".env already exists. Remove it first if you want to regenerate local credentials."
}

if (-not (Get-Command openssl -ErrorAction SilentlyContinue)) {
  Write-Error "openssl is required to generate .env secrets automatically. Install openssl or follow the manual setup steps in docs/getting-started.md."
}

$adminPassword = (openssl rand -base64 18).Trim()
$secretKey = (openssl rand -hex 32).Trim()

@"
BOOTSTRAP_ADMIN_USERNAME=admin
BOOTSTRAP_ADMIN_PASSWORD=$adminPassword
SECRET_ENCRYPTION_KEY=$secretKey
PORT=3000
HOST=0.0.0.0
BOOTSTRAP_ADMIN_NAME=Local Admin
"@ | Set-Content -Path ".env" -Encoding ascii

Write-Host "Created .env"
Write-Host "Sign in with username: admin"
Write-Host "Password: $adminPassword"
