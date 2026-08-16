#!/bin/sh
# Maakt de aparte Authentik-database aan in dezelfde PostgreSQL-instantie.
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<EOF
CREATE USER authentik WITH PASSWORD '${AUTHENTIK_DB_WACHTWOORD:-authentik}';
CREATE DATABASE authentik OWNER authentik;
EOF
