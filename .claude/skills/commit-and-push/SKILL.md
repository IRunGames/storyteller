---
name: commit-and-push
description: >-
  Write a commit message describing all current changes, stage everything,
  commit, and push to the remote. Use when the user says "commit and push",
  "ship it", "save my work", "push this up", or otherwise asks to get the
  working tree committed and pushed in one step.
---

# Commit and push

Stage all current changes, commit them with a message derived from the actual
diff, and push to the remote.

## Steps

1. **Survey the work.** Run these in parallel in a single message:
   - `git status --porcelain=v1` — every changed, deleted, and untracked path
   - `git diff` — unstaged changes
   - `git diff --cached` — anything already staged
   - `git log --oneline -10` — match the repo's existing message style

   Read the diff, don't skim it. The commit message must describe what the
   change *does*, which requires knowing what's in it.

2. **Check for things that shouldn't be committed.** Before staging, scan the
   untracked files and diff for:
   - Secrets: `.env` files, API keys, tokens, connection strings with
     credentials (this repo uses Neon — watch for `DATABASE_URL` values with
     real passwords).
   - Junk: `.DS_Store`, editor scratch files, build output, `node_modules`,
     large binaries, `*.log`.
   - Generated artifacts that are noise, e.g. `tsconfig.tsbuildinfo`.

   If any turn up, do **not** silently include them. Say what you found, and
   either add them to `.gitignore` (preferred for junk) or ask the user
   whether to include them (for anything ambiguous). Never commit a secret,
   even if the user asks to commit everything — flag it and stop.

3. **Stage.** `git add -A` from the repo root, so deletions and new files are
   both picked up. Then `git status --short` to confirm what's staged matches
   what you intend.

4. **Branch check.** If on `main`, mention it to the user before committing.
   Committing directly to `main` is fine on this repo if that's what they want
   — just don't do it without saying so.

5. **Write the message.**
   - Subject: imperative mood, ≤72 chars, no trailing period. Say what the
     change accomplishes, not which files moved.
   - Body (when the change touches more than one concern, or the "why" isn't
     obvious): a blank line, then short bullets grouped by area — one per
     logical change, not one per file.
   - Never write filler like "update files" or "various changes".
   - End the message with:

     ```
     Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
     ```

   Commit with a heredoc so the formatting survives:

   ```bash
   git commit -m "$(cat <<'EOF'
   Subject line here

   - Bullet one
   - Bullet two

   Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
   EOF
   )"
   ```

6. **Push.** `git push`. If the branch has no upstream, use
   `git push -u origin HEAD`.

7. **Report.** Give the user the commit subject, the short SHA, and the branch
   it landed on.

## Failure handling

- **Pre-commit hook modifies files** — amend the commit to include the hook's
  changes (`git add -A && git commit --amend --no-edit`), then push. Do this
  once; if the hook keeps rewriting, stop and show the user.
- **Pre-commit hook fails** — do not use `--no-verify`. Show the failure and
  let the user decide.
- **Push rejected (non-fast-forward)** — do not force push. Run
  `git pull --rebase`, resolve if clean, and push again. If the rebase hits
  conflicts, stop and hand it to the user with the conflicting paths.
- **Nothing to commit** — say so and stop. Don't create an empty commit.
