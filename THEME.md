# Theming dired

Out of the box, dired matches your theme — same fonts, same colors. If you want it to look different, you can change any element of it with a small CSS snippet. This guide lists every element you can style, with ready-to-copy examples.

## Using a snippet

1. Create a file in your vault at `.obsidian/snippets/dired.css`
2. Enable it under **Settings → Appearance → CSS snippets**

Snippets load after plugin styles, so a rule with the same selector wins automatically — no `!important` needed. Copy the selectors below exactly as written.

## Selector reference

| Selector | What it styles |
| --- | --- |
| `.dired-view` | The whole view container (buffer + filter bar) |
| `.dired-view .cm-editor` | Editor frame — font family/size, background |
| `.dired-view .cm-editor.cm-focused` | The buffer while focused |
| `.dired-view .cm-scroller` | Scroll container — line height, padding |
| `.dired-view .cm-content` | Text content area |
| `.dired-view .cm-gutters` | Line-number gutter |
| `.dired-view .cm-activeLine` | The cursor line |
| `.dired-view .cm-activeLineGutter` | Gutter cell of the cursor line |
| `.dired-view .cm-line.dired-header` | Line 1 — the current path |
| `.dired-view .cm-line.dired-folder` | Folder entries |
| `.dired-view .cm-line.dired-marked` | Marked entries |
| `.dired-view .cm-line.dired-marked.cm-activeLine` | A marked entry that is also the cursor line |
| `.dired-view .cm-line.dired-empty` | The `(empty)` / `(no matches)` placeholder |
| `.dired-view .cm-line.dired-hint` | The key-hint block at the bottom |
| `.dired-view .dired-filter` | Fuzzy filter bar (visible while filtering with `/`) |
| `.dired-view .dired-filter-input` | Fuzzy filter text input |
| `.dired-view .cm-line .dired-filter-match` | Matched characters while filtering |
| `.dired-view.dired-rename-mode .cm-editor` | The buffer while in rename mode (`R`) |
| `.dired-prompt-input` | Text input in the create/prompt modals |
| `.dired-suggestion-bookmark` | Bookmark icon in the folder-suggest modal |

If a tweak stops working after a plugin update, a selector may have changed — check the plugin's `styles.css` for the current names.

## Recipes

```css
/* Larger text */
.dired-view .cm-editor {
	font-size: 18px;
}

/* Scale all dired text relative to your editor font size —
   90% here, never smaller than 12px or larger than 18px.
   Line numbers and the filter input don't inherit the buffer
   size, so they're included too. */
.dired-view {
	--dired-font-size: clamp(12px, calc(var(--font-text-size) * 0.9), 18px);
}

.dired-view .cm-editor,
.dired-view .cm-gutters,
.dired-view .dired-filter-input {
	font-size: var(--dired-font-size);
}

/* Proportional font instead of monospace
   (the plugin sets the font on both elements, so override both) */
.dired-view .cm-editor,
.dired-view .cm-scroller {
	font-family: var(--font-interface);
}

/* Hide line numbers */
.dired-view .cm-gutters {
	display: none;
}

/* Roomier rows */
.dired-view .cm-scroller {
	line-height: 1.8;
}

/* Marked rows in your theme's highlight color */
.dired-view .cm-line.dired-marked {
	background-color: var(--text-highlight-bg);
}

/* Smaller key hints (or press ? to hide them entirely) */
.dired-view .cm-line.dired-hint {
	font-size: 0.85em;
}
```

## Showcase snippet

This snippet gives every element of the view a deliberately loud style, so you can see exactly which rule controls what. Enable it, look around, then keep and tweak only the rules you want.

```css
/* ===== Dired showcase — one loud style per element ===== */

/* Whole view container (filter bar + buffer) */
.dired-view {
	border: 2px dashed magenta;
}

/* Editor frame: font and background of the whole buffer */
.dired-view .cm-editor {
	font-size: 18px;
	background: rgb(20 40 20);
}

/* Focused state of the buffer */
.dired-view .cm-editor.cm-focused {
	box-shadow: inset 0 0 0 3px orange;
}

/* Scroll container — line spacing lives here */
.dired-view .cm-scroller {
	line-height: 2;
}

/* Text content area */
.dired-view .cm-content {
	color: lightskyblue;
}

/* Line-number gutter */
.dired-view .cm-gutters {
	background: maroon;
	color: gold;
}

/* Cursor line highlight */
.dired-view .cm-activeLine {
	background: rgb(255 255 0 / 0.15);
}

/* Gutter cell of the cursor line */
.dired-view .cm-activeLineGutter {
	background: olive;
}

/* Line 1: header path */
.dired-view .cm-line.dired-header {
	color: hotpink;
	font-size: 1.4em;
}

/* Folder entries */
.dired-view .cm-line.dired-folder {
	color: springgreen;
}

/* Marked entries */
.dired-view .cm-line.dired-marked {
	background: rgb(255 0 255 / 0.25);
}

/* Marked entry that is also the cursor line */
.dired-view .cm-line.dired-marked.cm-activeLine {
	background: rgb(255 0 255 / 0.5);
}

/* "(empty)" / "(no matches)" placeholder */
.dired-view .cm-line.dired-empty {
	color: crimson;
}

/* Key-hint block at the bottom */
.dired-view .cm-line.dired-hint {
	color: tan;
	font-size: 0.8em;
}

/* Fuzzy filter bar (container, visible while filtering with /) */
.dired-view .dired-filter {
	background: darkslateblue;
}

/* Fuzzy filter text input */
.dired-view .dired-filter-input {
	color: yellow;
	font-style: italic;
}

/* Matched characters in entries while filtering */
.dired-view .cm-line .dired-filter-match {
	color: red;
	text-decoration: underline wavy;
}

/* Buffer while in rename mode (R) */
.dired-view.dired-rename-mode .cm-editor {
	background: rgb(60 20 20);
}

/* Outside the view: rename/create prompt input */
.dired-prompt-input {
	border: 2px solid magenta;
}

/* Outside the view: bookmark icon in the folder-suggest modal */
.dired-suggestion-bookmark {
	color: red;
}
```
