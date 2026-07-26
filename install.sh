#!/usr/bin/env bash
# mindgatephoneway one-line installer. Clones the repo, nothing else.
#   curl -fsSL https://raw.githubusercontent.com/lubabs770/mindgatephoneway/main/install.sh | bash
set -euo pipefail

REPO="${MGP_REPO:-lubabs770/mindgatephoneway}"
DIR="${MGP_DIR:-$HOME/mindgatephoneway}"

say() { printf '\033[1;36m[mgp]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[mgp] %s\033[0m\n' "$*" >&2; exit 1; }

command -v git >/dev/null || die "git not found"

if [ -d "$DIR/.git" ]; then
  say "updating existing checkout at $DIR"
  git -C "$DIR" pull --ff-only
else
  say "cloning $REPO -> $DIR"
  # gh (handles private auth) if present, else plain https
  if command -v gh >/dev/null && gh auth status >/dev/null 2>&1; then
    gh repo clone "$REPO" "$DIR"
  else
    git clone "https://github.com/$REPO.git" "$DIR"
  fi
fi

# curl | bash runs in a subshell, so a `cd` here can't move the caller's shell.
say "done. next:"
echo
echo "  cd $DIR"
echo "  npm install"
echo "  npm run bootstrap   # headful Google login, once"
echo "  npm start           # headless daemon"
echo
