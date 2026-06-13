import { Plugin, PluginSettingTab, TFolder } from 'obsidian';
import type { App, SettingDefinitionItem } from 'obsidian';
import { DiredView, VIEW_TYPE_DIRED } from './view';

export interface DiredSettings {
	bookmarks: string[];
	previewPlacement: 'right' | 'bottom';
}

const DEFAULT_SETTINGS: DiredSettings = {
	bookmarks: [],
	previewPlacement: 'right',
};

export default class DiredPlugin extends Plugin {
	settings: DiredSettings = { ...DEFAULT_SETTINGS, bookmarks: [] };

	async onload(): Promise<void> {
		await this.loadSettings();

		this.registerView(VIEW_TYPE_DIRED, (leaf) => new DiredView(leaf, this));

		this.addSettingTab(new DiredSettingTab(this.app, this));

		this.addCommand({
			id: 'open',
			name: 'Open',
			callback: () => {
				void this.openDiredAtActiveFile();
			},
		});

		this.addCommand({
			id: 'open-vault-root',
			name: 'Open vault root',
			callback: () => {
				void this.openDired('/');
			},
		});

		this.addRibbonIcon('folder-tree', 'Open dired', () => {
			void this.openDiredAtActiveFile();
		});

		this.registerEvent(
			this.app.vault.on('delete', (file) => {
				if (file instanceof TFolder) {
					void this.pruneBookmarks(file.path);
				}
			})
		);

		this.registerEvent(
			this.app.vault.on('rename', (file, oldPath) => {
				if (file instanceof TFolder) {
					void this.remapBookmarks(oldPath, file.path);
				}
			})
		);

		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, file) => {
				if (file instanceof TFolder) {
					menu.addItem((item) => {
						item.setTitle('Open in dired')
							.setIcon('folder-tree')
							.onClick(() => {
								void this.openDired(file.path);
							});
					});
				}
			})
		);
	}

	private async loadSettings(): Promise<void> {
		const loaded = (await this.loadData()) as Partial<DiredSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded);
		this.settings.bookmarks = Array.isArray(loaded?.bookmarks)
			? loaded.bookmarks.filter((path): path is string => typeof path === 'string')
			: [];
		if (this.settings.previewPlacement !== 'bottom') {
			this.settings.previewPlacement = 'right';
		}
	}

	getBookmarks(): ReadonlySet<string> {
		return new Set(this.settings.bookmarks);
	}

	async toggleBookmark(folderPath: string): Promise<boolean> {
		const index = this.settings.bookmarks.indexOf(folderPath);
		const added = index < 0;
		if (added) {
			this.settings.bookmarks.push(folderPath);
		} else {
			this.settings.bookmarks.splice(index, 1);
		}
		await this.saveData(this.settings);
		return added;
	}

	private async pruneBookmarks(folderPath: string): Promise<void> {
		const next = this.settings.bookmarks.filter(
			(path) => path !== folderPath && !path.startsWith(`${folderPath}/`)
		);
		if (next.length !== this.settings.bookmarks.length) {
			this.settings.bookmarks = next;
			await this.saveData(this.settings);
		}
	}

	private async remapBookmarks(oldPath: string, newPath: string): Promise<void> {
		let changed = false;
		this.settings.bookmarks = this.settings.bookmarks.map((path) => {
			if (path === oldPath || path.startsWith(`${oldPath}/`)) {
				changed = true;
				return newPath + path.slice(oldPath.length);
			}
			return path;
		});
		if (changed) {
			await this.saveData(this.settings);
		}
	}

	private async openDiredAtActiveFile(): Promise<void> {
		// An existing view is revealed as the user left it; the active file only
		// decides the folder (and cursor) when the view is opened fresh.
		const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_DIRED)[0];
		if (leaf) {
			await this.app.workspace.revealLeaf(leaf);
			await leaf.loadIfDeferred();
			if (leaf.view instanceof DiredView) {
				leaf.view.focusEditor();
			}
			return;
		}
		const file = this.app.workspace.getActiveFile();
		await this.openDired(file?.parent?.path ?? '/', file?.path);
	}

	private opening: Promise<void> | null = null;

	private async openDired(folderPath: string, cursorPath?: string): Promise<void> {
		// Serialize concurrent invocations (e.g. ribbon double-click) so only one
		// dired leaf is ever created.
		if (this.opening) {
			return this.opening;
		}
		this.opening = this.doOpenDired(folderPath, cursorPath);
		try {
			await this.opening;
		} finally {
			this.opening = null;
		}
	}

	private async doOpenDired(folderPath: string, cursorPath?: string): Promise<void> {
		let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_DIRED)[0] ?? null;
		if (!leaf) {
			leaf = this.app.workspace.getLeaf('tab');
			await leaf.setViewState({ type: VIEW_TYPE_DIRED, active: true });
		}
		await this.app.workspace.revealLeaf(leaf);
		await leaf.loadIfDeferred();
		if (leaf.view instanceof DiredView) {
			leaf.view.openFolderByPath(folderPath, cursorPath);
			leaf.view.focusEditor();
		}
	}
}

class DiredSettingTab extends PluginSettingTab {
	plugin: DiredPlugin;

	constructor(app: App, plugin: DiredPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				name: 'Preview placement',
				desc: 'Where the preview pane opens while preview mode is on.',
				control: {
					type: 'dropdown',
					key: 'previewPlacement',
					defaultValue: DEFAULT_SETTINGS.previewPlacement,
					options: { right: 'Split right', bottom: 'Split down' },
				},
			},
		];
	}
}
