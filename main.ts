import { Plugin, Editor, MarkdownView, Notice, TFile } from 'obsidian';

const CLIPBOARD_SOURCE_KEY = 'obsidian-link-updater:source';

export default class LinkUpdaterPlugin extends Plugin {
	private clipboardSource: string | null = null;

	async onload() {
		console.log('Loading Link Updater plugin');

		this.registerDomEvent(document, 'copy', this.handleCopy.bind(this));
		this.registerDomEvent(document, 'cut', this.handleCut.bind(this));
		this.registerDomEvent(document, 'paste', this.handlePaste.bind(this));
	}

	onunload() {
		console.log('Unloading Link Updater plugin');
	}

	private handleCopy(e: ClipboardEvent) {
		this.saveClipboardSource(e);
	}

	private handleCut(e: ClipboardEvent) {
		this.saveClipboardSource(e);
	}

	private saveClipboardSource(e: ClipboardEvent) {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!activeView) return;

		const file = activeView.file;
		if (!file) return;

		this.clipboardSource = file.path;
	}

	private handlePaste(e: ClipboardEvent) {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!activeView) return;

		const targetFile = activeView.file;
		if (!targetFile) return;

		const sourcePath = this.clipboardSource;
		if (!sourcePath) return;

		if (sourcePath === targetFile.path) return;

		e.preventDefault();

		const clipboardData = e.clipboardData;
		if (!clipboardData) return;

		let content = clipboardData.getData('text/plain');
		if (!content) return;

		const updatedContent = this.updateLinks(content, sourcePath, targetFile);

		activeView.editor.replaceSelection(updatedContent);

		new Notice('Links updated to match new file location');

		this.clipboardSource = null;
	}

	private updateLinks(content: string, sourcePath: string, targetFile: TFile): string {
		const wikilinkRegex = /\[\[(.*?)(\|.*?)?\]\]/g;
		const mdlinkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;

		let updatedContent = content;

		updatedContent = updatedContent.replace(wikilinkRegex, (match, link, alias) => {
			const newLink = this.resolveLink(link, sourcePath, targetFile);
			return `[[${newLink}${alias || ''}]]`;
		});

		updatedContent = updatedContent.replace(mdlinkRegex, (match, text, url) => {
			if (url.startsWith('http://') || url.startsWith('https://')) {
				return match;
			}
			const newUrl = this.resolveLink(url, sourcePath, targetFile);
			return `[${text}](${newUrl})`;
		});

		return updatedContent;
	}

	private resolveLink(link: string, sourcePath: string, targetFile: TFile): string {
		link = link.trim();

		const sourceFile = this.app.vault.getAbstractFileByPath(sourcePath);
		if (!(sourceFile instanceof TFile)) return link;

		const sourceDir = sourceFile.parent;
		const targetDir = targetFile.parent;

		let linkedFile = this.app.metadataCache.getFirstLinkpathDest(link, sourcePath);

		if (!linkedFile) {
			linkedFile = this.findFileByFullPath(link);
		}

		if (!linkedFile) {
			return link;
		}

		const relativePath = this.getRelativePath(targetDir, linkedFile);

		return relativePath;
	}

	private findFileByFullPath(path: string): TFile | null {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) return file;

		const allFiles = this.app.vault.getMarkdownFiles();
		for (const f of allFiles) {
			if (f.path === path || f.name === path) {
				return f;
			}
		}

		return null;
	}

	private getRelativePath(fromDir: any, toFile: TFile): string {
		if (!fromDir) return toFile.path;

		const fromPath = fromDir.path;
		const toPath = toFile.path;

		if (fromPath === toFile.parent?.path) {
			return toFile.name;
		}

		const fromParts = fromPath.split('/').filter(Boolean);
		const toParts = toPath.split('/').filter(Boolean);

		let commonDepth = 0;
		while (
			commonDepth < fromParts.length &&
			commonDepth < toParts.length &&
			fromParts[commonDepth] === toParts[commonDepth]
		) {
			commonDepth++;
		}

		const upLevels = fromParts.length - commonDepth;
		const relativeParts = [];

		for (let i = 0; i < upLevels; i++) {
			relativeParts.push('..');
		}

		for (let i = commonDepth; i < toParts.length; i++) {
			relativeParts.push(toParts[i]);
		}

		return relativeParts.join('/');
	}
}
