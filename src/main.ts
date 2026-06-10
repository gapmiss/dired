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
				void this.openDired(this.activeFolderPath());
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
			void this.openDired(this.activeFolderPath());
		});

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

	private activeFolderPath(): string {
		return this.app.workspace.getActiveFile()?.parent?.path ?? '/';
	}

	private async openDired(folderPath: string): Promise<void> {
		let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_DIRED)[0] ?? null;
		if (!leaf) {
			leaf = this.app.workspace.getLeaf('tab');
			await leaf.setViewState({ type: VIEW_TYPE_DIRED, active: true });
		}
		await this.app.workspace.revealLeaf(leaf);
		if (leaf.view instanceof DiredView) {
			leaf.view.openFolderByPath(folderPath);
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
