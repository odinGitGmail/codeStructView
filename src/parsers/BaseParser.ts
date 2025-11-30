import * as vscode from 'vscode';
import { CodeElement, CodeElementType, AccessModifier } from '../fileStructureParser';
import { IParser } from './IParser';

/**
 * 基础解析器抽象类
 * 提供通用的解析方法
 */
export abstract class BaseParser implements IParser {
    /**
     * 解析文件内容
     */
    abstract parse(document: vscode.TextDocument, lines: string[]): Promise<CodeElement[]>;

    /**
     * 提取访问修饰符
     */
    protected extractAccessModifier(line: string): AccessModifier {
        if (line.includes('public')) return AccessModifier.Public;
        if (line.includes('private')) return AccessModifier.Private;
        if (line.includes('protected')) return AccessModifier.Protected;
        if (line.includes('internal')) return AccessModifier.Internal;
        return AccessModifier.Default;
    }

    /**
     * 清理注释内容，移除所有开头的空格、斜杠和星号
     * 只过滤开头的空格、斜杠和星号，中间和结尾的保留
     */
    private cleanComment(comment: string): string {
        if (!comment) {
            return '';
        }
        
        console.log(`[cleanComment] 原始注释: "${comment}"`);
        
        // 先 trim
        let cleaned = comment.trim();
        
        // 移除开头的空格
        while (cleaned.startsWith(' ')) {
            cleaned = cleaned.substring(1).trim();
        }
        
        // 移除开头的斜杠（包括多个连续的斜杠）
        while (cleaned.startsWith('/')) {
            cleaned = cleaned.substring(1).trim();
        }
        
        // 移除开头的星号（包括多个连续的星号）
        while (cleaned.startsWith('*')) {
            cleaned = cleaned.substring(1).trim();
        }
        
        // 再次移除可能残留的开头空格
        while (cleaned.startsWith(' ')) {
            cleaned = cleaned.substring(1).trim();
        }
        
        // 清理多余的空格和换行（但保留单个空格）
        cleaned = cleaned.replace(/\s+/g, ' ').trim();
        
        console.log(`[cleanComment] 最终结果: "${cleaned}"`);
        return cleaned;
    }

