import * as vscode from 'vscode';
import { IParser } from './IParser';
import { CSharpParser } from './CSharpParser';
import { JavaParser } from './JavaParser';
import { JavaScriptParser } from './JavaScriptParser';
import { VueParser } from './VueParser';
import { HtmlParser } from './HtmlParser';

/**
 * 解析器工厂类
 * 根据文件扩展名创建对应的解析器
 */
export class ParserFactory {
    private static parsers: Map<string, new () => IParser> = new Map<string, new () => IParser>([
        ['.cs', CSharpParser],
        ['.java', JavaParser],
        ['.js', JavaScriptParser],
        ['.ts', JavaScriptParser], // TypeScript 使用 JavaScript 解析器
        ['.vue', VueParser],
        ['.html', HtmlParser],
        ['.htm', HtmlParser]
    ]);

    /**
     * 创建解析器
     * @param filePath 文件路径
     * @returns 解析器实例，如果不支持则返回 null
     */
    static createParser(filePath: string): IParser | null {
        const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase();
        const ParserClass = this.parsers.get(ext);
        
        if (ParserClass) {
            return new ParserClass();
        }
        
        return null;
    }

    /**
     * 注册新的解析器
     * @param extension 文件扩展名（如 '.py', '.go'）
     * @param ParserClass 解析器类
     */
    static registerParser(extension: string, ParserClass: new () => IParser): void {
        this.parsers.set(extension.toLowerCase(), ParserClass);
    }

    /**
     * 检查是否支持该文件类型
     * @param filePath 文件路径
     * @returns 是否支持
     */
    static isSupported(filePath: string): boolean {
        const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase();
        return this.parsers.has(ext);
    }

    /**
     * 获取所有支持的文件扩展名
     * @returns 扩展名数组
     */
    static getSupportedExtensions(): string[] {
        return Array.from(this.parsers.keys());
    }
}

