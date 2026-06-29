#!/bin/bash
set -e

DB_FILE="${DATABASE_PATH:-./data/student_ms.db}"

if [ ! -f "$DB_FILE" ] || [ ! -s "$DB_FILE" ]; then
    echo "==> Database not found, initializing..."
    npx tsx src/scripts/initDb.ts
    echo "==> Database initialized successfully"
fi

exec "$@"