    /**
     * 提取 XML 注释信息（summary, param, returns）
     */
    protected extractXmlCommentInfo(lines: string[], lineIndex: number): {
        summary?: string;
        params?: Array<{ name: string; description: string }>;
        returns?: string;
    } {
        const result: {
            summary?: string;
            params?: Array<{ name: string; description: string }>;
            returns?: string;
        } = {};
        
        console.log(`[extractXmlCommentInfo] 开始提取注释，行号: ${lineIndex + 1}`);
        
        // 向上查找 XML 文档注释（最多查找20行）
        let xmlCommentLines: string[] = [];
        let foundXmlStart = false;
        
        // 确保 lineIndex 在有效范围内
        if (lineIndex < 0 || lineIndex >= lines.length) {
            console.log(`[extractXmlCommentInfo] 行索引 ${lineIndex} 超出范围，数组长度: ${lines.length}`);
            return { summary: undefined, params: [], returns: undefined };
        }
        
        for (let i = lineIndex - 1; i >= Math.max(0, lineIndex - 20); i--) {
            // 检查索引是否有效
            if (i < 0 || i >= lines.length) {
                break;
            }
            
            const originalLine = lines[i];
            // 检查行是否存在
            if (originalLine === undefined || originalLine === null) {
                break;
            }
            
            const line = originalLine.trim();
            
            // 查找 XML 文档注释开始
            if (line.startsWith('///')) {
                foundXmlStart = true;
                let content = originalLine.substring(originalLine.indexOf('///') + 3).trim();
                xmlCommentLines.unshift(content);
                console.log(`[extractXmlCommentInfo] 找到 XML 注释行 ${i + 1}: ${content.substring(0, 50)}...`);
            } else if (foundXmlStart) {
                // 如果已经开始收集 XML 注释，但当前行不是 XML 注释，停止收集
                // 但允许空行和属性行（以 [ 开头的行）
                if (line && !line.startsWith('//') && !line.startsWith('*') && !line.startsWith('[') && line.length > 0) {
                    console.log(`[extractXmlCommentInfo] 停止收集，遇到非注释行 ${i + 1}: ${line.substring(0, 50)}`);
                    break;
                }
            } else {
                // 如果还没找到 XML 注释，检查是否是其他类型的注释
                if (line && !line.startsWith('//') && !line.startsWith('*') && !line.startsWith('///') && !line.startsWith('[')) {
                    break;
                }
            }
        }
        
        if (xmlCommentLines.length > 0) {
            const xmlComment = xmlCommentLines.join('\n');
            console.log(`[extractXmlCommentInfo] 收集到 ${xmlCommentLines.length} 行 XML 注释`);
            console.log(`[extractXmlCommentInfo] XML 注释内容: ${xmlComment.substring(0, 200)}...`);
            
            // 提取 <summary> 标签内容
            const summaryMatch = xmlComment.match(/<summary>([\s\S]*?)<\/summary>/i);
            if (summaryMatch) {
                let summary = summaryMatch[1];
                summary = summary.split('\n').map(line => this.cleanComment(line))
                    .filter(line => line.length > 0).join(' ');
                summary = summary.replace(/\s+/g, ' ').trim();
                if (summary) {
                    result.summary = summary;
                    console.log(`[extractXmlCommentInfo] 提取到 summary: ${summary}`);
                }
            } else {
                console.log(`[extractXmlCommentInfo] 未找到 <summary> 标签`);
            }
            
            // 提取所有 <param> 标签
            const paramMatches = xmlComment.matchAll(/<param\s+name=["']([^"']+)["']>([\s\S]*?)<\/param>/gi);
            const params: Array<{ name: string; description: string }> = [];
            for (const match of paramMatches) {
                const paramName = match[1];
                let paramDesc = match[2];
                paramDesc = paramDesc.split('\n').map(line => this.cleanComment(line))
                    .filter(line => line.length > 0).join(' ');
                paramDesc = paramDesc.replace(/\s+/g, ' ').trim();
                if (paramName && paramDesc) {
                    params.push({ name: paramName, description: paramDesc });
                    console.log(`[extractXmlCommentInfo] 提取到参数: ${paramName} = ${paramDesc}`);
                }
            }
            if (params.length > 0) {
                result.params = params;
                console.log(`[extractXmlCommentInfo] 共提取到 ${params.length} 个参数`);
            } else {
                console.log(`[extractXmlCommentInfo] 未找到 <param> 标签`);
            }
            
            // 提取 <returns> 标签内容
            const returnsMatch = xmlComment.match(/<returns>([\s\S]*?)<\/returns>/i);
            if (returnsMatch) {
                let returns = returnsMatch[1];
                returns = returns.split('\n').map(line => this.cleanComment(line))
                    .filter(line => line.length > 0).join(' ');
                returns = returns.replace(/\s+/g, ' ').trim();
                if (returns) {
                    result.returns = returns;
                    console.log(`[extractXmlCommentInfo] 提取到 returns: ${returns}`);
                }
            } else {
                console.log(`[extractXmlCommentInfo] 未找到 <returns> 标签`);
            }
        } else {
            console.log(`[extractXmlCommentInfo] 未找到 XML 注释`);
        }
        
        console.log(`[extractXmlCommentInfo] 提取结果:`, JSON.stringify(result, null, 2));
        return result;
    }

