# !/bin/bash

git config user.name "github-actions"
git config user.email "github-actions@github.com"

git add artifacts/

if ! git diff --cached --quiet; then
  LAST_COMMIT_MSG=$(git log -1 --pretty=%B || echo "")
  if [ "$LAST_COMMIT_MSG" = "chore: update artifacts" ]; then
    git commit --amend --no-edit
  else
    git commit -m "chore: update artifacts"
  fi
  git push origin main --force-with-lease
else
  echo "No changes to commit"
fi
