# Dired user guide

Dired shows a folder as a plain text buffer. Each line is one file or folder, and you act on the line under the cursor with a single key. If you've used Dired in Emacs, you'll feel at home. If you haven't, this guide walks through everything.

## Opening dired

There are four ways in:

- **Command palette:** "Dired: Open" opens the folder of the file you're editing, with the cursor on that file.
- **Command palette:** "Dired: Open vault root" opens the top of your vault.
- **Ribbon:** click the folder-tree icon. It does the same as "Dired: Open".
- **File explorer:** right-click any folder and choose "Open in dired".

Dired uses one tab. If it's already open, "Dired: Open" brings it to the front exactly as you left it instead of jumping to a new folder.

The plugin sets no hotkeys. If you want one, assign it to "Dired: Open" under Settings → Hotkeys.

## Reading the buffer

```
MyVault/Projects/

Archive/
Ideas/
meeting-notes.md
roadmap.md
todo.md

 m = toggle mark
 ...
```

- The first line is the folder you're in.
- Folders end with `/`. Everything is sorted by name, with numbers in natural order (`2` before `10`).
- The block at the bottom lists every key. Press `?` to hide or show it.
- An empty folder shows `(empty)`.

The buffer is read-only. Arrow keys, `Home`, `End`, `Page Up`/`Page Down`, and mouse clicks all move the cursor like a normal editor. Letter keys run commands instead of typing.

## Moving around

| Key | What it does |
| --- | --- |
| `n` / `p` | Next / previous entry |
| `Enter` or `o` | Open the file in a new tab, or step into the folder |
| Double-click | Same as `Enter` |
| `u` | Go up to the parent folder, with the cursor on the folder you came from |
| `g` | Pick any folder in the vault by name |
| `j` | Pick an entry in the current folder by name and put the cursor on it |
| `r` | Refresh the listing |

You rarely need `r`. Dired watches the vault and updates on its own when files are created, deleted, or renamed, even by other plugins or sync. If the folder you're viewing is deleted, dired moves up to the nearest folder that still exists.

## Filtering

Press `/` to open a filter bar above the listing. Type a few letters and the listing shrinks to entries that fuzzy-match, with the matched letters highlighted. `mtg` finds `meeting-notes.md`, for example.

- `Enter` returns to the buffer and keeps the filter, so you can mark or open entries.
- `Esc` clears the filter. This works from the filter bar or from the buffer.
- Moving to another folder clears the filter.

Everything else works on the filtered list, including rename mode.

## Marking

Marks let you pick several entries and act on them together. Marked lines get a highlight and a bar on the left edge.

| Key | What it does |
| --- | --- |
| `m` | Mark or unmark the entry at the cursor, then move down one line |
| `t` | Flip every mark: marked entries become unmarked and the rest become marked |
| `U` | Clear all marks |
| `*` then `.` | Mark every file with a given extension |

`*` `.` asks for an extension and fills in the extension of the file at the cursor. You can type `md`, `.md`, or `*.md`. It only adds marks and never removes them.

Marks belong to the folder you're in. They're kept while you filter, and they follow files that get renamed. When a file disappears, its mark goes with it.

## Moving and deleting

| Key | What it does |
| --- | --- |
| `M` | Move entries to another folder |
| `D` | Delete entries |

Both keys act on the marked entries if there are any. With nothing marked, they act on the entry at the cursor. With a filter active, only marked entries you can currently see are included.

**Moving.** `M` opens a folder picker with your bookmarked folders at the top. Type to narrow it down and press `Enter`. If you type a path that doesn't exist yet, the first suggestion is "Create *path*/", which creates the folder and moves everything into it. Obsidian updates links to moved files the same way it does when you drag files in the file explorer.

A few things are skipped on purpose: moving a folder into itself, and moving an entry to the folder it's already in. Entries that moved are unmarked afterward.

**Deleting.** `D` uses Obsidian's own delete flow, one file at a time. That means your settings under Settings → Files and links apply: whether to confirm, and whether files go to the system trash, the vault's `.trash` folder, or are removed for good. If a note has attachments, Obsidian may offer to delete those too. Cancelling a prompt skips that file and moves on to the next one.

## Renaming

Press `R` to enter rename mode. The buffer becomes editable and gets an accent border. Edit the names right in the buffer, then:

- `Enter` applies every change at once.
- `Esc` cancels and puts all the names back.

You can only edit entry lines. Lines can't be added or removed, so every line keeps pointing at the same file. A trailing `/` on a folder name is optional.

**Many names at once.** `Ctrl+Alt+↑` and `Ctrl+Alt+↓` add a cursor on the line above or below (on macOS, `Ctrl+Option`). Whatever you type then goes onto every line. Pressing the opposite arrow removes the last cursor you added. `Esc` with several cursors drops back to one; a second `Esc` cancels rename mode.

**Undo.** `Ctrl+Z` / `Cmd+Z` undoes edits while you're in rename mode. Outside rename mode there's nothing to undo, so those keys do nothing.

**Moving by renaming.** Type a relative path to move a file into a subfolder that already exists. For example, changing `todo.md` to `Archive/todo.md` moves it into `Archive`.

**Swaps work.** Renaming `a.md` to `b.md` and `b.md` to `a.md` in one go is fine. Dired sorts out the order.

**Checks before anything changes.** Dired refuses the whole batch and tells you why if any of these are true:

- A name is empty.
- A name starts with `.` (Obsidian hides dotfiles, so the file would vanish from your vault).
- Two entries would end up with the same name.
- A new name matches an entry you didn't rename.

Either every rename goes through or none do. As with moves, Obsidian updates links to renamed files.

## Creating files and folders

| Key | What it does |
| --- | --- |
| `c` then `d` | Create a folder |
| `c` then `f` | Create a file |

Press the two keys one after the other, not together. You get about four seconds between them.

Type a name and press `Enter`. Include the extension for files, such as `note.md`. You can type a path like `drafts/2026/note.md`, and any missing folders are created along the way. The cursor lands on the new entry. Names starting with `.` are rejected.

## Bookmarks

| Key | What it does |
| --- | --- |
| `a` then `b` | Bookmark the current folder, or remove its bookmark |
| `B` | Pick a folder, with bookmarks listed first |

In the `B` picker, bookmarked folders sit at the top and have a bookmark icon. Type to search every folder in the vault.

Bookmarks keep working when you rename or move a bookmarked folder. If you delete it, the bookmark goes away.

## Preview mode

Press `P` to turn preview mode on or off. While it's on, moving the cursor onto a file opens it in a split next to dired. Your cursor stays in dired, so you can keep scrolling through files with `n` and `p` and watch them change.

Folders aren't previewed, and neither are files Obsidian can't open.

To put the preview below dired instead of beside it, go to Settings → Dired → Preview placement and choose "Split down".

## What dired remembers

Across restarts, dired keeps:

- the folder it was showing
- whether preview mode is on
- whether the key hints are showing
- your bookmarks

Marks and filters are cleared when you close dired or restart Obsidian.

## Limitations

- Dired only shows what Obsidian shows. Dotfiles and dotfolders, such as `.obsidian`, never appear.
- It shows one folder at a time. There's no tree view and no recursive listing.
- Nearly everything is done from the keyboard. On a phone or tablet you'll want a hardware keyboard.

## Changing the look

Dired uses your theme's monospace font, editor font size, and colors. To change anything, see [THEME.md](THEME.md). It lists every CSS class and has copy-paste examples.
