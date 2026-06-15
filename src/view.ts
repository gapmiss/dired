import { ItemView, Notice, TFile, TFolder, normalizePath } from 'obsidian';
import type { SplitDirection, TAbstractFile, ViewStateResult, WorkspaceLeaf } from 'obsidian';

import { Compartment, EditorSelection, EditorState, Prec, Transaction } from '@codemirror/state';
import type { Extension } from '@codemirror/state';
import { EditorView, drawSelection, highlightActiveLine, keymap, lineNumbers } from '@codemirror/view';
import { history, historyKeymap, standardKeymap } from '@codemirror/commands';
import type DiredPlugin from './main';
import { diredKeymap, renameKeymap } from './keymap';
import {
	ENTRY_START_LINE,
	buildDecorations,
	buildListing,
	decorationsField,
	entryIndexForLine,
	joinPath,
	lineForEntryIndex,
	nameCollator,
	setDecorations,
} from './state';
import type { DiredEntry, DiredListing } from './state';
import { FolderSuggestModal, JumpModal, PromptModal } from './modals';

export const VIEW_TYPE_DIRED = 'dired';

export class DiredView extends ItemView {
	navigation = true;

	private plugin: DiredPlugin;
	private editor: EditorView | null = null;
	private listing: DiredListing = { folderPath: '/', entries: [] };
	private marks = new Set<string>();
	private showHints = true;
	private previewMode = false;
	private renameMode = false;
	private renameOriginal: DiredEntry[] = [];
	private modeCompartment = new Compartment();
	private previewLeaf: WorkspaceLeaf | null = null;
	private previewDirection: SplitDirection | null = null;
	private previewTimeout = 0;
	private renderTimeout = 0;
	private focusTimeout = 0;
	private filterQuery = '';
	private filterEl: HTMLElement | null = null;
	private filterInput: HTMLInputElement | null = null;
	private folderCache: TFolder[] | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: DiredPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_DIRED;
	}

	getDisplayText(): string {
		return 'Dired';
	}

	getIcon(): string {
		return 'folder-tree';
	}

	onOpen(): Promise<void> {
		this.contentEl.addClass('dired-view');
		this.editor = new EditorView({
			state: EditorState.create({ doc: '', extensions: this.buildExtensions() }),
			parent: this.contentEl,
		});
		this.registerEvent(this.app.vault.on('create', (file) => this.onVaultMutation(file, null)));
		this.registerEvent(this.app.vault.on('delete', (file) => this.onVaultMutation(file, null)));
		this.registerEvent(this.app.vault.on('rename', (file, oldPath) => this.onVaultMutation(file, oldPath)));
		this.registerEvent(
			this.app.workspace.on('active-leaf-change', (leaf) => {
				if (leaf === this.leaf) {
					// Defer so the editor takes focus after Obsidian finishes activating the leaf.
					this.focusTimeout = this.contentEl.win.setTimeout(() => this.focusEditor(), 0);
				}
			})
		);
		this.openFolder(this.app.vault.getRoot());
		this.focusEditor();
		return Promise.resolve();
	}

	onClose(): Promise<void> {
		const win = this.contentEl.win;
		win.clearTimeout(this.previewTimeout);
		win.clearTimeout(this.renderTimeout);
		win.clearTimeout(this.focusTimeout);
		this.editor?.destroy();
		this.editor = null;
		return Promise.resolve();
	}

	getState(): Record<string, unknown> {
		return { folder: this.listing.folderPath, preview: this.previewMode, hints: this.showHints };
	}

	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		await super.setState(state, result);
		if (state && typeof state === 'object') {
			const persisted = state as { folder?: unknown; preview?: unknown; hints?: unknown };
			if (typeof persisted.preview === 'boolean') {
				this.previewMode = persisted.preview;
			}
			if (typeof persisted.hints === 'boolean') {
				this.showHints = persisted.hints;
			}
			if (typeof persisted.folder === 'string') {
				this.openFolderByPath(persisted.folder);
			}
		}
	}

	setEphemeralState(state: unknown): void {
		super.setEphemeralState(state);
		if (state && typeof state === 'object' && (state as { focus?: boolean }).focus) {
			this.focusEditor();
		}
	}

	focusEditor(): void {
		this.editor?.focus();
	}

	openFolderByPath(folderPath: string, cursorPath?: string): void {
		const target = folderPath === '/' ? this.app.vault.getRoot() : this.app.vault.getAbstractFileByPath(folderPath);
		const folder = target instanceof TFolder ? target : this.app.vault.getRoot();
		if (folder.path === this.listing.folderPath) {
			// Already showing this folder; vault events keep the listing fresh, so skip the
			// re-render to preserve cursor and scroll. With a cursorPath, jump to that entry —
			// fall through to a re-render only if it is not listed yet (e.g. just created).
			const editor = this.editor;
			if (!cursorPath || !editor) {
				return;
			}
			const index = this.listing.entries.findIndex((entry) => entry.path === cursorPath);
			if (index >= 0) {
				editor.dispatch({
					selection: { anchor: editor.state.doc.line(lineForEntryIndex(index)).from },
					scrollIntoView: true,
				});
				return;
			}
		}
		this.openFolder(folder, cursorPath ?? null);
	}

	// --- Editor setup ---

	private buildExtensions(): Extension[] {
		return [
			lineNumbers(),
			highlightActiveLine(),
			decorationsField,
			this.modeCompartment.of(this.normalModeExtensions()),
			keymap.of(standardKeymap),
			EditorView.updateListener.of((update) => {
				if (update.selectionSet && !this.renameMode) {
					this.schedulePreview();
				}
			}),
			EditorView.domEventHandlers({
				dblclick: () => this.openAtCursor(),
			}),
			EditorView.editorAttributes.of({ class: 'dired-editor' }),
		];
	}

	private normalModeExtensions(): Extension {
		return [Prec.highest(keymap.of(diredKeymap(this))), EditorState.readOnly.of(true)];
	}

	private renameModeExtensions(): Extension {
		return [
			Prec.highest(keymap.of(renameKeymap(this))),
			// Scoped to the compartment so each rename session starts with a fresh
			// undo history; reconfiguring back to normal mode discards it.
			history(),
			keymap.of(historyKeymap),
			EditorState.readOnly.of(false),
			EditorState.allowMultipleSelections.of(true),
			// The browser renders only one native caret, so extra cursors must be drawn by CM.
			drawSelection(),
			EditorState.transactionFilter.of((tr) => this.filterRenameTransaction(tr)),
		];
	}

	private filterRenameTransaction(tr: Transaction): Transaction | readonly Transaction[] {
		if (!tr.docChanged) {
			return tr;
		}
		const lastEntryLine = lineForEntryIndex(this.listing.entries.length - 1);
		let allowed = true;
		tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
			if (inserted.toString().includes('\n')) {
				allowed = false;
				return;
			}
			const startLine = tr.startState.doc.lineAt(fromA);
			const endLine = tr.startState.doc.lineAt(toA);
			if (
				startLine.number !== endLine.number ||
				startLine.number < ENTRY_START_LINE ||
				startLine.number > lastEntryLine
			) {
				allowed = false;
			}
		});
		return allowed ? tr : [];
	}

	// --- Rendering ---

	private openFolder(folder: TFolder, cursorPath: string | null = null, fallbackLine?: number): void {
		const editor = this.editor;
		if (!editor) {
			return;
		}
		if (this.renameMode) {
			this.exitRenameMode();
		}
		if (folder.path !== this.listing.folderPath) {
			this.filterQuery = '';
			this.removeFilterBar();
		}
		const { listing, text } = buildListing(folder, this.app.vault.getName(), this.showHints, this.filterQuery);
		this.listing = listing;
		// Prune against the folder's full children, not the (possibly filtered) listing,
		// so marks on filtered-out entries survive.
		const valid = new Set(folder.children.map((child) => child.path));
		for (const path of Array.from(this.marks)) {
			if (!valid.has(path)) {
				this.marks.delete(path);
			}
		}
		let cursorLine = listing.entries.length > 0 ? ENTRY_START_LINE : 1;
		if (listing.entries.length > 0) {
			const lastLine = lineForEntryIndex(listing.entries.length - 1);
			if (cursorPath) {
				const index = listing.entries.findIndex((entry) => entry.path === cursorPath);
				if (index >= 0) {
					cursorLine = lineForEntryIndex(index);
				} else if (fallbackLine !== undefined) {
					cursorLine = Math.max(ENTRY_START_LINE, Math.min(lastLine, fallbackLine));
				}
			} else if (fallbackLine !== undefined) {
				cursorLine = Math.max(ENTRY_START_LINE, Math.min(lastLine, fallbackLine));
			}
		}
		// Single transaction: selection and decorations are interpreted against the
		// post-change document, so CM never paints an undecorated intermediate state.
		const newDoc = editor.state.toText(text);
		const pos = newDoc.line(Math.min(cursorLine, newDoc.lines)).from;
		editor.dispatch({
			changes: { from: 0, to: editor.state.doc.length, insert: newDoc },
			selection: { anchor: pos },
			effects: setDecorations.of(buildDecorations(newDoc, listing, this.marks)),
			annotations: Transaction.addToHistory.of(false),
			scrollIntoView: true,
		});
	}

	private refreshDecorations(): void {
		const editor = this.editor;
		if (!editor) {
			return;
		}
		editor.dispatch({ effects: setDecorations.of(buildDecorations(editor.state.doc, this.listing, this.marks)) });
	}

	private currentFolder(): TFolder | null {
		if (this.listing.folderPath === '/') {
			return this.app.vault.getRoot();
		}
		const file = this.app.vault.getAbstractFileByPath(this.listing.folderPath);
		return file instanceof TFolder ? file : null;
	}

	private onVaultMutation(file: TAbstractFile, oldPath: string | null): void {
		// Only folder events can change the folder set; renamed TFolder objects keep
		// their identity, so descendants' paths update in place either way.
		if (file instanceof TFolder) {
			this.folderCache = null;
		}
		if (this.renameMode) {
			return;
		}
		if (oldPath !== null) {
			if (this.listing.folderPath === oldPath || this.listing.folderPath.startsWith(`${oldPath}/`)) {
				// Follow renames of the current folder (or an ancestor) so the scheduled
				// refresh resolves the new path instead of falling back to the vault root.
				this.listing = {
					...this.listing,
					folderPath: file.path + this.listing.folderPath.slice(oldPath.length),
				};
			}
			for (const path of Array.from(this.marks)) {
				if (path === oldPath || path.startsWith(`${oldPath}/`)) {
					this.marks.delete(path);
					this.marks.add(file.path + path.slice(oldPath.length));
				}
			}
		}
		const parentOf = (path: string): string => {
			const index = path.lastIndexOf('/');
			return index < 0 ? '/' : path.substring(0, index);
		};
		const cwd = this.listing.folderPath;
		// On 'delete' the file is already detached (file.parent is null), so derive the parent from the path.
		const relevant =
			parentOf(file.path) === cwd ||
			file.path === cwd ||
			cwd.startsWith(`${file.path}/`) ||
			(oldPath !== null && (parentOf(oldPath) === cwd || oldPath === cwd || cwd.startsWith(`${oldPath}/`)));
		if (!relevant) {
			return;
		}
		const win = this.contentEl.win;
		win.clearTimeout(this.renderTimeout);
		this.renderTimeout = win.setTimeout(() => this.refresh(), 80);
	}

	// --- Cursor and entries ---

	private entryAtCursor(): DiredEntry | null {
		const editor = this.editor;
		if (!editor) {
			return null;
		}
		const lineNo = editor.state.doc.lineAt(editor.state.selection.main.head).number;
		const index = entryIndexForLine(lineNo, this.listing);
		return index === null ? null : this.listing.entries[index];
	}

	private targetEntries(): DiredEntry[] {
		if (this.marks.size > 0) {
			return this.listing.entries.filter((entry) => this.marks.has(entry.path));
		}
		const entry = this.entryAtCursor();
		return entry ? [entry] : [];
	}

	moveCursor(delta: number): boolean {
		const editor = this.editor;
		if (!editor || this.listing.entries.length === 0) {
			return true;
		}
		const lineNo = editor.state.doc.lineAt(editor.state.selection.main.head).number;
		const first = ENTRY_START_LINE;
		const last = lineForEntryIndex(this.listing.entries.length - 1);
		const target = Math.max(first, Math.min(last, lineNo + delta));
		editor.dispatch({ selection: { anchor: editor.state.doc.line(target).from }, scrollIntoView: true });
		return true;
	}

	// --- Marks ---

	toggleMarkAtCursor(): boolean {
		const entry = this.entryAtCursor();
		if (!entry) {
			return true;
		}
		if (this.marks.has(entry.path)) {
			this.marks.delete(entry.path);
		} else {
			this.marks.add(entry.path);
		}
		this.refreshDecorations();
		this.moveCursor(1);
		return true;
	}

	toggleAllMarks(): boolean {
		for (const entry of this.listing.entries) {
			if (this.marks.has(entry.path)) {
				this.marks.delete(entry.path);
			} else {
				this.marks.add(entry.path);
			}
		}
		this.refreshDecorations();
		return true;
	}

	unmarkAll(): boolean {
		this.marks.clear();
		this.refreshDecorations();
		return true;
	}

	markByExtension(): boolean {
		const current = this.entryAtCursor();
		const initial =
			current && !current.isFolder && current.name.includes('.') ? current.name.split('.').pop() ?? '' : '';
		new PromptModal(this.app, 'Mark by file extension', initial, 'md', (value) => {
			const extension = value.replace(/^\*?\.?/, '').toLowerCase();
			if (extension.length === 0) {
				return;
			}
			let count = 0;
			for (const entry of this.listing.entries) {
				if (!entry.isFolder && entry.name.toLowerCase().endsWith(`.${extension}`) && !this.marks.has(entry.path)) {
					this.marks.add(entry.path);
					count += 1;
				}
			}
			this.refreshDecorations();
			new Notice(`Marked ${count} file${count === 1 ? '' : 's'}`);
			this.focusEditor();
		}).open();
		return true;
	}

	// --- Navigation ---

	openAtCursor(): boolean {
		const entry = this.entryAtCursor();
		if (!entry) {
			return true;
		}
		const file = this.app.vault.getAbstractFileByPath(entry.path);
		if (file instanceof TFolder) {
			this.openFolder(file);
		} else if (file instanceof TFile) {
			void this.app.workspace.getLeaf('tab').openFile(file, { active: true });
		}
		return true;
	}

	goUp(): boolean {
		const folder = this.currentFolder();
		if (!folder || folder.isRoot()) {
			return true;
		}
		if (folder.parent) {
			this.openFolder(folder.parent, folder.path);
		}
		return true;
	}

	gotoFolder(): boolean {
		new FolderSuggestModal(this.app, this.allFolders(), 'Go to folder…', (folder) => {
			this.openFolder(folder);
			this.focusEditor();
		}).open();
		return true;
	}

	gotoAnywhere(): boolean {
		const bookmarks = this.plugin.getBookmarks();
		const all = this.allFolders();
		const bookmarked = all.filter((folder) => bookmarks.has(folder.path));
		const rest = all.filter((folder) => !bookmarks.has(folder.path));
		new FolderSuggestModal(
			this.app,
			bookmarked.concat(rest),
			'Go to bookmark or folder…',
			(folder) => {
				this.openFolder(folder);
				this.focusEditor();
			},
			bookmarks
		).open();
		return true;
	}

	toggleBookmark(): boolean {
		void this.plugin.toggleBookmark(this.listing.folderPath).then(
			(added) => new Notice(added ? 'Bookmark added' : 'Bookmark removed'),
			() => new Notice('Could not save bookmark')
		);
		return true;
	}

	jumpToEntry(): boolean {
		new JumpModal(this.app, this.listing.entries, (chosen) => {
			const editor = this.editor;
			const index = this.listing.entries.findIndex((entry) => entry.path === chosen.path);
			if (editor && index >= 0) {
				editor.dispatch({
					selection: { anchor: editor.state.doc.line(lineForEntryIndex(index)).from },
					scrollIntoView: true,
				});
			}
			this.focusEditor();
		}).open();
		return true;
	}

	refresh(): boolean {
		const editor = this.editor;
		const fallbackLine = editor ? editor.state.doc.lineAt(editor.state.selection.main.head).number : undefined;
		const cursorPath = this.entryAtCursor()?.path ?? null;
		const folder = this.currentFolder() ?? this.nearestExistingAncestor(this.listing.folderPath);
		this.openFolder(folder, cursorPath, fallbackLine);
		return true;
	}

	// When the shown folder vanishes (deleted in-app or externally), stay close:
	// climb to the nearest surviving ancestor instead of resetting to the root.
	private nearestExistingAncestor(path: string): TFolder {
		let current = path;
		while (current.includes('/')) {
			current = current.substring(0, current.lastIndexOf('/'));
			const file = this.app.vault.getAbstractFileByPath(current);
			if (file instanceof TFolder) {
				return file;
			}
		}
		return this.app.vault.getRoot();
	}

	private allFolders(): TFolder[] {
		if (this.folderCache) {
			return this.folderCache;
		}
		const folders = this.app.vault
			.getAllLoadedFiles()
			.filter((file): file is TFolder => file instanceof TFolder);
		folders.sort((a, b) => nameCollator.compare(a.path, b.path));
		this.folderCache = folders;
		return folders;
	}

	// --- Filtering ---

	startFilter(): boolean {
		if (this.renameMode) {
			return true;
		}
		this.ensureFilterBar();
		this.filterInput?.focus();
		this.filterInput?.select();
		return true;
	}

	clearFilter(): boolean {
		if (this.filterQuery.length === 0 && !this.filterEl) {
			return false;
		}
		this.filterQuery = '';
		this.removeFilterBar();
		this.refresh();
		this.focusEditor();
		return true;
	}

	private ensureFilterBar(): void {
		if (this.filterEl) {
			return;
		}
		const bar = this.contentEl.createDiv({ cls: 'dired-filter', prepend: true });
		const input = bar.createEl('input', {
			cls: 'dired-filter-input',
			type: 'search',
			value: this.filterQuery,
			placeholder: 'Filter entries…',
			attr: { 'aria-label': 'Filter entries', spellcheck: 'false' },
		});
		// Plain listeners: the bar is recreated per folder, so cleanup must follow the
		// element's lifetime, not the view's (registerDomEvent would accumulate handlers).
		input.addEventListener('input', () => this.applyFilter(input.value));
		input.addEventListener('keydown', (event) => {
			if (event.key === 'Enter') {
				event.preventDefault();
				if (input.value.length === 0) {
					this.clearFilter();
				} else {
					this.focusEditor();
				}
			} else if (event.key === 'Escape') {
				event.preventDefault();
				event.stopPropagation();
				this.clearFilter();
			}
		});
		this.filterEl = bar;
		this.filterInput = input;
	}

	private removeFilterBar(): void {
		this.filterEl?.remove();
		this.filterEl = null;
		this.filterInput = null;
	}

	private applyFilter(query: string): void {
		this.filterQuery = query;
		const cursorPath = this.entryAtCursor()?.path ?? null;
		this.openFolder(this.currentFolder() ?? this.app.vault.getRoot(), cursorPath);
	}

	// --- File operations ---

	createDirectory(): boolean {
		new PromptModal(this.app, 'Create directory', '', 'folder name', (name) => {
			void this.createInCurrentFolder(name, true);
		}).open();
		return true;
	}

	createFile(): boolean {
		new PromptModal(this.app, 'Create file', '', 'note.md', (name) => {
			void this.createInCurrentFolder(name, false);
		}).open();
		return true;
	}

	private async createInCurrentFolder(name: string, isFolder: boolean): Promise<void> {
		if (name.startsWith('.')) {
			new Notice(`Name cannot start with ".": "${name}"`);
			return;
		}
		const path = normalizePath(joinPath(this.listing.folderPath, name));
		const slash = path.lastIndexOf('/');
		const parent = slash < 0 ? '/' : path.substring(0, slash);
		try {
			if (isFolder) {
				await this.app.vault.createFolder(path);
			} else {
				if (parent !== '/' && !this.app.vault.getAbstractFileByPath(parent)) {
					await this.app.vault.createFolder(parent);
				}
				await this.app.vault.create(path, '');
			}
			// Reveal the entry where it actually lives: `name` may contain subfolders,
			// so the created item's parent can differ from the current folder.
			this.openFolderByPath(parent, path);
		} catch (error) {
			new Notice(`Dired: ${error instanceof Error ? error.message : String(error)}`);
		}
		this.focusEditor();
	}

	deleteTargets(): boolean {
		const targets = this.targetEntries();
		if (targets.length === 0) {
			return true;
		}
		void this.trashEntries(targets);
		return true;
	}

	private async trashEntries(targets: DiredEntry[]): Promise<void> {
		for (const target of targets) {
			const file = this.app.vault.getAbstractFileByPath(target.path);
			if (!file) {
				continue;
			}
			try {
				// Native deletion flow: confirmation + linked-attachment prompt,
				// per file like the core file explorer; cancel skips to the next.
				await this.app.fileManager.promptForDeletion(file);
			} catch (error) {
				new Notice(`Could not delete ${target.name}: ${error instanceof Error ? error.message : String(error)}`);
			}
		}
		this.focusEditor();
	}

	moveTargets(): boolean {
		const targets = this.targetEntries();
		if (targets.length === 0) {
			return true;
		}
		const placeholder = `Move ${targets.length} item${targets.length === 1 ? '' : 's'} to…`;
		new FolderSuggestModal(this.app, this.allFolders(), placeholder, (destination) => {
			void this.moveEntries(targets, destination);
		}).open();
		return true;
	}

	private async moveEntries(targets: DiredEntry[], destination: TFolder): Promise<void> {
		for (const target of targets) {
			const file = this.app.vault.getAbstractFileByPath(target.path);
			if (!file) {
				continue;
			}
			if (file instanceof TFolder && (destination.path === file.path || destination.path.startsWith(`${file.path}/`))) {
				new Notice(`Cannot move ${file.name} into itself`);
				continue;
			}
			if (file.parent?.path === destination.path) {
				continue;
			}
			const newPath = normalizePath(joinPath(destination.path, file.name));
			try {
				await this.app.fileManager.renameFile(file, newPath);
				// Unmark only what actually moved; the rename event may already have
				// remapped the mark onto newPath, so clear both spellings.
				this.marks.delete(target.path);
				this.marks.delete(newPath);
			} catch (error) {
				new Notice(`Could not move ${target.name}: ${error instanceof Error ? error.message : String(error)}`);
			}
		}
		this.focusEditor();
	}

	// --- Rename mode (wdired) ---

	enterRenameMode(): boolean {
		const editor = this.editor;
		if (!editor || this.renameMode || this.listing.entries.length === 0) {
			return true;
		}
		this.renameMode = true;
		this.renameOriginal = this.listing.entries.map((entry) => ({ ...entry }));
		editor.dispatch({ effects: this.modeCompartment.reconfigure(this.renameModeExtensions()) });
		this.contentEl.addClass('dired-rename-mode');
		if (this.filterInput) {
			this.filterInput.disabled = true;
		}
		new Notice('Rename mode: enter applies, esc cancels, ctrl+alt+up/down adds cursors');
		return true;
	}

	addRenameCursor(delta: -1 | 1): boolean {
		const editor = this.editor;
		if (!editor || !this.renameMode) {
			return true;
		}
		const doc = editor.state.doc;
		const selection = editor.state.selection;
		const lines = selection.ranges.map((range) => doc.lineAt(range.head).number);
		const mainLine = doc.lineAt(selection.main.head).number;
		// Moving back toward the main cursor removes the far edge of the cursor
		// column first (vscode-style overshoot correction) instead of growing.
		const farLine = delta < 0 ? Math.max(...lines) : Math.min(...lines);
		if (delta < 0 ? farLine > mainLine : farLine < mainLine) {
			const kept = selection.ranges.filter((range) => doc.lineAt(range.head).number !== farLine);
			const mainIndex = kept.findIndex((range) => range.eq(selection.main));
			editor.dispatch({
				selection: EditorSelection.create(kept, Math.max(0, mainIndex)),
				scrollIntoView: true,
			});
			return true;
		}
		const targetLine = (delta < 0 ? Math.min(...lines) : Math.max(...lines)) + delta;
		const lastEntryLine = lineForEntryIndex(this.listing.entries.length - 1);
		if (targetLine < ENTRY_START_LINE || targetLine > lastEntryLine) {
			return true;
		}
		// Place the new cursor at the main cursor's column so it stays the goal
		// column even after passing shorter names.
		const column = selection.main.head - doc.lineAt(selection.main.head).from;
		const line = doc.line(targetLine);
		const pos = line.from + Math.min(column, line.length);
		editor.dispatch({
			selection: selection.addRange(EditorSelection.cursor(pos), false),
			effects: EditorView.scrollIntoView(pos),
		});
		return true;
	}

	cancelRename(): boolean {
		if (!this.renameMode) {
			return true;
		}
		const editor = this.editor;
		if (editor && editor.state.selection.ranges.length > 1) {
			editor.dispatch({ selection: { anchor: editor.state.selection.main.head } });
			return true;
		}
		this.exitRenameMode();
		this.refresh();
		return true;
	}

	commitRename(): boolean {
		const editor = this.editor;
		if (!editor || !this.renameMode) {
			return true;
		}
		const doc = editor.state.doc;
		const renames: { entry: DiredEntry; newPath: string }[] = [];
		for (let index = 0; index < this.renameOriginal.length; index += 1) {
			const entry = this.renameOriginal[index];
			const lineNo = lineForEntryIndex(index);
			if (lineNo > doc.lines) {
				break;
			}
			let newName = doc.line(lineNo).text.trim();
			if (entry.isFolder && newName.endsWith('/')) {
				newName = newName.slice(0, -1);
			}
			if (newName === entry.name) {
				continue;
			}
			if (newName.length === 0) {
				new Notice(`Empty name on line ${lineNo}`);
				return true;
			}
			if (newName.startsWith('.')) {
				new Notice(`Name cannot start with ".": "${newName}"`);
				return true;
			}
			renames.push({ entry, newPath: normalizePath(joinPath(this.listing.folderPath, newName)) });
		}
		const renameSources = new Set(renames.map((r) => r.entry.path));
		const existing = new Set(
			this.renameOriginal.map((e) => e.path).filter((p) => !renameSources.has(p)),
		);
		const destCounts = new Map<string, number>();
		for (const { newPath } of renames) {
			destCounts.set(newPath, (destCounts.get(newPath) ?? 0) + 1);
		}
		const conflicts: string[] = [];
		for (const [dest, count] of destCounts) {
			if (count > 1) {
				const name = dest.slice(dest.lastIndexOf('/') + 1);
				conflicts.push(`Cannot rename ${count} items to the same name "${name}"`);
			} else if (existing.has(dest)) {
				const name = dest.slice(dest.lastIndexOf('/') + 1);
				conflicts.push(`"${name}" already exists`);
			}
		}
		if (conflicts.length > 0) {
			for (const msg of conflicts) {
				new Notice(msg);
			}
			return true;
		}
		this.exitRenameMode();
		if (renames.length === 0) {
			this.refresh();
			return true;
		}
		void this.applyRenames(renames);
		return true;
	}

	private exitRenameMode(): void {
		this.renameMode = false;
		this.renameOriginal = [];
		this.contentEl.removeClass('dired-rename-mode');
		if (this.filterInput) {
			this.filterInput.disabled = false;
		}
		const editor = this.editor;
		if (editor) {
			// Collapse any multi-cursor in the same transaction that disables multiple selections.
			editor.dispatch({
				selection: { anchor: editor.state.selection.main.head },
				effects: this.modeCompartment.reconfigure(this.normalModeExtensions()),
			});
		}
	}

	private async applyRenames(renames: { entry: DiredEntry; newPath: string }[]): Promise<void> {
		// Order so no rename targets a path another pending rename still occupies
		// (chains like a→b + b→c); break pure cycles (swaps) via a temporary name.
		const occupied = new Set(renames.map((rename) => rename.entry.path));
		const pending = [...renames];
		const ordered: typeof pending = [];
		while (pending.length > 0) {
			const index = pending.findIndex((rename) => !occupied.has(rename.newPath));
			if (index >= 0) {
				const [next] = pending.splice(index, 1);
				occupied.delete(next.entry.path);
				ordered.push(next);
				continue;
			}
			const cycled = pending[0];
			occupied.delete(cycled.entry.path);
			const file = this.app.vault.getAbstractFileByPath(cycled.entry.path);
			if (file) {
				const temp = `${cycled.entry.path}.dired-tmp-${Date.now()}`;
				try {
					await this.app.fileManager.renameFile(file, temp);
					pending[0] = { entry: { ...cycled.entry, path: temp }, newPath: cycled.newPath };
				} catch (error) {
					// Keep the original path; the final rename attempt will surface the error.
					console.error('dired: could not divert rename through a temporary name', error);
				}
			}
		}
		let failures = 0;
		for (const { entry, newPath } of ordered) {
			const file = this.app.vault.getAbstractFileByPath(entry.path);
			if (!file) {
				failures += 1;
				new Notice(`Could not rename ${entry.name}: file no longer exists`);
				continue;
			}
			try {
				await this.app.fileManager.renameFile(file, newPath);
			} catch (error) {
				failures += 1;
				new Notice(`Could not rename ${entry.name}: ${error instanceof Error ? error.message : String(error)}`);
			}
		}
		const done = ordered.length - failures;
		if (done > 0) {
			new Notice(`Renamed ${done} item${done === 1 ? '' : 's'}`);
		}
		this.refresh();
	}

	// --- Preview mode ---

	togglePreviewMode(): boolean {
		this.previewMode = !this.previewMode;
		this.app.workspace.requestSaveLayout();
		new Notice(`Preview mode ${this.previewMode ? 'on' : 'off'}`);
		if (this.previewMode) {
			this.schedulePreview();
		}
		return true;
	}

	private schedulePreview(): void {
		if (!this.previewMode) {
			return;
		}
		const win = this.contentEl.win;
		win.clearTimeout(this.previewTimeout);
		this.previewTimeout = win.setTimeout(() => {
			this.showPreview().catch((error: unknown) => console.error('dired: preview failed', error));
		}, 150);
	}

	private async showPreview(): Promise<void> {
		if (!this.previewMode) {
			return;
		}
		const entry = this.entryAtCursor();
		if (!entry || entry.isFolder) {
			return;
		}
		const file = this.app.vault.getAbstractFileByPath(entry.path);
		if (!(file instanceof TFile)) {
			return;
		}
		if (!this.app.viewRegistry.getTypeByExtension(file.extension)) {
			return;
		}
		const direction: SplitDirection = this.plugin.settings.previewPlacement === 'bottom' ? 'horizontal' : 'vertical';
		if (this.previewLeaf && (!this.isLeafAttached(this.previewLeaf) || this.previewDirection !== direction)) {
			if (this.isLeafAttached(this.previewLeaf)) {
				this.previewLeaf.detach();
			}
			this.previewLeaf = null;
		}
		if (!this.previewLeaf) {
			this.previewLeaf = this.app.workspace.createLeafBySplit(this.leaf, direction);
			this.previewDirection = direction;
		}
		await this.previewLeaf.openFile(file, { active: false });
	}

	private isLeafAttached(leaf: WorkspaceLeaf): boolean {
		let attached = false;
		this.app.workspace.iterateAllLeaves((candidate) => {
			if (candidate === leaf) {
				attached = true;
			}
		});
		return attached;
	}

	// --- Help ---

	toggleHints(): boolean {
		this.showHints = !this.showHints;
		this.app.workspace.requestSaveLayout();
		this.refresh();
		return true;
	}
}
