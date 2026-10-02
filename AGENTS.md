# herdr-pet Agent Instructions

## User Context

The user has ADHD. Reduce cognitive load and make every response easy to scan.

The user is working toward becoming an AI builder and is learning programming,
especially Python and TypeScript. When writing representative code, explain its
key behavior and the reason for the design in simple language, as a teacher would
explain it to a student. Give particular attention to system architecture.

## Communication and Documentation

- Use direct, literal language. Remove ornamental phrasing and unnecessary
  rhetorical devices.
- When an English sentence or an uncommon English term appears in Chinese prose,
  add a short Chinese translation immediately after it. Common English words and
  code identifiers do not need translations.
- Avoid rhetorical contrast patterns such as "not X but Y" unless the user
  explicitly requests a comparison. State the intended point directly.
- Do not append disclaimers to every paragraph.
- Keep process notes, discarded approaches, errors from intermediate attempts,
  and editing instructions out of finished content. Organize the result around
  the strongest final outcome.
- Present tradeoffs as tradeoffs. A weaker metric does not make the whole result
  a failure; preserve the number in the relevant table and describe it plainly.
- Design complete solutions. Do not propose an intentionally incomplete first
  version followed by a vague plan to observe and improve it later.
- Give one best solution when several options are substantially similar. When
  genuinely different options are required, each option must work independently
  and represent a meaningful choice. Do not arrange options on a generic
  conservative-to-aggressive scale.
- Use complete, standard words and phrases. Avoid one-character Chinese
  abbreviations when a common two-character or longer form exists. Keep code
  identifiers in their original English form.
- Do not invent jargon or compressed terminology. Describe concrete operations
  with complete verb-object phrases so a ten-year-old reader can understand
  them.
- Avoid unnecessary metaphors. Prefer a concrete example when an explanation is
  needed.
- Do not use vague workplace jargon such as the Chinese expressions `收口`,
  `压实`, `落盘`, `闭环`, `你来拍`, `兜底`, `对齐`, `锁住`, `收敛`, `吃掉`,
  `打穿`, `接住`, `补一刀`, `切一刀`, or `下一刀`. Use ordinary language that
  names the actual action.

## Engineering Behavior

- Make decisions that improve user experience (UX), developer experience (DX),
  and agent experience (AX) without breaking existing behavior.
- Explain the practical effect on users and maintenance when a tradeoff is
  necessary. Decide ordinary tradeoffs independently. Ask the user only when the
  difference is substantial or difficult to reverse.
- Unless explicitly requested, import required libraries directly. Do not use
  `try`/`except` around imports.
- Use appropriate dependencies. Do not reimplement established functionality or
  use convoluted techniques merely to avoid a dependency.
- Prefer fast failure: let an error surface where it occurs. Do not catch errors
  or add fallback behavior without a concrete requirement.
- Do not use mocks, fake implementations, deceptive fixtures, or test-only
  workarounds that merely make tests pass. Tests must exercise real behavior at
  the appropriate boundary.
- Do not use ASCII art for diagrams, tables, or other visualizations. Use Mermaid
  when a visualization is needed.
- Do not place long multi-line Bash programs or long inline Python programs in a
  shell command. Write a script file first when a script is needed.
- Python files must not start with a module docstring or a shebang. Write comments
  in Chinese, preserve technical terms in English, and comment only when the
  reason for a non-obvious choice needs explanation.
- When parsing a file format, prefer the language standard library or a mature
  third-party library. Do not create a custom parser when a maintained parser
  already handles the format.
- Keep references and attribution in documentation. Do not add them to source
  comments.
- Add source comments only for non-obvious reasoning or a necessary magic value.
  Do not restate behavior already made clear by names and structure.

## Resource Management

- Use no more than eight additional worktrees for this repository at one time.
- After work is validated and integrated, remove task worktrees, merged local
  branches, unnecessary build outputs, and temporary directories that are no
  longer needed.
- After test or cross-compilation runs finish or are interrupted, promptly remove
  disposable `target/`, `.zig-cache/`, `zig-out/`, and `tmp/` contents that are no
  longer needed. Check both the active worktree and any shared checkout used by
  the test command so large build artifacts do not accumulate unnoticed.
- At the end of a task, stop and clean up browsers, test servers, listeners, and
  background processes started during the task.
- Avoid starting duplicate services or generating duplicate large dependency and
  build artifacts across worktrees. Limit growth of browser profiles and logs.

## Git Commits

- Never execute `git commit` for this project, even when other repository
  instructions describe a commit workflow.
- Leave all changes uncommitted so the user can review and commit them.

## Reusable Rules Only

- Add permanent rules and comments only when they express a reusable design
  constraint.
- Do not preserve a record of an isolated agent mistake as a new permanent rule
  or source comment.
- Correct the task boundary or code structure that allowed the mistake when a
  structural correction is needed.

## Agent Skills

- Manage skills and related extensions through the `~/agents_kit` repository and
  the `agents-kit` command.
- Install skills with symbolic links.

## HERO Scope for Defensive Engineering

Report every real issue in the project, including uncommon cases that supported
project usage can produce. Keep proposed fixes within the following scope:

1. This work is not a security research paper. Validation is allowed. Do not add
   hashes, checksums, or fingerprints unless they replace a materially more
   expensive operation and the result changes the next action.
2. Say that correct behavior is correct. Do not invent a problem to fill a
   review.
3. Do not add defensive scaffolding for cases that cannot occur here, including
   feature flags, migration frameworks, compatibility layers, or wrapper layers.
4. Exclude obscure encodings, symbolic-link races, right-to-left text, and
   millisecond-scale races unless they are reachable through supported project
   usage, documented examples, public interfaces, or real project data. A merely
   theoretical construction is outside scope.

Examples that are outside scope:

- Computing a hash for every row merely to compare two tables when direct cell
  comparison answers the question.
- Writing checksum files when no code reads them.
- Hardening account security for an application with no users or deployment.
- Spending extensive review time repeatedly auditing a patch without implementing
  the requested function.
- Using a reviewer that rejects every change regardless of its contents.
- Adding one guard only because another guard exists, without a requirement that
  justifies either guard.

Examples that remain in scope:

- Using a digest comparison to avoid rereading a large file that is already
  available.
- Handling an uncommon input that the project's own documentation examples can
  produce.
