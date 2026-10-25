# Gumption

An agentic whiteboard. Describe what you want to understand, and it gets sketched onto the canvas in a hand-drawn style while you watch.

- **Ask in the chat** on the left: "a square connected to a circle", "sign-in flow with a password reset branch". The agent answers with a sentence and a drawing, and follow-ups ("add a cache between those two") redraw with the change. The conversation is saved with the project.
- **Connect a codebase** to a project and ask about it: "architecture overview", "how does a request flow through the app?". Claude reads and searches the folder, never changes it, and draws what it finds.
- **Drawing streams in.** Shapes appear as the agent works out each part, a hand-drawn "Working…" sign sits above the diagram until it's done, the view follows the growing drawing, and the whole thing is one undo step.
- **Pictures where they help.** People, devices and physical things can be drawn as small hand-drawn pictograms (a shopper, a database, a courier) that appear stroke by stroke; file paths and remarks become handwritten side-notes pointing at their shape.
- **Everything is still a whiteboard.** Draw, move, restyle and annotate by hand; export to PNG or SVG; switch between projects from the menu at the top of the chat.

The agent is [Claude Code](https://docs.anthropic.com/en/docs/claude-code), run locally through the desktop shell with read-only tools. Nothing leaves the machine except the request Claude Code itself makes.

## Running it

```bash
npm install
npm run tauri:dev    # the desktop app (needs Rust and the Claude Code CLI on PATH)
npm run dev          # the canvas alone in a browser, without the agent
npm run test:e2e     # Playwright tests against the dev server, with the agent stubbed
```

## How the agent draws

Claude answers with a stream of one-line JSON operations (`plan`, `shape`, `connect`, `update`, `remove`, `note`, `done`) instead of prose. The plan names a diagram kind (flowchart, swimlane, layers, sequence, site map, tree, mind map, grid, mockup or screen flow), and the app lays the shapes out as they arrive with the engine for that kind, so the agent names what goes where and the canvas owns every coordinate. The kind can also be pinned from the picker beside the composer. Every drawing sits on an artboard (its frame) that carries the diagram's model and the ids of every node it drew: the artboard moves, duplicates and deletes as one, and selecting it (or anything on it) makes the next message change that drawing in place instead of adding a new one. See `app/lib/diagram/` for the protocol, the layout engines, and the system prompt; `e2e/golden/` holds a reference drawing per kind, rendered to `e2e/golden/output/` by `npx playwright test e2e/golden.spec.ts`.
