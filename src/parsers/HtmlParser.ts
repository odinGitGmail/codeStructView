import * as vscode from 'vscode';
import { CodeElement, CodeElementType, AccessModifier } from '../fileStructureParser';
import { BaseParser } from './BaseParser';

/**
 * HTML 文件解析器
 */
export class HtmlParser extends BaseParser {
    async parse(document: vscode.TextDocument, lines: string[]): Promise<CodeElement[]> {
        const elements: CodeElement[] = [];
        let lineNum = 0;

        for (const line of lines) {
            lineNum++;
            const trimmedLine = line.trim();
            
            // 跳过空行和注释
            if (!trimmedLine || trimmedLine.startsWith('<!--') || trimmedLine.startsWith('//')) {
                continue;
            }
            
            // 解析 script 标签
            const scriptElement = this.parseScriptTag(trimmedLine, lineNum, lines);
            if (scriptElement) {
                elements.push(scriptElement);
                continue;
            }
            
            // 解析主要元素（div, section, article 等）
            const mainElement = this.parseMainElement(trimmedLine, lineNum, lines);
            if (mainElement) {
                elements.push(mainElement);
                continue;
            }
        }

        return elements;
    }

    /**
     * 解析 script 标签
     */
    private parseScriptTag(line: string, lineNum: number, lines: string[]): CodeElement | null {
        const scriptMatch = line.match(/<script[^>]*>/);
        if (scriptMatch) {
            // 提取 id 或 src 属性
            const idMatch = line.match(/id\s*=\s*["'](\w+)["']/);
            const srcMatch = line.match(/src\s*=\s*["']([^"']+)["']/);
            const name = idMatch ? idMatch[1] : (srcMatch ? srcMatch[1] : 'script');
            
            return this.createElement(
                name,
                CodeElementType.Module,
                lineNum,
                line,
                lines
            );
        }
        return null;
    }

    /**
     * 解析主要 HTML 元素
     */
    private parseMainElement(line: string, lineNum: number, lines: string[]): CodeElement | null {
        // 匹配主要元素：div, section, article, main, header, footer 等
        const elementMatch = line.match(/<(div|section|article|main|header|footer|nav|aside)[^>]*(?:id\s*=\s*["'](\w+)["']|class\s*=\s*["']([\w\s-]+)["'])?/);
        if (elementMatch) {
            const tagName = elementMatch[1];
            const id = elementMatch[2];
            const className = elementMatch[3];
            const name = id || className || tagName;
            
            return this.createElement(
                name,
                CodeElementType.Module,
                lineNum,
                line,
                lines
            );
        }
        return null;
    }
}

