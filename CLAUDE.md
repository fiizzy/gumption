@AGENTS.md

# Project conventions

- Name variables and functions with their exact full names where reasonably possible — avoid abbreviations (e.g. `parentPrompt` not `pPrompt`, `selectedIds` not `selIds`). Favor clarity over brevity in identifiers.
- Comments: default to none. Add a comment (multi-line where the explanation genuinely needs it) only for edge cases, non-obvious constraints, or context a reader couldn't infer from the code itself — never to restate what a well-named line already says.
- Colors: use only the design system's colors (the CSS custom properties / Tailwind theme tokens already defined for this project) — no inline magic hex/rgb values in components or styles.
- Constants: no magic numbers or strings inline in styles or function bodies — extract them to named constants declared at the top of the file.
- Hold code to a senior-engineer standard generally: clean, idiomatic, no unnecessary complexity.
