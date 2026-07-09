---
name: pr-description
description: Generate a concise, well-structured PR description for the current branch. Use this skill whenever the user asks to write, draft, or generate a pull request description, PR summary, PR body, or merge request description. Also trigger when the user says things like "describe this PR", "what changed in this branch", or "summarize changes for a PR".
---

# PR Description Generator

Generate a clear, concise pull request description by analyzing the diff between the current branch and the target branch.

## Inputs

- **Target branch** (required): the branch this PR will merge into. The user supplies this (e.g., `main`, `develop`). If the user doesn't specify, ask them.

## How to gather context

1. Run `git log <target-branch>..HEAD --oneline` to see the list of commits on this branch.
2. Run `git diff <target-branch>...HEAD` to see the full diff.
3. If the diff is very large, also run `git diff <target-branch>...HEAD --stat` to get a high-level overview of files changed, and read individual files as needed to understand the changes.

## Deciding the format

After reviewing the diff, decide whether the PR is **simple** or **complex**:

- **Simple**: the changes are straightforward additions, removals, or modifications that speak for themselves. A few files changed, a single concern addressed.
- **Complex**: the changes span multiple concerns, involve architectural decisions, or touch many files in ways that benefit from explanation.

Most PRs are simple. Default to the simple format unless the changes genuinely need explanation.

## Simple PR format

```
Title: <type>(<scope>): <short imperative title>

Release notes:

- <change 1>
- <change 2>
- ...
```

## Complex PR format

```
Title: <type>(<scope>): <short imperative title>

## Why

<1-3 sentences explaining the motivation behind these changes>

Release notes:

- <change 1>
- <change 2>
- ...
```

## Writing the title

Follow the Conventional Commits 1.0.0 style more closely and use this format: `<type>(<scope>): <description>`.

Always include a scope. Do not emit titles like `feat: ...` or `fix: ...` without one.

Common types:

- `feat` — new feature or capability
- `fix` — bug fix
- `perf` — performance improvement
- `chore` — maintenance, dependencies, tooling
- `refactor` — restructuring without behavior change
- `docs` — documentation only
- `style` — formatting, whitespace (no logic change)
- `test` — adding or updating tests

Use the smallest clear scope that describes the primary area affected by the PR, usually a domain, module, route, or subsystem such as `auth`, `gestor`, `api`, `selected-term`, `prisma`, or `docs`. If the PR touches multiple areas, choose the single scope that best explains the main purpose of the branch instead of listing several scopes.

The description after the colon uses **imperative mood** (e.g., `feat(auth): add Entra issuer validation`, not `feat(auth): added Entra issuer validation`). Think of it as completing the sentence "This PR will...".

Good title examples:

- `feat(gestor): add selected term switcher`
- `fix(auth): handle expired session redirects`
- `perf(api): reduce duplicate defense queries`
- `refactor(prisma): split committee lookup helpers`

Bad title examples:

- `feat: add selected term switcher` - missing scope
- `feat(gestor): added selected term switcher` - not imperative
- `improve(gestor): selected term switcher` - vague type and no verb

Keep the full title under 70 characters.

## Writing release notes entries

Each entry is an **elliptical sentence**: the subject is omitted and the verb is in **past simple** tense.

Good examples:

- Added utility function for parsing query parameters
- Removed deprecated authentication middleware
- Updated user creation endpoint to validate email format
- Fixed null pointer exception in defense scheduler
- Implemented committee assignment logic

Bad examples (don't do these):

- "Add utility function" (imperative, not past simple)
- "We added a utility function" (includes subject)
- "Utility function for parsing query parameters" (no verb)
- "Added utility function for parsing query parameters. This function takes a string and returns an object." (too long, should be one concise line)

## Guidelines

- One entry per logical change. If a commit touched three files to accomplish one thing, that's one entry, not three.
- Group related changes into a single entry when they serve the same purpose.
- Order entries by importance or logical flow, not by commit order.
- Leave out trivial changes (formatting, import reordering) unless they are the point of the PR.
- Keep entries factual and specific. "Improved code" is useless; "Refactored defense validation into separate module" is helpful.

## Output

Print the PR description as plain text. Do not wrap it in a code block. The user should be able to copy-paste it directly.
