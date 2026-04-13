#!/usr/bin/env sh

set -eu

if ! command -v openssl >/dev/null 2>&1; then
  echo "openssl is required to generate .env secrets automatically." >&2
  echo "Install openssl or follow the manual setup steps in docs/getting-started.md." >&2
  exit 1
fi

if [ -f .env ]; then
  echo ".env already exists. Remove it first if you want to regenerate local credentials." >&2
  exit 1
fi

ADMIN_PASSWORD="$(openssl rand -base64 18 | tr -d '\n')"
SECRET_KEY="$(openssl rand -hex 32)"

cat > .env <<EOF
BOOTSTRAP_ADMIN_USERNAME=admin
BOOTSTRAP_ADMIN_PASSWORD=$ADMIN_PASSWORD
SECRET_ENCRYPTION_KEY=$SECRET_KEY
PORT=3000
HOST=0.0.0.0
BOOTSTRAP_ADMIN_NAME=Local Admin
EOF

printf 'Created .env\n'
printf 'Sign in with username: admin\n'
printf 'Password: %s\n' "$ADMIN_PASSWORD"
