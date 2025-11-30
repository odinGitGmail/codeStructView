import * as vscode from 'vscode';
import { CodeElement, CodeElementType } from '../fileStructureParser';
import { BaseParser } from './BaseParser';

/**
 * Java 文件解析器
 */
export class JavaParser extends BaseParser {
    async parse(document: vscode.TextDocument, lines: string[]): Promise<CodeElement[]> {
        const elements: CodeElement[] = [];
        let lineNum = 0;

        for (const line of lines) {
            lineNum++;
            const trimmedLine = line.trim();
            
            // 跳过空行和注释
            if (!trimmedLine || trimmedLine.startsWith('//') || trimmedLine.startsWith('*') || trimmedLine.startsWith('/**')) {
                continue;
            }
            
            // 解析类定义
            const classElement = this.parseClass(trimmedLine, lineNum, lines);
            if (classElement) {
                elements.push(classElement);
                continue;
            }
            
            // 解析接口定义
            const interfaceElement = this.parseInterface(trimmedLine, lineNum, lines);
            if (interfaceElement) {
                elements.push(interfaceElement);
                continue;
            }
            
            // 解析包定义
            const packageElement = this.parsePackage(trimmedLine, lineNum, lines);
            if (packageElement) {
                elements.push(packageElement);
                continue;
            }
            
            // 解析枚举
            const enumElement = this.parseEnum(trimmedLine, lineNum, lines);
            if (enumElement) {
                elements.push(enumElement);
                continue;
            }
        }

        return elements;
    }

    /**
     * 解析类定义
     */
    private parseClass(line: string, lineNum: number, lines: string[]): CodeElement | null {
        const classMatch = line.match(/(?:public|private|protected)?\s*(?:abstract|final)?\s*class\s+(\w+)/);
        if (classMatch) {
            return this.createElement(
                classMatch[1],
                CodeElementType.Class,
                lineNum,
                line,
                lines
            );
        }
        return null;
    }

    /**
     * 解析接口定义
     */
    private parseInterface(line: string, lineNum: number, lines: string[]): CodeElement | null {
        const interfaceMatch = line.match(/(?:public|private|protected)?\s*interface\s+(\w+)/);
        if (interfaceMatch) {
            return this.createElement(
                interfaceMatch[1],
                CodeElementType.Interface,
                lineNum,
                line,
                lines
            );
        }
        return null;
    }

    /**
     * 解析包定义
     */
    private parsePackage(line: string, lineNum: number, lines: string[]): CodeElement | null {
        const packageMatch = line.match(/package\s+([\w.]+)/);
        if (packageMatch) {
            return this.createElement(
                packageMatch[1],
                CodeElementType.Namespace,
                lineNum,
                line,
                lines
            );
        }
        return null;
    }

    /**
     * 解析枚举
     */
    private parseEnum(line: string, lineNum: number, lines: string[]): CodeElement | null {
        const enumMatch = line.match(/(?:public|private|protected)?\s*enum\s+(\w+)/);
        if (enumMatch) {
            return this.createElement(
                enumMatch[1],
                CodeElementType.Enum,
                lineNum,
                line,
                lines
            );
        }
        return null;
    }
}

