import * as vscode from 'vscode';
import * as fs from 'fs';
import { ParserFactory } from './parsers/ParserFactory';

/**
 * 代码元素类型
 */
export enum CodeElementType {
    Class = 'class',
    Interface = 'interface',
    Method = 'method',
    Property = 'property',
    Variable = 'variable',
    Function = 'function',
    Namespace = 'namespace',
    Enum = 'enum',
    Constructor = 'constructor',
    Field = 'field',
    Module = 'module'
}

/**
 * 访问修饰符
 */
export enum AccessModifier {
    Public = 'public',
    Private = 'private',
    Protected = 'protected',
    Internal = 'internal',
    Default = '' // 默认访问修饰符
}

/**
 * 代码结构元素
 */
export interface CodeElement {
    name: string;
    type: CodeElementType;
    accessModifier: AccessModifier;
    line: number;
    children?: CodeElement[];
    comment?: string; // summary 描述
    returnType?: string;
    parameters?: string;
    returns?: string; // <returns> 标签内容
    params?: Array<{ name: string; description: string }>; // <param> 标签内容
}

/**
 * 文件结构解析器
 */
export class FileStructureParser {
    /**
     * 解析文件结构
     */
    static async parseFile(uri: vscode.Uri): Promise<CodeElement[]> {
        const filePath = uri.fsPath;
        const ext = filePath.substring(filePath.lastIndexOf('.'));
        
        try {
            console.log('FileStructureParser: 开始解析文件', filePath);
            
            // 先打开文档，确保文件被加载
            const document = await vscode.workspace.openTextDocument(uri);
            console.log('FileStructureParser: 文档已打开，语言ID:', document.languageId);
            
            // 等待一下，让语言服务器有时间分析文件
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // 优先使用 VSCode 的符号提供者获取基本结构
            console.log('FileStructureParser: 请求符号提供者');
            const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                'vscode.executeDocumentSymbolProvider',
                uri
            );

            console.log('FileStructureParser: 符号提供者返回', symbols ? symbols.length : 0, '个符号');

            // 读取文件内容
            const content = document.getText();
            const lines = content.split('\n');

            // 对于 C# 和 Vue 文件，直接使用自定义解析器
            // C#: 避免符号提供者返回方法内部的局部变量
            // Vue: 避免符号提供者返回 Module 类型的符号（文件名）
            if (ext === '.cs' || ext === '.vue') {
                console.log(`FileStructureParser: ${ext} 文件，使用自定义解析器`);
                return this.parseWithCustomParser(document, lines, filePath);
            }
            
            if (symbols && symbols.length > 0) {
                // 如果符号提供者返回了结果，使用它并提取详细信息
                // 但需要过滤掉方法内部的局部变量和 Module 类型的符号（通常是文件名）
                const filteredSymbols = symbols.filter(symbol => {
                    // 过滤掉 Module 类型的符号（通常是文件名，不是代码结构）
                    if (symbol.kind === vscode.SymbolKind.Module) {
                        console.log(`FileStructureParser: 过滤掉 Module 符号: ${symbol.name}`);
                        return false;
                    }
                    return true;
                });
                
                if (filteredSymbols.length > 0) {
                    const elements = this.symbolsToCodeElements(filteredSymbols, lines, ext);
                    console.log('FileStructureParser: 转换完成，返回', elements.length, '个元素');
                    return elements;
                } else {
                    // 如果过滤后没有符号，使用自定义解析器
                    console.log('FileStructureParser: 过滤后没有符号，使用自定义解析器');
                    return this.parseWithCustomParser(document, lines, filePath);
                }
            } else {
                // 如果符号提供者没有返回结果，使用自定义解析器
                console.log('FileStructureParser: 未找到符号，使用自定义解析器');
                return this.parseWithCustomParser(document, lines, filePath);
            }
        } catch (error) {
            console.error('FileStructureParser: 解析文件失败:', error);
            return [];
        }
    }

    /**
     * 使用自定义解析器解析文件
     */
    private static async parseWithCustomParser(
        document: vscode.TextDocument,
        lines: string[],
        filePath: string
    ): Promise<CodeElement[]> {
        // 使用工厂创建对应的解析器
        const parser = ParserFactory.createParser(filePath);
        
        if (parser) {
            console.log('FileStructureParser: 使用自定义解析器', parser.constructor.name);
            try {
                const elements = await parser.parse(document, lines);
                console.log('FileStructureParser: 自定义解析器返回', elements.length, '个元素');
                return elements;
            } catch (error) {
                console.error('FileStructureParser: 自定义解析器失败:', error);
                return [];
            }
        } else {
            console.log('FileStructureParser: 不支持的文件类型');
            return [];
        }
    }


    /**
     * 将符号转换为代码元素
     */
    private static symbolsToCodeElements(
        symbols: vscode.DocumentSymbol[],
        lines: string[],
        fileExt: string
    ): CodeElement[] {
        return symbols.map(symbol => {
            const element = this.symbolToCodeElement(symbol, lines, fileExt);
            
            // 递归处理子符号，但过滤掉方法内部的局部变量
            if (symbol.children && symbol.children.length > 0) {
                // 如果是方法，不包含子符号（方法内部的局部变量）
                if (element.type === CodeElementType.Method || element.type === CodeElementType.Function || element.type === CodeElementType.Constructor) {
                    element.children = [];
                } else {
                    // 对于类等其他类型，递归处理子符号
                    element.children = this.symbolsToCodeElements(symbol.children, lines, fileExt);
                }
            }
            
            return element;
        });
    }

    /**
     * 将单个符号转换为代码元素
     */
    private static symbolToCodeElement(
        symbol: vscode.DocumentSymbol,
        lines: string[],
        fileExt: string
    ): CodeElement {
        const lineIndex = symbol.range.start.line;
        const lineText = lines[lineIndex] || '';
        
        // 提取访问修饰符和注释
        const { accessModifier, comment, returnType, parameters } = this.extractDetails(
            lineText,
            lines,
            lineIndex,
            symbol.kind,
            fileExt
        );

        return {
            name: symbol.name,
            type: this.symbolKindToElementType(symbol.kind),
            accessModifier: accessModifier,
            line: lineIndex + 1,
            comment: comment,
            returnType: returnType,
            parameters: parameters,
            children: []
        };
    }

    /**
     * 提取详细信息（访问修饰符、注释等）
     */
    private static extractDetails(
        lineText: string,
        lines: string[],
        lineIndex: number,
        kind: vscode.SymbolKind,
        fileExt: string
    ): {
        accessModifier: AccessModifier;
        comment?: string;
        returnType?: string;
        parameters?: string;
    } {
        let accessModifier = AccessModifier.Default;
        let comment: string | undefined;
        let returnType: string | undefined;
        let parameters: string | undefined;

        // 提取访问修饰符
        const accessModifiers = [
            AccessModifier.Public,
            AccessModifier.Private,
            AccessModifier.Protected,
            AccessModifier.Internal
        ];

        for (const mod of accessModifiers) {
            if (lineText.includes(mod)) {
                accessModifier = mod;
                break;
            }
        }

        // 提取注释（查找上一行的注释）
        comment = this.extractComment(lines, lineIndex);

        // 提取返回类型和参数（仅对方法/函数）
        if (kind === vscode.SymbolKind.Method || kind === vscode.SymbolKind.Function) {
            const methodInfo = this.extractMethodInfo(lineText, fileExt);
            returnType = methodInfo.returnType;
            parameters = methodInfo.parameters;
        }

        return { accessModifier, comment, returnType, parameters };
    }

    /**
     * 提取注释
     */
    private static extractComment(lines: string[], lineIndex: number): string | undefined {
        // 向上查找注释（最多查找5行）
        for (let i = lineIndex - 1; i >= Math.max(0, lineIndex - 5); i--) {
            const line = lines[i].trim();
            
            // C#/Java 单行注释
            if (line.startsWith('//')) {
                return line.substring(2).trim();
            }
            
            // C#/Java 多行注释开始
            if (line.includes('/*')) {
                let comment = '';
                for (let j = i; j <= lineIndex && j < lines.length; j++) {
                    const commentLine = lines[j].trim();
                    if (commentLine.includes('*/')) {
                        comment += commentLine.substring(0, commentLine.indexOf('*/'));
                        break;
                    }
                    if (j === i) {
                        comment += commentLine.substring(commentLine.indexOf('/*') + 2);
                    } else {
                        comment += ' ' + commentLine;
                    }
                }
                return comment.trim() || undefined;
            }
            
            // XML 文档注释（C#）
            if (line.startsWith('///')) {
                return line.substring(3).trim();
            }
            
            // 如果遇到非空行且不是注释，停止查找
            if (line && !line.startsWith('//') && !line.startsWith('*') && !line.startsWith('///')) {
                break;
            }
        }
        
        return undefined;
    }

    /**
     * 提取方法信息（返回类型和参数）
     */
    private static extractMethodInfo(lineText: string, fileExt: string): {
        returnType?: string;
        parameters?: string;
    } {
        let returnType: string | undefined;
        let parameters: string | undefined;

        // 根据文件扩展名使用不同的解析逻辑
        if (fileExt === '.cs' || fileExt === '.java') {
            // C#/Java: public void MethodName(int param1, string param2)
            const methodMatch = lineText.match(/(?:public|private|protected|internal)?\s*(\w+)\s+(\w+)\s*\(([^)]*)\)/);
            if (methodMatch) {
                returnType = methodMatch[1];
                parameters = methodMatch[3] || '';
            }
        } else if (fileExt === '.js' || fileExt === '.ts') {
            // JavaScript/TypeScript: function methodName(param1: type, param2: type): returnType
            const funcMatch = lineText.match(/(?:function|const|let|var)?\s*(\w+)\s*\(([^)]*)\)(?::\s*(\w+))?/);
            if (funcMatch) {
                parameters = funcMatch[2] || '';
                returnType = funcMatch[3];
            }
        }

        return { returnType, parameters };
    }

    /**
     * 符号类型转换为元素类型
     */
    private static symbolKindToElementType(kind: vscode.SymbolKind): CodeElementType {
        switch (kind) {
            case vscode.SymbolKind.Class:
                return CodeElementType.Class;
            case vscode.SymbolKind.Interface:
                return CodeElementType.Interface;
            case vscode.SymbolKind.Method:
                return CodeElementType.Method;
            case vscode.SymbolKind.Function:
                return CodeElementType.Function;
            case vscode.SymbolKind.Property:
                return CodeElementType.Property;
            case vscode.SymbolKind.Variable:
                return CodeElementType.Variable;
            case vscode.SymbolKind.Field:
                return CodeElementType.Field;
            case vscode.SymbolKind.Namespace:
                return CodeElementType.Namespace;
            case vscode.SymbolKind.Enum:
                return CodeElementType.Enum;
            case vscode.SymbolKind.Constructor:
                return CodeElementType.Constructor;
            case vscode.SymbolKind.Module:
                return CodeElementType.Module;
            default:
                return CodeElementType.Class;
        }
    }
}

