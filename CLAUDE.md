# CLAUDE.md

Obsidian plugin "Dired": an Emacs dired-style file manager rendered as a CodeMirror 6 text buffer inside a custom `ItemView`.

## Commands

```bash
npm run build   # tsc -noEmit + esbuild production → main.js
npm run lint    # eslint with eslint-plugin-obsidianmd — fix warnings too, not just errors
npm run dev     # esbuild watch
```

Deploy to the test vault:

```bash
cp main.js manifest.json styles.css ~/Vaults/Master/.obsidian/plugins/dired && obsidian plugin:reload id=dired
```

## Architecture

- `src/main.ts` — plugin entry: view registration, `open`/`open-vault-root` commands, ribbon icon, folder context-menu item, settings (`data.json` holds one `DiredSettings` object: bookmarks + preview placement), declarative settings tab (`getSettingDefinitions`, no `display()`)
- `src/view.ts` — `DiredView` hosts a standalone CM6 `EditorView` (not the markdown editor). All navigation, marks, file ops, preview, rename mode. A `Compartment` swaps normal mode (read-only + dired keymap) and rename mode (editable + Enter/Esc keymap + transactionFilter)
- `src/state.ts` — listing/text builder, buffer layout constants, decorations `StateField` driven by the `setDecorations` effect
- `src/keymap.ts` — `KeyBinding[]` at `Prec.highest`, thin delegation to view methods; chords like `c d` use CM6 multi-stroke prefixes (~4s timeout)
- `src/modals.ts` — prompt, confirm, folder-suggest (bookmarks-first), jump modals

## Invariants

- Buffer layout: line 1 = header path, line 2 = blank, entries start at line 3 (`ENTRY_START_LINE`); after the entries (or the `(empty)` placeholder) an optional blank + hint block. All line↔entry math assumes this — change `state.ts` helpers, never ad-hoc offsets.
- The buffer is read-only except in rename mode. The rename `transactionFilter` rejects newlines and any edit outside `ENTRY_START_LINE..lastEntryLine`; commit diffs lines against `renameOriginal` by index, so line count must never change while in rename mode.
- Marks are a `Set<string>` of vault paths owned by the view, pruned on every render; visuals rebuilt via `setDecorations`, never by mutating the doc.
- File operations go through Obsidian APIs only: `FileManager.renameFile` (link-aware rename/move), `FileManager.trashFile`, `Vault.create`/`createFolder`; user-entered paths through `normalizePath`. No Node `fs` — plugin is vault-scoped and mobile-compatible.
- Programmatic doc replacements carry `Transaction.addToHistory.of(false)` so undo history stays meaningful inside rename mode only.
- Vault `create`/`delete`/`rename` events schedule a debounced re-render; events are ignored while rename mode is active.

## CodeMirror dependency rules

- `@codemirror/*` are esbuild externals resolved by Obsidian at runtime — never bundle them (duplicate `@codemirror/state` instances break all extensions).
- devDependency versions must stay pinned to the `obsidian` package's peerDependencies (`@codemirror/state@6.5.0`, `@codemirror/view@6.38.6`); pick a `@codemirror/commands` release whose `state` range dedupes onto that exact version.

## Conventions

- `manifest.json` `minAppVersion` is 1.13.0 (declarative settings via `PluginSettingTab.getSettingDefinitions`); the `obsidianmd/no-unsupported-api` lint rule enforces consistency when adding API calls.
- Sentence case for all UI strings (lint-enforced — including key names: "press enter to apply").
- No default hotkeys; all interaction happens inside the focused buffer keymap.
- Styling only via `styles.css`, scoped under `.dired-view`, Obsidian CSS variables only, no `!important`, no `:has`.
- Indentation: tabs.
