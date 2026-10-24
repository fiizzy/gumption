# Canvas fonts

The faces the canvas offers for text and labels, vendored so they load
offline and never fall back to a system font. All five are published under
the SIL Open Font License 1.1; each family's licence sits beside its file.

| File | Family | Source |
| --- | --- | --- |
| `patrick-hand-latin.woff2` | Patrick Hand 400 | https://fonts.google.com/specimen/Patrick+Hand |
| `nothing-you-could-do-latin.woff2` | Nothing You Could Do 400 | https://fonts.google.com/specimen/Nothing+You+Could+Do |
| `inter-variable-latin.woff2` | Inter 100–900 (variable) | https://fonts.google.com/specimen/Inter |
| `lora-variable-latin.woff2` | Lora 400–700 (variable) | https://fonts.google.com/specimen/Lora |
| `jetbrains-mono-variable-latin.woff2` | JetBrains Mono 100–800 (variable) | https://fonts.google.com/specimen/JetBrains+Mono |

Latin subsets, downloaded from the Google Fonts CSS API on 2026-10-23. To
add a face, drop its `.woff2` and `OFL.txt` here and register it in
`app/lib/fonts.ts`.
