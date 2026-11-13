#!/usr/bin/env bash
set -euo pipefail

git branch -f backup-before-fix

if ! git revert --no-edit aa1b596; then
  git revert --abort
  echo ">>> CONFLICT: nothing changed. Send me the output above."
  exit 1
fi

npm install
npm run lint
npm run build && echo ">>> BUILD OK"
