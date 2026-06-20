import { App, FuzzySuggestModal, Modal, SuggestModal, TFolder, normalizePath, setIcon } from 'obsidian';
import type { FuzzyMatch } from 'obsidian';
import type { DiredEntry } from './state';
import { entryLineText } from './state';

type MoveItem = { kind: 'existing'; folder: TFolder } | { kind: 'create'; path: string };

export class PromptModal extends Modal {
	constructor(
		app: App,
		private promptTitle: string,
		private initial: string,
		private placeholder: string,
		private onSubmit: (value: string) => void
	) {
		super(app);
		this.setTitle(promptTitle);
	}

	onOpen(): void {
		const input = this.contentEl.createEl('input', {
			type: 'text',
			value: this.initial,
			placeholder: this.placeholder,
			cls: 'dired-prompt-input',
			attr: { 'aria-label': this.promptTitle },
		});
		input.addEventListener('keydown', (evt) => {
			if (evt.key === 'Enter') {
				evt.preventDefault();
				const value = input.value.trim();
				this.close();
				if (value.length > 0) {
					this.onSubmit(value);
				}
			}
		});
		input.focus();
		input.select();
	}
}

export class FolderSuggestModal extends FuzzySuggestModal<TFolder> {
	constructor(
		app: App,
		private folders: TFolder[],
		placeholder: string,
		private onChoose: (folder: TFolder) => void,
		private bookmarkedPaths: ReadonlySet<string> = new Set()
	) {
		super(app);
		this.setPlaceholder(placeholder);
	}

	getItems(): TFolder[] {
		return this.folders;
	}

	getItemText(folder: TFolder): string {
		return folder.isRoot() ? '/' : folder.path;
	}

	renderSuggestion(match: FuzzyMatch<TFolder>, el: HTMLElement): void {
		super.renderSuggestion(match, el);
		if (this.bookmarkedPaths.has(match.item.path)) {
			const iconEl = el.createSpan({ cls: 'dired-suggestion-bookmark', attr: { 'aria-label': 'Bookmarked' } });
			setIcon(iconEl, 'bookmark');
		}
	}

	onChooseItem(folder: TFolder): void {
		this.onChoose(folder);
	}
}

export class MoveSuggestModal extends SuggestModal<MoveItem> {
	constructor(
		app: App,
		private folders: TFolder[],
		placeholder: string,
		private onChooseItem_: (item: MoveItem) => void,
		private bookmarkedPaths: ReadonlySet<string> = new Set()
	) {
		super(app);
		this.setPlaceholder(placeholder);
	}

	getSuggestions(query: string): MoveItem[] {
		const lower = query.toLowerCase();
		const scored: { item: MoveItem; score: number }[] = [];
		for (const folder of this.folders) {
			const text = folder.isRoot() ? '/' : folder.path;
			const s = fuzzyScore(text.toLowerCase(), lower);
			if (s > 0 || lower.length === 0) {
				scored.push({ item: { kind: 'existing', folder }, score: s });
			}
		}
		scored.sort((a, b) => b.score - a.score);
		const items = scored.map((s) => s.item);
		if (query.length > 0 && query.includes('/')) {
			const normalized = normalizePath(query);
			if (
				normalized.length > 0 &&
				!normalized.startsWith('.') &&
				!this.folders.some((f) => f.path === normalized)
			) {
				items.unshift({ kind: 'create', path: normalized });
			}
		}
		return items;
	}

	renderSuggestion(item: MoveItem, el: HTMLElement): void {
		if (item.kind === 'create') {
			el.addClass('dired-suggestion-row');
			el.createDiv({ cls: 'suggestion-content' }, (content) => {
				content.createDiv({ cls: 'suggestion-title', text: `Create ${item.path}/` });
			});
			const iconEl = el.createSpan({ cls: 'dired-suggestion-create', attr: { 'aria-label': 'New folder' } });
			setIcon(iconEl, 'folder-plus');
		} else {
			const text = item.folder.isRoot() ? '/' : item.folder.path;
			const hasIcon = this.bookmarkedPaths.has(item.folder.path);
			if (hasIcon) {
				el.addClass('dired-suggestion-row');
			}
			el.createDiv({ cls: 'suggestion-content' }, (content) => {
				content.createDiv({ cls: 'suggestion-title', text });
			});
			if (hasIcon) {
				const iconEl = el.createSpan({ cls: 'dired-suggestion-bookmark', attr: { 'aria-label': 'Bookmarked' } });
				setIcon(iconEl, 'bookmark');
			}
		}
	}

	onChooseSuggestion(item: MoveItem): void {
		this.onChooseItem_(item);
	}
}

function fuzzyScore(text: string, query: string): number {
	if (query.length === 0) {
		return 1;
	}
	let ti = 0;
	let score = 0;
	for (let qi = 0; qi < query.length; qi++) {
		const ch = query[qi];
		while (ti < text.length && text[ti] !== ch) {
			ti++;
		}
		if (ti >= text.length) {
			return 0;
		}
		score += 1;
		ti++;
	}
	return score / text.length;
}

export class JumpModal extends FuzzySuggestModal<DiredEntry> {
	constructor(app: App, private entries: DiredEntry[], private onChoose: (entry: DiredEntry) => void) {
		super(app);
		this.setPlaceholder('Jump to file or folder name…');
	}

	getItems(): DiredEntry[] {
		return this.entries;
	}

	getItemText(entry: DiredEntry): string {
		return entryLineText(entry);
	}

	onChooseItem(entry: DiredEntry): void {
		this.onChoose(entry);
	}
}

