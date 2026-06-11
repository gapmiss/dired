import { RangeSetBuilder, StateEffect, StateField } from '@codemirror/state';
import type { Text } from '@codemirror/state';
import { Decoration, EditorView } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import { TFolder, prepareFuzzySearch } from 'obsidian';
import type { SearchMatches } from 'obsidian';

export const ENTRY_START_LINE = 3;
export const EMPTY_TEXT = '(empty)';
export const NO_MATCHES_TEXT = '(no matches)';

export interface DiredEntry {
	path: string;
	name: string;
	isFolder: boolean;
	matches?: SearchMatches;
}

export interface DiredListing {
	folderPath: string;
	entries: DiredEntry[];
}

export function joinPath(parentPath: string, name: string): string {
	return parentPath === '/' ? name : `${parentPath}/${name}`;
}

export function entryLineText(entry: DiredEntry): string {
	return entry.isFolder ? `${entry.name}/` : entry.name;
}

export const HELP_LINES: string[] = [
	' m = toggle mark',
	' t = toggle all marks',
	' U = unmark all',
	' *. = mark by file extension',
	'',
	' Enter/o = open file / view directory',
	' R = rename mode (enter applies, esc cancels)',
	' M = move',
	' D = delete',
	' cd = create directory',
	' cf = create file',
	'',
	' u = up to parent directory',
	' g = goto directory',
	' p = move to previous file',
	' n = move to next file',
	' r = refresh view',
	' j = jump to file/dir name',
	' / = filter entries (esc clears)',
	'',
	' B = goto bookmark or any directory',
	' ab = toggle bookmark for current directory',
	'',
	' P = toggle preview mode on/off',
	' ? = toggle these hints',
];

export function buildListing(
	folder: TFolder,
	vaultName: string,
	showHints: boolean,
	filterQuery = ''
): { listing: DiredListing; text: string } {
	const children = [...folder.children].sort((a, b) =>
		a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
	);
	let entries: DiredEntry[] = children.map((child) => ({
		path: child.path,
		name: child.name,
		isFolder: child instanceof TFolder,
	}));
	const query = filterQuery.trim();
	if (query.length > 0) {
		const fuzzy = prepareFuzzySearch(query);
		const matched: DiredEntry[] = [];
		for (const entry of entries) {
			const result = fuzzy(entry.name);
			if (result) {
				entry.matches = result.matches;
				matched.push(entry);
			}
		}
		entries = matched;
	}
	const header = (folder.isRoot() ? vaultName : `${vaultName}/${folder.path}`) + '/';
	const lines = [header, ''];
	if (entries.length === 0) {
		lines.push(query.length > 0 ? NO_MATCHES_TEXT : EMPTY_TEXT);
	} else {
		for (const entry of entries) {
			lines.push(entryLineText(entry));
		}
	}
	if (showHints) {
		lines.push('', ...HELP_LINES);
	}
	return {
		listing: { folderPath: folder.path, entries },
		text: lines.join('\n'),
	};
}

export function entryIndexForLine(lineNo: number, listing: DiredListing): number | null {
	const index = lineNo - ENTRY_START_LINE;
	return index >= 0 && index < listing.entries.length ? index : null;
}

export function lineForEntryIndex(index: number): number {
	return ENTRY_START_LINE + index;
}

export function firstHintLine(listing: DiredListing): number {
	return ENTRY_START_LINE + Math.max(listing.entries.length, 1) + 1;
}

const filterMatchMark = Decoration.mark({ class: 'dired-filter-match' });

export function buildDecorations(doc: Text, listing: DiredListing, marks: ReadonlySet<string>): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>();
	const header = doc.line(1);
	builder.add(header.from, header.from, Decoration.line({ class: 'dired-header' }));
	if (listing.entries.length === 0) {
		if (doc.lines >= ENTRY_START_LINE) {
			const line = doc.line(ENTRY_START_LINE);
			builder.add(line.from, line.from, Decoration.line({ class: 'dired-empty' }));
		}
	} else {
		listing.entries.forEach((entry, index) => {
			const lineNo = lineForEntryIndex(index);
			if (lineNo > doc.lines) {
				return;
			}
			const line = doc.line(lineNo);
			const classes = ['dired-entry', entry.isFolder ? 'dired-folder' : 'dired-file'];
			if (marks.has(entry.path)) {
				classes.push('dired-marked');
			}
			builder.add(line.from, line.from, Decoration.line({ class: classes.join(' ') }));
			for (const [start, end] of entry.matches ?? []) {
				builder.add(line.from + start, line.from + end, filterMatchMark);
			}
		});
	}
	for (let lineNo = firstHintLine(listing); lineNo <= doc.lines; lineNo += 1) {
		const line = doc.line(lineNo);
		builder.add(line.from, line.from, Decoration.line({ class: 'dired-hint' }));
	}
	return builder.finish();
}

export const setDecorations = StateEffect.define<DecorationSet>();

export const decorationsField = StateField.define<DecorationSet>({
	create: () => Decoration.none,
	update(value, tr) {
		let decorations = value.map(tr.changes);
		for (const effect of tr.effects) {
			if (effect.is(setDecorations)) {
				decorations = effect.value;
			}
		}
		return decorations;
	},
	provide: (field) => EditorView.decorations.from(field),
});
