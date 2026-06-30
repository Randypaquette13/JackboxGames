#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: deploy.sh "commit message"

Commit all current changes (excluding common secret files) and push the current branch.

Examples:
  deploy.sh "Add pacman minigame rendering"
  deploy.sh "Fix ghost collision detection"
EOF
  exit 1
}

if [[ $# -lt 1 ]]; then
  echo "Error: commit message required." >&2
  usage
fi

COMMIT_MSG="$*"

SECRET_PATTERNS=(
  .env
  .env.*
  credentials.json
  '*.pem'
  '*.key'
  id_rsa
  id_ed25519
)

cd "$(git rev-parse --show-toplevel)"

if [[ -z "$(git config user.name 2>/dev/null)" || -z "$(git config user.email 2>/dev/null)" ]]; then
  AUTHOR_NAME="$(git log -1 --format='%an')"
  AUTHOR_EMAIL="$(git log -1 --format='%ae')"
  export GIT_AUTHOR_NAME="$AUTHOR_NAME"
  export GIT_AUTHOR_EMAIL="$AUTHOR_EMAIL"
  export GIT_COMMITTER_NAME="$AUTHOR_NAME"
  export GIT_COMMITTER_EMAIL="$AUTHOR_EMAIL"
fi

if ! git diff --quiet || ! git diff --cached --quiet || [[ -n "$(git ls-files --others --exclude-standard)" ]]; then
  :
else
  echo "No changes to commit."
  exit 1
fi

git add -A

for pattern in "${SECRET_PATTERNS[@]}"; do
  git reset -- "$pattern" 2>/dev/null || true
done

if git diff --staged --quiet; then
  echo "No changes to commit after excluding secret files."
  exit 1
fi

git commit -m "$COMMIT_MSG"

if git rev-parse --abbrev-ref '@{u}' >/dev/null 2>&1; then
  git push
else
  git push -u origin HEAD
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
HASH="$(git rev-parse --short HEAD)"

echo "Deployed ${HASH} on ${BRANCH}"
