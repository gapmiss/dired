# Dired

Navigate and manage vault files from a keyboard-driven text buffer, inspired by the [Dired mode](https://www.gnu.org/software/emacs/manual/html_node/emacs/Dired.html) from Emacs.

The directory listing is a real CodeMirror buffer: the first line is the current path, folders end with `/`, and every operation is a single key (or two-key chord) away.

## Features

- **Text-buffer file manager** — navigate with the cursor, no mouse required
- **Marks** — mark multiple files, then move or delete them in one batch
- **Rename mode (wdired-style)** — press `R`, edit names directly in the buffer, press `Enter` to apply. Renames and moves go through Obsidian's `FileManager`, so wiki links and embeds are updated automatically
- **Safe deletes** — files are moved to trash (respects your "Deleted files" preference), with a confirmation listing
- **Bookmarks** — bookmark folders and fuzzy-jump to them from anywhere
- **Preview mode** — automatically open the file at the cursor in a split as you move
- **Inline key hints** — the bottom of the buffer lists every binding; toggle with `?`
- **Auto-refresh** — the listing stays in sync as the vault changes

## Key bindings

| Key | Action |
| --- | --- |
| `m` | Toggle mark (and advance) |
| `t` | Toggle all marks |
| `U` | Unmark all |
| `*.` | Mark by file extension |
| `Enter` / `o` | Open file / view directory |
| `R` | Rename mode — edit names in the buffer, `Enter` applies, `Esc` cancels |
| `M` | Move marked files (or file at cursor) |
| `D` | Delete marked files (or file at cursor) to trash |
| `cd` | Create directory |
| `cf` | Create file |
| `u` | Up to parent directory |
| `g` | Go to directory |
| `B` | Go to bookmark or any directory |
| `ab` | Toggle bookmark for current directory |
| `p` / `n` | Move to previous / next file |
| `j` | Jump to file/dir name |
| `r` | Refresh view |
| `P` | Toggle preview mode on/off |
| `?` | Toggle key hints |

Multi-file operations (`M`, `D`) apply to marked files, or to the file at the cursor when nothing is marked. In rename mode you can also type a relative path (for example `sub/note.md`) to move a file into an existing subfolder.

## Usage

- Command palette: **Dired: Open** (starts in the active file's folder) or **Dired: Open vault root**
- Ribbon: the folder-tree icon
- File explorer: right-click a folder → **Open in dired**

## Notes and limitations

- Vault-scoped: the listing shows what Obsidian indexes, so hidden folders such as `.obsidian` do not appear
- Marks live per view and are pruned automatically when files disappear
- The buffer is read-only outside rename mode; arrow keys, `Home`/`End`, and selection all work as in a normal editor

## Installation

[Install from community.obsidian.md](https://community.obsidian.md/plugins/dired)

From Obsidian's settings or preferences:

1. Community Plugins > Browse
2. Search for "Dired"

Manually:

1. download the latest [release](https://github.com/gapmiss/dired/releases/latest) archive
2. uncompress the downloaded archive
3. move the `dired` folder to `/path/to/vault/.obsidian/plugins/` 
4.  Settings > Community plugins > reload **Installed plugins**
5.  enable plugin

or:

1.  download `main.js`, `manifest.json` & `styles.css` from the latest [release](https://github.com/gapmiss/dired/releases/latest)
2.  create a new folder `/path/to/vault/.obsidian/plugins/dired`
3.  move all 3 files to `/path/to/vault/.obsidian/plugins/dired`
4.  Settings > Community plugins > reload **Installed plugins**
5.  enable plugin

## Development

```bash
npm install
npm run dev     # esbuild watch
npm run build   # type-check + production build
npm run lint    # eslint (eslint-plugin-obsidianmd)
```

## License

[MIT](LICENSE)
