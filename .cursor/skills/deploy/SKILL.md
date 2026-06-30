---
name: deploy
description: Commit and push current repository changes. Use when the user asks to run /deploy, deploy current work, or commit and push all current changes.
disable-model-invocation: true
---

# Deploy

Run the deploy script with the commit message as the argument. Do not inspect diffs or craft the message in the skill workflow — pass the message through to the script.

```bash
bash .cursor/skills/deploy/deploy.sh "commit message here"
```

The commit message comes from the user's `/deploy` invocation or explicit instruction. If the user did not provide one, ask for it before running.

The script stages all changes (excluding `.env`, credential files, and private keys), commits, pushes the current branch, and prints the resulting commit hash.
