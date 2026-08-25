# CLAUDE.md

The specs of the project can be seen in specs/24-build-spec.md
When finishing any step, if you followed an implementation plan, check the current stage, go through each current stage step and check its acceptance criteria, if passing, mark the step as checked. If all the steps of the stage are checked, the stage is also checked and completed, and you recommend a review and pull request for the stage.
Any time you arrive at an open decision or some cotradictory thing, you resolve the decision using AskUserQuestion.
The commit messages must be succinct, no over-the-top explanation of what was changed.
On each new change request, check the current branch, if the current branch is not appropriate, branch from main.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
