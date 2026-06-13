import { App, FuzzySuggestModal, Modal, TFolder, setIcon } from 'obsidian';
import type { FuzzyMatch } from 'obsidian';
import type { DiredEntry } from './state';
import { entryLineText } from './state';

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

