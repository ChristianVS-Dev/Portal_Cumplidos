#!/bin/sh
set -e

: "${SSH_TUNNEL_HOST:?Falta SSH_TUNNEL_HOST en .env.docker}"
: "${SSH_TUNNEL_USER:?Falta SSH_TUNNEL_USER}"
: "${SSH_TUNNEL_PASSWORD:?Falta SSH_TUNNEL_PASSWORD (clave SSH, no MySQL)}"

REMOTE_HOST="${MYSQL_REMOTE_HOST:-127.0.0.1}"
REMOTE_PORT="${MYSQL_REMOTE_PORT:-3306}"
SSH_PORT="${SSH_TUNNEL_PORT:-22}"

export SSHPASS="${SSH_TUNNEL_PASSWORD}"

echo "Túnel Docker: ${SSH_TUNNEL_USER}@${SSH_TUNNEL_HOST}:${SSH_PORT} → MySQL ${REMOTE_HOST}:${REMOTE_PORT} (escucha :3306)"

exec sshpass -e ssh \
  -o StrictHostKeyChecking=no \
  -o UserKnownHostsFile=/dev/null \
  -o ServerAliveInterval=30 \
  -o ServerAliveCountMax=3 \
  -p "${SSH_PORT}" \
  -N -L "0.0.0.0:3306:${REMOTE_HOST}:${REMOTE_PORT}" \
  "${SSH_TUNNEL_USER}@${SSH_TUNNEL_HOST}"