    /**
     * 提取注释（向上查找）
     * 优先提取 XML 文档注释中的 <summary> 标签内容
     */
    protected extractComment(lines: string[], lineIndex: number): string | undefined {
        // 确保 lineIndex 在有效范围内
        if (lineIndex < 0 || lineIndex >= lines.length) {
            console.log(`[extractComment] 行索引 ${lineIndex} 超出范围，数组长度: ${lines.length}`);
            return undefined;
        }
        
        // 向上查找 XML 文档注释（最多查找20行，因为 XML 注释可能跨多行）
        let xmlCommentLines: string[] = [];
        let foundXmlStart = false;
        
        for (let i = lineIndex - 1; i >= Math.max(0, lineIndex - 20); i--) {
            // 检查索引是否有效
            if (i < 0 || i >= lines.length) {
                break;
            }
            
            const originalLine = lines[i];
            // 检查行是否存在
            if (originalLine === undefined || originalLine === null) {
                break;
            }
            
            const line = originalLine.trim();
            
            // 查找 XML 文档注释开始
            if (line.startsWith('///')) {
                foundXmlStart = true;
                // 移除开头的 /// 和可能的空格
                let content = originalLine.substring(originalLine.indexOf('///') + 3).trim();
                // 注意：这里不清理斜杠，因为可能包含在 <summary> 标签内
                // 等提取完 <summary> 内容后再清理
                xmlCommentLines.unshift(content);
            } else if (foundXmlStart) {
                // 如果已经开始收集 XML 注释，但当前行不是 XML 注释，停止收集
                // 但允许空行和属性行（以 [ 开头的行）
                if (line && !line.startsWith('//') && !line.startsWith('*') && !line.startsWith('[') && line.length > 0) {
                    break;
                }
            } else {
                // 如果还没找到 XML 注释，检查是否是其他类型的注释
                // 如果遇到非空行且不是注释，停止查找
                // 但允许属性行（以 [ 开头的行）
                if (line && !line.startsWith('//') && !line.startsWith('*') && !line.startsWith('///') && !line.startsWith('[')) {
                    break;
                }
            }
        }
        
        // 如果找到了 XML 注释，提取 <summary> 标签内容
        if (xmlCommentLines.length > 0) {
            // 合并所有 XML 注释行，保留换行以便正确匹配标签
            const xmlComment = xmlCommentLines.join('\n');
            
            // 匹配 <summary> 标签内容（非贪婪匹配，支持多行）
            const summaryMatch = xmlComment.match(/<summary>([\s\S]*?)<\/summary>/i);
            if (summaryMatch) {
                let summary = summaryMatch[1];
                // 清理 summary 内容：移除所有开头的斜杠和多余空格
                // 但保留换行，因为可能需要处理多行注释
                summary = summary.split('\n').map(line => {
                    // 对每一行清理开头的斜杠
                    const cleaned = this.cleanComment(line);
                    return cleaned;
                }).filter(line => line.length > 0).join(' ');
                
                // 最后清理多余的空格
                summary = summary.replace(/\s+/g, ' ').trim();
                if (summary) {
                    return summary;
                }
            }
            
            // 如果没有找到 <summary> 标签，但找到了 XML 注释，返回整个注释内容（清理后）
            const cleanedComment = xmlCommentLines.map(line => this.cleanComment(line))
                .filter(line => line.length > 0)
                .join(' ');
            if (cleanedComment) {
                return cleanedComment;
            }
        }
        
        // 如果没有找到 XML 注释，尝试提取普通注释
        for (let i = lineIndex - 1; i >= Math.max(0, lineIndex - 5); i--) {
            const line = lines[i].trim();
            
            // C#/Java 单行注释
            if (line.startsWith('//') && !line.startsWith('///')) {
                let comment = line.substring(2);
                comment = this.cleanComment(comment);
                return comment || undefined;
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
                comment = this.cleanComment(comment);
                return comment || undefined;
            }
            
            // 如果遇到非空行且不是注释，停止查找
            if (line && !line.startsWith('//') && !line.startsWith('*') && !line.startsWith('///')) {
                break;
            }
        }
        
        return undefined;
    }

