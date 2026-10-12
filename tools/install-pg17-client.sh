#!/usr/bin/env bash
set -euo pipefail
mode=client
if [ "$#" -gt 0 ]; then mode="$1"; fi
if [ "$mode" != client ] && [ "$mode" != server ]; then exit 1; fi
if [ "$mode" = client ] && [ -x /usr/lib/postgresql/17/bin/pg_dump ]; then exit 0; fi
if [ "$mode" = server ] && [ -x /usr/lib/postgresql/17/bin/pg_dump ] && [ -x /usr/lib/postgresql/17/bin/initdb ] && [ -f /usr/share/postgresql/17/extension/vector.control ]; then exit 0; fi
sudo install -d /usr/share/postgresql-common/pgdg
sudo curl --fail --silent --show-error https://www.postgresql.org/media/keys/ACCC4CF8.asc -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
sudo tee /etc/apt/sources.list.d/chaskabox-pgdg.sources > /dev/null <<'EOF'
Types: deb
URIs: https://apt.postgresql.org/pub/repos/apt
Suites: noble-pgdg
Components: main
Signed-By: /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
EOF
sudo apt-get update -qq
if [ "$mode" = server ]; then
  sudo apt-get install -y postgresql-client-17 postgresql-17 postgresql-17-pgvector
else
  sudo apt-get install -y postgresql-client-17
fi
