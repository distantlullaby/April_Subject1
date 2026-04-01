import { Plugin, TFile, Notice } from 'obsidian';

interface LinkInfo {
  original: string;
  target: string;
  anchor?: string;
  displayText?: string;
  type: 'wiki' | 'markdown';
}

export default class LinkFixerPlugin extends Plugin {
  async onload() {
    console.log('Link Fixer plugin loaded');

    this.registerEvent(
      this.app.workspace.on('editor-paste', (evt, editor, view) => {
        this.handlePaste(evt, editor, view);
      })
    );

    this.addCommand({
      id: 'fix-links-in-selection',
      name: '修复选区内的链接路径',
      editorCallback: (editor, view) => {
        this.fixLinksInEditor(editor, view);
      }
    });
  }

  onunload() {
    console.log('Link Fixer plugin unloaded');
  }

  private handlePaste(evt: ClipboardEvent, editor: any, view: any) {
    if (!evt.clipboardData) return;

    const plainText = evt.clipboardData.getData('text/plain');

    if (!plainText.includes('[[') && !plainText.includes('](')) return;

    evt.preventDefault();

    const currentFile = view.file;
    if (!currentFile) {
      editor.replaceSelection(plainText);
      return;
    }

    const fixedContent = this.fixLinksInContent(plainText, currentFile);
    editor.replaceSelection(fixedContent);

    new Notice('链接路径已自动修复');
  }

  private fixLinksInEditor(editor: any, view: any) {
    const currentFile = view.file;
    if (!currentFile) {
      new Notice('请先打开一个文件');
      return;
    }

    const selection = editor.getSelection();
    if (!selection) {
      new Notice('请先选择内容');
      return;
    }

    if (!selection.includes('[[') && !selection.includes('](')) {
      new Notice('选区内未发现链接');
      return;
    }

    const fixedContent = this.fixLinksInContent(selection, currentFile);
    editor.replaceSelection(fixedContent);
    new Notice('链接路径已修复');
  }

  private fixLinksInContent(content: string, targetFile: TFile): string {
    const links = this.extractLinks(content);
    
    let result = content;
    
    for (const link of links) {
      const fixedLink = this.resolveLink(link, targetFile);
      result = result.replace(link.original, fixedLink);
    }

    return result;
  }

  private extractLinks(content: string): LinkInfo[] {
    const links: LinkInfo[] = [];
    
    const wikiRegex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
    let match;

    while ((match = wikiRegex.exec(content)) !== null) {
      const fullMatch = match[0];
      const targetPart = match[1];
      const displayText = match[2];

      const [target, anchor] = targetPart.split('#', 2);

      links.push({
        original: fullMatch,
        target: target.trim(),
        anchor: anchor,
        displayText: displayText,
        type: 'wiki'
      });
    }

    const markdownRegex = /\[([^\]]*)\]\(([^)#]+)(?:#([^)]+))?\)/g;
    while ((match = markdownRegex.exec(content)) !== null) {
      const fullMatch = match[0];
      const displayText = match[1];
      const target = match[2].trim();
      const anchor = match[3];

      links.push({
        original: fullMatch,
        target: target,
        anchor: anchor,
        displayText: displayText,
        type: 'markdown'
      });
    }

    return links;
  }

  private resolveLink(link: LinkInfo, targetFile: TFile): string {
    const vault = this.app.vault;
    const allFiles = vault.getFiles();
    
    let targetFileObj = allFiles.find(f => 
      f.basename === link.target.replace(/\.md$/, '') || 
      f.name === link.target ||
      f.path === link.target
    );

    if (!targetFileObj) {
      return link.original;
    }

    const relativePath = this.getRelativePath(targetFile.path, targetFileObj.path);

    let linkTarget = relativePath;
    if (link.anchor) {
      linkTarget += '#' + link.anchor;
    }

    if (link.type === 'markdown') {
      const displayText = link.displayText || '';
      return `[${displayText}](${linkTarget})`;
    }

    if (link.displayText) {
      return `[[${linkTarget}|${link.displayText}]]`;
    }

    return `[[${linkTarget}]]`;
  }

  private getRelativePath(fromPath: string, toPath: string): string {
    const fromParts = fromPath.split('/');
    const toParts = toPath.split('/');

    fromParts.pop();

    let commonLength = 0;
    while (
      commonLength < fromParts.length &&
      commonLength < toParts.length &&
      fromParts[commonLength] === toParts[commonLength]
    ) {
      commonLength++;
    }

    const upLevels = fromParts.length - commonLength;
    const result: string[] = [];

    for (let i = 0; i < upLevels; i++) {
      result.push('..');
    }

    for (let i = commonLength; i < toParts.length; i++) {
      result.push(toParts[i]);
    }

    const relativePath = result.join('/');
    
    if (!relativePath.startsWith('.') && !relativePath.startsWith('/')) {
      return './' + relativePath;
    }

    return relativePath;
  }
}
