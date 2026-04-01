import { Plugin, TFile, MarkdownView, Notice, TFolder } from "obsidian";

interface ClipboardData {
	sourceFilePath: string | null;
	content: string;
}

export default class LinkUpdaterPlugin extends Plugin {
	private clipboardData: ClipboardData | null = null;
	private isCutOperation = false;

	async onload() {
		console.log("Link Updater Plugin loaded");

		this.registerDomEvent(document, "cut", this.handleDocumentCut.bind(this), true);
		this.registerDomEvent(document, "copy", this.handleDocumentCopy.bind(this), true);
		this.registerDomEvent(document, "paste", this.handleDocumentPaste.bind(this), true);

		this.addCommand({
			id: "toggle-link-updater",
			name: "Toggle Link Updater",
			callback: () => {
				new Notice("Link Updater is active");
			},
		});
	}

	private handleDocumentCut(evt: ClipboardEvent) {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (activeView && activeView.editor) {
			this.isCutOperation = true;
			this.captureSourceContext(activeView.editor);
		}
	}

	private handleDocumentCopy(evt: ClipboardEvent) {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (activeView && activeView.editor) {
			this.isCutOperation = false;
			this.captureSourceContext(activeView.editor);
		}
	}

	private captureSourceContext(editor: any) {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (activeView && activeView.file) {
			const selection = editor.getSelection();
			this.clipboardData = {
				sourceFilePath: activeView.file.path,
				content: selection,
			};
		}
	}

	private handleDocumentPaste(evt: ClipboardEvent) {
		const targetView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!targetView || !targetView.file || !targetView.editor) {
			return;
		}

		const targetFilePath = targetView.file.path;
		const clipboardText = evt.clipboardData?.getData("text/plain");

		if (!clipboardText) {
			return;
		}

		let sourceFilePath = this.clipboardData?.sourceFilePath;

		if (!sourceFilePath && this.clipboardData?.content === clipboardText) {
			sourceFilePath = this.clipboardData.sourceFilePath;
		}

		if (!sourceFilePath) {
			sourceFilePath = this.guessSourceFromContent(clipboardText);
		}

		if (sourceFilePath && sourceFilePath !== targetFilePath) {
			evt.preventDefault();
			const updatedContent = this.updateLinksInContent(
				clipboardText,
				sourceFilePath,
				targetFilePath
			);
			targetView.editor.replaceSelection(updatedContent);
			this.showUpdateNotification();
		}

		this.clipboardData = null;
		this.isCutOperation = false;
	}

	private guessSourceFromContent(content: string): string | null {
		const wikiLinkRegex = /\[\[([^\]#|]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g;
		const mdLinkRegex = /\[([^\]]*)\]\(([^)#]+)(?:#[^)]*)?\)/g;
		let match;
		const potentialFiles = new Set<string>();

		while ((match = wikiLinkRegex.exec(content)) !== null) {
			const linkPath = match[1].trim();
			this.addPotentialSourceFile(linkPath, potentialFiles);
		}

		while ((match = mdLinkRegex.exec(content)) !== null) {
			const linkPath = match[2].trim();
			this.addPotentialSourceFile(linkPath, potentialFiles);
		}

		return potentialFiles.size === 1 ? Array.from(potentialFiles)[0] : null;
	}

	private addPotentialSourceFile(linkPath: string, potentialFiles: Set<string>) {
		const cleanPath = linkPath.replace(/\.md$/, "");
		const linkedFile = this.app.metadataCache.getFirstLinkpathDest(cleanPath, "");
		if (linkedFile) {
			const allLinks = this.app.metadataCache.resolvedLinks;
			for (const [sourceFile, links] of Object.entries(allLinks)) {
				if (links[linkedFile.path]) {
					potentialFiles.add(sourceFile);
				}
			}
		}
	}

	private updateLinksInContent(
		content: string,
		sourceFilePath: string,
		targetFilePath: string
	): string {
		let updatedContent = content;

		updatedContent = updatedContent.replace(
			/(\[\[)([^\]#|]+)(#[^\]|]*)?(\|[^\]]*)?(\]\])/g,
			(match, prefix, linkPath, heading, alias, suffix) => {
				const cleanLinkPath = linkPath.trim();
				const targetFile = this.resolveTargetFile(cleanLinkPath, sourceFilePath);

				if (targetFile) {
					const correctLinkForTarget = this.generateCorrectLink(
						targetFile,
						targetFilePath,
						heading
					);
					const aliasPart = alias || "";
					return `${prefix}${correctLinkForTarget}${aliasPart}${suffix}`;
				}

				return match;
			}
		);

		updatedContent = updatedContent.replace(
			/(\[[^\]]*\]\()([^)#]+)(#[^)]*)?(\))/g,
			(match, prefix, linkPath, heading, suffix) => {
				const cleanLinkPath = linkPath.trim().replace(/\.md$/, "");
				const targetFile = this.resolveTargetFile(cleanLinkPath, sourceFilePath);

				if (targetFile) {
					const correctLinkForTarget = this.generateCorrectMarkdownLink(
						targetFile,
						targetFilePath,
						heading
					);
					return `${prefix}${correctLinkForTarget}${suffix}`;
				}

				return match;
			}
		);

		return updatedContent;
	}

	private resolveTargetFile(linkPath: string, sourceFilePath: string): TFile | null {
		const sourceFile = this.app.vault.getFileByPath(sourceFilePath);
		if (!sourceFile) {
			return this.app.metadataCache.getFirstLinkpathDest(linkPath, "");
		}

		return this.app.metadataCache.getFirstLinkpathDest(linkPath, sourceFilePath);
	}

	private generateCorrectLink(
		targetFile: TFile,
		currentFilePath: string,
		heading?: string
	): string {
		const currentFile = this.app.vault.getFileByPath(currentFilePath);
		if (!currentFile || !currentFile.parent) {
			return heading
				? `${targetFile.basename}${heading}`
				: targetFile.basename;
		}

		const relativePath = this.getRelativePath(currentFile.parent, targetFile);
		const linkWithoutExt = relativePath.replace(/\.md$/, "");

		return heading ? `${linkWithoutExt}${heading}` : linkWithoutExt;
	}

	private generateCorrectMarkdownLink(
		targetFile: TFile,
		currentFilePath: string,
		heading?: string
	): string {
		const currentFile = this.app.vault.getFileByPath(currentFilePath);
		if (!currentFile || !currentFile.parent) {
			return heading
				? `${targetFile.name}${heading}`
				: targetFile.name;
		}

		const relativePath = this.getRelativePath(currentFile.parent, targetFile);

		return heading ? `${relativePath}${heading}` : relativePath;
	}

	private getRelativePath(from: TFolder, to: TFile): string {
		const fromParts = from.path.split("/").filter((p) => p);
		const toParts = to.path.split("/").filter((p) => p);

		let commonLength = 0;
		while (
			commonLength < fromParts.length &&
			commonLength < toParts.length &&
			fromParts[commonLength] === toParts[commonLength]
		) {
			commonLength++;
		}

		const relativeParts: string[] = [];
		for (let i = commonLength; i < fromParts.length; i++) {
			relativeParts.push("..");
		}
		for (let i = commonLength; i < toParts.length; i++) {
			relativeParts.push(toParts[i]);
		}

		return relativeParts.join("/");
	}

	private showUpdateNotification() {
		new Notice("Internal links have been automatically updated");
	}

	onunload() {
		console.log("Link Updater Plugin unloaded");
	}
}
