#!/usr/bin/env bash
# measure-bundle-sizes.sh — Measure frontend bundle sizes (raw + gzip).
#
# Usage:
#   ./scripts/measure-bundle-sizes.sh                    # default: LMS-Frontend/dist/assets
#   ./scripts/measure-bundle-sizes.sh /path/to/dist      # custom dist directory
#
# Read-only. No content mutation, no builds, no deployments.

set -euo pipefail

DIST_DIR="${1:-LMS-Frontend/dist/assets}"

if [ ! -d "$DIST_DIR" ]; then
  echo "ERROR: Directory not found: $DIST_DIR"
  echo "Hint: Run from the repository root, or pass the dist path as an argument."
  exit 1
fi

echo "=== Frontend Bundle Size Report ==="
echo "Directory: $DIST_DIR"
echo "Date:      $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo ""

total_raw=0
total_gz=0
file_count=0

# Collect data into a temp file so sort doesn't break variable accumulation
tmpfile=$(mktemp)
trap 'rm -f "$tmpfile"' EXIT

for f in "$DIST_DIR"/*; do
  [ -f "$f" ] || continue
  name=$(basename "$f")
  raw=$(stat -c%s "$f")
  gz=$(gzip -c "$f" | wc -c)
  total_raw=$((total_raw + raw))
  total_gz=$((total_gz + gz))
  file_count=$((file_count + 1))

  # Human-readable sizes
  if [ "$raw" -ge 1048576 ]; then
    raw_h="$(echo "scale=1; $raw / 1048576" | bc)MB"
  elif [ "$raw" -ge 1024 ]; then
    raw_h="$(echo "scale=1; $raw / 1024" | bc)KB"
  else
    raw_h="${raw}B"
  fi

  if [ "$gz" -ge 1048576 ]; then
    gz_h="$(echo "scale=1; $gz / 1048576" | bc)MB"
  elif [ "$gz" -ge 1024 ]; then
    gz_h="$(echo "scale=1; $gz / 1024" | bc)KB"
  else
    gz_h="${gz}B"
  fi

  printf "%d\t%-50s %10s %10s\n" "$raw" "$name" "$raw_h" "$gz_h" >> "$tmpfile"
done

printf "%-50s %10s %10s\n" "File" "Raw" "Gzip"
printf "%-50s %10s %10s\n" "----" "---" "----"

# Sort by raw size (first column, numeric, descending), then strip sort key
sort -t$'\t' -k1 -rn "$tmpfile" | cut -f2-

echo ""
echo "---"
printf "Total: %d files, %dKB raw, %dKB gzip\n" "$file_count" "$((total_raw / 1024))" "$((total_gz / 1024))"
