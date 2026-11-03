#!/bin/sh
set -eu

# Startup never creates a database. Initialize a separate new volume explicitly.
exec "$@"
