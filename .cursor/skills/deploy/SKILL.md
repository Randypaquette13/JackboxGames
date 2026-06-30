---
name: deploy
description: Commit and push current repository changes with a high-quality summary commit message. Use when the user asks to run /deploy, deploy current work, or commit and push all current changes.
---

# Deploy

## Purpose

Create one clean commit for current local changes, push the working branch to origin, and merge those changes into `master`.

## Workflow

1. Inspect repo state:
   - `git status --short`
   - `git diff --staged`
   - `git diff`
   - `git log --oneline -10`
2. Determine commit scope:
   - Include all intended current work (tracked and untracked files).
   - Exclude likely secrets (`.env`, credential files, private keys).
3. Stage changes:
   - `git add -A`
4. Write a strong commit message:
   - 1 short title line in imperative mood.
   - 1-3 body lines that summarize why the change set exists.
   - Reflect all major touched areas.
5. Commit with HEREDOC formatting:

```bash
git commit -m "$(cat <<'EOF'
<title>

<body line 1>
<body line 2>
EOF
)"
```

6. Push the working branch:
   - Record the branch name: `DEPLOY_BRANCH=$(git branch --show-current)`
   - `git push -u origin HEAD` if upstream is missing
   - otherwise `git push`
7. Merge to `master`:
   - `git fetch origin master`
   - `git checkout master`
   - `git pull origin master`
   - If `DEPLOY_BRANCH` is not `master`: `git merge "$DEPLOY_BRANCH"`
   - If already on `master`, the commit from step 5 is already on this branch
   - `git push origin master`
8. Verify success:
   - `git status`
   - Report commit hash, feature branch pushed (if any), and that `master` is updated on origin.

## Commit Message Quality Bar

- Title is specific (not "update stuff" / "fixes").
- Body summarizes the major subsystems changed.
- Message is based on actual diff content, not guessed.
- If no changes exist, skip commit creation and only merge/push if the working branch is ahead of `master`.

## Safety

- Never include secrets in the commit.
- Do not use force push unless explicitly requested.
- Do not amend unless explicitly requested.
- Prefer fast-forward merges; use a merge commit only when required.