    /**
     * 创建代码元素
     */
    protected createElement(
        name: string,
        type: CodeElementType,
        line: number,
        lineText: string,
        lines: string[],
        returnType?: string,
        parameters?: string,
        lineIndex?: number // 可选：相对于 lines 数组的索引，如果不提供则使用 line - 1
    ): CodeElement {
        console.log(`[createElement] 创建元素: ${name}, 类型: ${type}, 行号: ${line}`);
        
        // 提取 XML 注释信息
        // 如果提供了 lineIndex，使用它；否则使用 line - 1（假设 line 是从 1 开始的行号）
        const indexForComment = lineIndex !== undefined ? lineIndex : (line - 1);
        const xmlCommentInfo = this.extractXmlCommentInfo(lines, indexForComment);
        
        // 提取注释，确保清理所有开头的斜杠
        // 使用 indexForComment 而不是 line - 1，确保使用正确的索引
        let comment = xmlCommentInfo.summary || this.extractComment(lines, indexForComment);
        if (comment) {
            // 再次清理注释，确保没有开头的斜杠
            comment = this.cleanComment(comment);
        }
        
        const element: CodeElement = {
            name,
            type,
            accessModifier: this.extractAccessModifier(lineText),
            line,
            comment: comment,
            returnType,
            parameters,
            returns: xmlCommentInfo.returns,
            children: []
        };
        
        console.log(`[createElement] 元素基本信息: name=${name}, comment=${element.comment}, returns=${element.returns}`);
        
        // 如果是方法或构造函数，将方法描述、参数和返回值作为子节点
        if (type === CodeElementType.Method || type === CodeElementType.Constructor) {
            element.children = [];
            
            // 添加方法描述子节点
            if (element.comment) {
                // 确保注释没有开头的斜杠
                let comment = element.comment;
                while (comment.startsWith('/')) {
                    comment = comment.substring(1).trim();
                }
                element.children.push({
                    name: '方法描述:',
                    type: CodeElementType.Variable,
                    accessModifier: AccessModifier.Default,
                    line: line,
                    comment: comment,
                    children: []
                });
                console.log(`[createElement] 为方法 ${name} 创建方法描述子节点: ${comment}`);
            }
            
            // 添加方法参数子节点（如果有参数）
            if (xmlCommentInfo.params && xmlCommentInfo.params.length > 0) {
                // 创建"方法参数:"父节点
                const methodParamsNode: CodeElement = {
                    name: '方法参数:',
                    type: CodeElementType.Variable,
                    accessModifier: AccessModifier.Default,
                    line: line,
                    comment: undefined,
                    children: []
                };
                
                // 为每个参数创建子节点
                console.log(`[createElement] 为方法 ${name} 创建 ${xmlCommentInfo.params.length} 个参数子节点`);
                methodParamsNode.children = xmlCommentInfo.params.map(param => {
                    // 确保参数描述没有开头的斜杠
                    let paramDesc = param.description;
                    while (paramDesc.startsWith('/')) {
                        paramDesc = paramDesc.substring(1).trim();
                    }
                    console.log(`[createElement] 创建参数子节点: ${param.name} = ${paramDesc}`);
                    return {
                        name: param.name,
                        type: CodeElementType.Variable,
                        accessModifier: AccessModifier.Default,
                        line: line,
                        comment: paramDesc,
                        children: []
                    };
                });
                
                element.children.push(methodParamsNode);
            }
            
            // 添加方法返回子节点
            if (element.returns) {
                // 确保返回值没有开头的斜杠
                let returns = element.returns;
                while (returns.startsWith('/')) {
                    returns = returns.substring(1).trim();
                }
                element.children.push({
                    name: '方法返回:',
                    type: CodeElementType.Variable,
                    accessModifier: AccessModifier.Default,
                    line: line,
                    comment: returns,
                    children: []
                });
                console.log(`[createElement] 为方法 ${name} 创建方法返回子节点: ${returns}`);
            }
            
            if (element.children.length > 0) {
                console.log(`[createElement] 方法 ${name} 共有 ${element.children.length} 个子节点`);
            }
        }
        
        console.log(`[createElement] 最终元素:`, JSON.stringify({
            name: element.name,
            type: element.type,
            comment: element.comment,
            returns: element.returns,
            childrenCount: element.children?.length || 0
        }, null, 2));
        
        return element;
    }
}

