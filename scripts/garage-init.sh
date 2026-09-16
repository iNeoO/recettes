#!/usr/bin/env bash
# Amorçage d'un nœud Garage local : disposition, clé S3, bucket.
# Idempotent — relancer ne casse rien.
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] || { echo "Créer .env à partir de .env.example"; exit 1; }
set -a; . ./.env; set +a

garage() { docker compose exec -T garage /garage "$@"; }

if garage status | grep -q "NO ROLE ASSIGNED"; then
  node=$(garage node id -q | tr -d '\r' | cut -d@ -f1)
  garage layout assign -z dc1 -c "${GARAGE_CAPACITY:-10G}" "$node"
  garage layout apply --version "$(garage layout show | grep -oP 'version \K[0-9]+' | tail -1 || echo 1)"
fi

garage key info "$S3_ACCESS_KEY_ID" >/dev/null 2>&1 ||
  garage key import --yes -n recettes "$S3_ACCESS_KEY_ID" "$S3_SECRET_ACCESS_KEY"

garage bucket info "$S3_BUCKET" >/dev/null 2>&1 || garage bucket create "$S3_BUCKET"
garage bucket allow --read --write "$S3_BUCKET" --key "$S3_ACCESS_KEY_ID" >/dev/null

echo "Garage prêt : bucket '$S3_BUCKET' accessible par '$S3_ACCESS_KEY_ID'"
