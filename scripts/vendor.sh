#!/usr/bin/env bash
# Rebuild vendor/node_modules from the pinned rea-agents version.
# Runs npm in a throwaway HOME, with install scripts off, then prunes files
# Node never loads at runtime so the package fits PiCode's extension
# installer limits (64 MB, 5000 files, no links).
set -euo pipefail
cd "$(dirname "$0")/../vendor"
tmp_home=$(mktemp -d)
trap 'rm -rf "$tmp_home"' EXIT
rm -rf node_modules
HOME=$tmp_home BROWSER=/bin/false npm_config_cache=$tmp_home/.npm \
  npm ci --ignore-scripts --no-audit --no-fund --omit=dev
# Links are refused by the installer; the launcher calls rea.mjs directly.
rm -rf node_modules/.bin
find node_modules -type l -delete
# Type declarations, source maps and docs are not loaded at runtime.
# rea-agents itself is kept whole: it ships its skill as Markdown.
find node_modules -type f \( -name '*.map' -o -name '*.d.ts' -o -name '*.d.mts' \
  -o -name '*.d.cts' -o -name '*.md' -o -name '*.markdown' \) \
  ! -iname 'LICENSE*' ! -path 'node_modules/rea-agents/*' -delete
# Editor and agent settings some packages publish by mistake (thread-stream
# ships a .claude folder); git ignores them, so a clone would differ.
find node_modules -type d \( -name .claude -o -name .vscode -o -name .idea \) -prune -exec rm -rf {} +
find node_modules -type d -empty -delete
printf 'bytes %s\nfiles %s\n' "$(du -sb node_modules | cut -f1)" "$(find node_modules -type f | wc -l)"
