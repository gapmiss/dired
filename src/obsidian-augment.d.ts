import 'obsidian';

declare module 'obsidian' {
	interface App {
		viewRegistry: {
			getTypeByExtension(extension: string): string | undefined;
		};
	}
}
