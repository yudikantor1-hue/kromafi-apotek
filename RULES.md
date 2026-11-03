# Project Rules

## Language

- Speak to the client in **Indonesian** in the conversation, including progress updates, explanations, questions, and summaries. Keep technical terms in plain, familiar Indonesian.
- Write all project files in English, including source code, documentation, comments, user-facing text, and configuration descriptions. The only exception is text the pharmacy staff sees inside the application, which stays in Indonesian.
- Keep terminology clear and consistent throughout the project.
- When documenting a system, distinguish verified implementation details from planned or proposed behavior.
- The AI may create, read, update, and delete Markdown files when needed for the project. Make changes carefully, preserve unrelated content, and avoid deleting files unless deletion is necessary for the task.

## Markdown documentation rules

- Keep all project documentation in English.
- Use one document per primary purpose. Do not duplicate the same information across multiple Markdown files unless a second document requires a summary or a different audience-specific view.
- Treat the following files as the project baseline:
  - [README.md](README.md) — the two roles, how to contact the client, and the project contents inventory
  - [RULES.md](RULES.md) — project rules, communication workflow, and documentation standards
  - [PLAN.md](PLAN.md) — roadmap, status, risks, and open decisions
  - [TABLE.md](TABLE.md) — database and storage inventory
  - [UI/README.md](UI/README.md) — approved UI prototype baseline
- Create new Markdown files only when they add a distinct and necessary purpose, such as product requirements, system design, deployment operations, or acceptance testing.
- If a new document is created, add it to the project contents inventory in [README.md](README.md) and make sure its purpose is clear in the document itself.
- Update existing Markdown files when project scope, architecture, or data model changes. Do not leave obsolete statements uncorrected.
- Remove or archive Markdown files that are obsolete and no longer relevant. Do not keep stale documents that contradict current project direction.
- Distinguish clearly between verified facts, planned work, and open decisions.

## `PLAN.md` numbering and structure

- Structure the plan in three numbered levels and nothing else: **phase** `1`, **subphase** `1.1`, **sub-subphase** `1.1.1`. Write the number at the start of the item. Do not leave unnumbered bullet points in the plan.
- Use `##` for a phase, `###` for a subphase, and a numbered list item (`- **1.1.1** …`) for a sub-subphase. Never skip a level: a `1.1.1` always sits under a `1.1`, and a `1.1` always sits under a `1`.
- Give every item a state: a percentage from the allowed scale, or a decision state (**Open**, **Answered**, **Approved**, **Blocked**). An item with neither is an incomplete entry.
- Record every question that needs an answer, a confirmation, or a decision as a numbered item in the plan's decision phase. Each one states the question, why it is needed, who decides (usually the client), its current state, and the recorded answer once given. Never leave a decision only in the conversation.
- Keep the id of a decision stable once another document references it (for example `B15`, `P1`). Moving an item changes its number, never its id.
- Add new scope as a new numbered subphase or sub-subphase inside the phase it belongs to. Do not append a loose paragraph or bullet list outside the numbering.
- Keep the progress summary table aligned with the numbered phases, and keep every percentage on the 0/25/50/75/100 scale at every level.
- Keep observed facts, implemented behaviour, planned work, and open decisions in separate numbered items so a reader can tell them apart.

## Communication workflow

Our communication and delivery workflow is:

1. The client provides a task.
2. The AI defines the expected final outcome as a list of bullet points.
3. The client and the AI discuss the outcome if clarification is needed.
4. The client approves the outcome.
5. The AI creates a todo list.
6. The client and the AI discuss the todo list if clarification is needed.
7. The client approves the todo list.
8. The AI executes the approved work.

## Client communication guidelines

- Ask one clear, easy-to-understand question at a time, and keep each question focused on a single topic.
- Use simple, familiar language when communicating with the client. Explain technical terms plainly when they are necessary.

## Session start

- At the start of every new session or chat, read the *Current state and handoff* section of [README.md](README.md) first; it names what is implemented and deployed, the live URL, the checks to run, and the deploy commands.
- Then read phase 10 of [PLAN.md](PLAN.md) (questions to answer, confirm, or decide) and the progress summary in phase 16 before continuing. B15, B16, and B17 (scope, todo list, and authorization to start production code) are approved and recorded in 10.1.17–10.1.19.
- Inspect [ai_telegram.py](ai_telegram.py) and confirm what it does, which message it sends, and where it sends the message before using it, then run it once to verify that Telegram delivery works. Running it sends a predefined Telegram message to its configured recipient; this test is intentional even when the client is available.

## Contacting the client when they are away

- The client may step away from the computer while the AI is working. When a response or decision is needed, run the script from the project directory in the terminal:

  ```
  py ai_telegram.py
  ```

  `python .\ai_telegram.py` is equivalent when the `python` launcher is on `PATH`.

- The script reads the bot token from the `TELEGRAM_BOT_TOKEN` environment variable. Configure it for the Windows user before running the script; after changing an environment variable, restart VS Code and open a new terminal so the terminal can read the updated value.

## Using `PLAN.md`

- Use `PLAN.md` as the general lifecycle guide for turning the client's vision into a usable custom application. Adapt its steps to the approved scope; it is a roadmap, not a substitute for client approval or a detailed task list.
- Keep current-state claims factual: `UI/` is the client-approved prototype, and the production application in `app/` exists, is tested, and is deployed to the client's own Cloudflare account as a trial, but it currently covers eight of the 18 menus (Barang, Jasa, Petugas, Lemari, Metode pembayaran, Dokter, Distributor, and Profil apotek) on the shared access control, offline outbox, sync, and encrypted export/import engine. Describe every other frontend, API, database, and workflow area as planned until it is implemented and verified.
- Work through the plan in sequence where practical. Record actionable implementation tasks separately, and do not begin execution before the client approves the expected outcomes and todo list.
- Report project progress using only these percentage values: **0%, 25%, 50%, 75%, and 100%**.
- Use the scale consistently:
  - **0%** — Not started.
  - **25%** — Started; initial work or discovery is underway.
  - **50%** — Approximately halfway complete; substantial work remains.
  - **75%** — Nearly complete; remaining work is limited, such as final implementation or validation.
  - **100%** — Complete and checked against the agreed completion criteria.
- Report an overall progress value and, when useful, show phase, task, subtask, or sub-subtask progress as nested bullet points. Use the same percentage scale at every level.
- Base progress on completed, verifiable work rather than elapsed time. Explain blockers or important changes alongside the percentage, and do not mark work 100% until its completion criteria have been verified.
