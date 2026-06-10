import type { KeyBinding } from '@codemirror/view';
import type { DiredView } from './view';

export function diredKeymap(view: DiredView): KeyBinding[] {
	return [
		{ key: 'm', run: () => view.toggleMarkAtCursor() },
		{ key: 't', run: () => view.toggleAllMarks() },
		{ key: 'U', run: () => view.unmarkAll() },
		{ key: '* .', run: () => view.markByExtension() },
		{ key: 'Enter', run: () => view.openAtCursor() },
		{ key: 'o', run: () => view.openAtCursor() },
		{ key: 'R', run: () => view.enterRenameMode() },
		{ key: 'M', run: () => view.moveTargets() },
		{ key: 'D', run: () => view.deleteTargets() },
		{ key: 'c d', run: () => view.createDirectory() },
		{ key: 'c f', run: () => view.createFile() },
		{ key: 'u', run: () => view.goUp() },
		{ key: 'g', run: () => view.gotoFolder() },
		{ key: 'B', run: () => view.gotoAnywhere() },
		{ key: 'a b', run: () => view.toggleBookmark() },
		{ key: 'p', run: () => view.moveCursor(-1) },
		{ key: 'n', run: () => view.moveCursor(1) },
		{ key: 'j', run: () => view.jumpToEntry() },
		{ key: 'r', run: () => view.refresh() },
		{ key: 'P', run: () => view.togglePreviewMode() },
		{ key: '?', run: () => view.toggleHints() },
	];
}

export function renameKeymap(view: DiredView): KeyBinding[] {
	return [
		{ key: 'Enter', run: () => view.commitRename() },
		{ key: 'Escape', run: () => view.cancelRename() },
	];
}
