import * as vscode from 'vscode';
import { CodeElement, CodeElementType, AccessModifier } from '../fileStructureParser';
import { BaseParser } from './BaseParser';

/**
 * Vue 文件解析器
 */
export class VueParser extends BaseParser {
    async parse(document: vscode.TextDocument, lines: string[]): Promise<CodeElement[]> {
        console.log('[VueParser] 开始解析 Vue 文件');
        const elements: CodeElement[] = [];
        let lineNum = 0;
        let inScriptTag = false;
        let scriptContent: string[] = [];
        let scriptElement: CodeElement | null = null;
        let styleStartLine = 0;
        let inTemplate = false;
        let inStyle = false;

        // 解析 Vue 文件结构：template, script, style
        for (const line of lines) {
            lineNum++;
            const trimmedLine = line.trim();
            
            // 跳过 <template> 标签，不解析 template 内容
            if (trimmedLine.startsWith('<template') || trimmedLine.match(/^<template\s/)) {
                inTemplate = true;
                continue;
            }
            
            if (inTemplate && trimmedLine.includes('</template>')) {
                inTemplate = false;
                continue;
            }
            
            if (inTemplate) {
                // 跳过 template 内容
                continue;
            }
            
            // 解析 <script> 标签（支持 <script> 和 <script setup>）
            if (trimmedLine.includes('<script')) {
                inScriptTag = true;
                const scriptStartLine = lineNum;
                console.log(`[VueParser] 找到 script 标签，行号: ${scriptStartLine}`);
                // 创建 script 元素
                scriptElement = {
                    name: 'script',
                    type: CodeElementType.Module,
                    accessModifier: AccessModifier.Default,
                    line: scriptStartLine,
                    children: []
                };
                elements.push(scriptElement);
                continue;
            }
            
            if (inScriptTag && trimmedLine.includes('</script>')) {
                inScriptTag = false;
                console.log(`[VueParser] script 标签结束，行号: ${lineNum}，收集了 ${scriptContent.length} 行内容`);
                // 解析 script 内容
                // 注意：scriptContent 不包含 <script> 标签本身，所以起始行号是 scriptStartLine + 1
                if (scriptContent.length > 0 && scriptElement) {
                    const scriptStartLine = scriptElement.line;
                    const scriptElements = await this.parseScriptContent(scriptContent, document, scriptStartLine + 1);
                    console.log(`[VueParser] script 内容解析完成，找到 ${scriptElements.length} 个元素`);
                    // 将解析的元素作为 script 的子节点
                    if (scriptElements.length > 0) {
                        scriptElement.children = scriptElements;
                    }
                }
                scriptContent = [];
                scriptElement = null;
                continue;
            }
            
            if (inScriptTag) {
                scriptContent.push(line);
            }
            
            // 解析 <style> 标签（支持 <style> 和 <style scoped>）
            if (trimmedLine.startsWith('<style') || trimmedLine.match(/^<style\s/)) {
                styleStartLine = lineNum;
                inStyle = true;
                const isScoped = trimmedLine.includes('scoped');
                console.log(`[VueParser] 找到 style 标签${isScoped ? ' (scoped)' : ''}，行号: ${styleStartLine}`);
                // 创建 style 元素
                elements.push({
                    name: isScoped ? 'style scoped' : 'style',
                    type: CodeElementType.Module,
                    accessModifier: AccessModifier.Default,
                    line: styleStartLine,
                    children: []
                });
                continue;
            }
            
            if (inStyle && trimmedLine.includes('</style>')) {
                inStyle = false;
                console.log(`[VueParser] style 标签结束，行号: ${lineNum}`);
                continue;
            }
        }

        console.log(`[VueParser] 解析完成，找到 ${elements.length} 个元素:`, elements.map(e => e.name).join(', '));

        // 如果没有找到任何标签，尝试解析整个文件作为 script
        if (elements.length === 0 && scriptContent.length > 0) {
            console.log('[VueParser] 未找到标签，解析整个文件作为 script');
            return this.parseScriptContent(scriptContent, document);
        }

        return elements;
    }

    /**
     * 解析 template 内容（类似 HTML 解析，递归解析标签及其子标签）
     */
    private parseTemplateContent(lines: string[], startLine: number): CodeElement[] {
        const elements: CodeElement[] = [];
        const stack: Array<{ element: CodeElement; startLine: number; braceCount: number }> = [];
        
        for (let i = 0; i < lines.length; i++) {
            // 实际行号 = startLine（已经是template标签之后的第一行）+ 当前索引
            const currentLine = startLine + i;
            const line = lines[i];
            const trimmedLine = line.trim();
            
            // 跳过空行和注释
            if (!trimmedLine || trimmedLine.startsWith('<!--')) {
                continue;
            }
            
            // 解析开始标签：<tagName 或 <tagName attr="value">
            // 改进正则，支持更多情况
            const startTagMatch = trimmedLine.match(/<([a-zA-Z][\w-]*)[^>]*>/);
            if (startTagMatch) {
                const tagName = startTagMatch[1];
                
                // 跳过 script、style、template 标签（这些不应该在 template 内容中出现）
                if (['script', 'style', 'template'].includes(tagName.toLowerCase())) {
                    continue;
                }
                
                // 检查是否是自闭合标签（<tag /> 或 <tag/>）
                const isSelfClosing = /\/\s*>$/.test(trimmedLine) || trimmedLine.match(/<[^>]+\/>/);
                
                // 提取 id 或 class 属性作为名称
                const idMatch = trimmedLine.match(/id\s*=\s*["']([^"']+)["']/);
                const classMatch = trimmedLine.match(/class\s*=\s*["']([^"']+)["']/);
                const name = idMatch ? idMatch[1] : (classMatch ? classMatch[1] : tagName);
                
                // 创建元素，保存标签名用于匹配结束标签
                const element: CodeElement = {
                    name: name,
                    type: CodeElementType.Module,
                    accessModifier: AccessModifier.Default,
                    line: currentLine,
                    children: []
                };
                
                // 在元素上保存标签名（用于匹配结束标签）
                (element as any).tagName = tagName;
                
                // 如果不是自闭合标签，需要跟踪其结束位置
                if (!isSelfClosing) {
                    // 计算标签计数（用于跟踪标签嵌套）
                    let tagCount = 1; // 开始标签算1
                    // 检查是否有结束标签在同一行
                    const endTagInSameLine = trimmedLine.includes(`</${tagName}>`);
                    if (endTagInSameLine) {
                        tagCount = 0; // 同一行开始和结束
                    }
                    
                    // 如果栈为空，这是根元素
                    if (stack.length === 0) {
                        elements.push(element);
                    } else {
                        // 这是子元素，添加到父元素的 children
                        const parent = stack[stack.length - 1];
                        if (parent.element.children) {
                            parent.element.children.push(element);
                        }
                    }
                    
                    // 如果不是自闭合且没有在同一行结束，推入栈
                    if (tagCount > 0) {
                        stack.push({ element, startLine: currentLine, braceCount: tagCount });
                    }
                } else {
                    // 自闭合标签，直接添加到当前父元素或根元素
                    if (stack.length === 0) {
                        elements.push(element);
                    } else {
                        const parent = stack[stack.length - 1];
                        if (parent.element.children) {
                            parent.element.children.push(element);
                        }
                    }
                }
                
                continue;
            }
            
            // 解析结束标签：</tagName>
            const endTagMatch = trimmedLine.match(/<\/(\w+)>/);
            if (endTagMatch && stack.length > 0) {
                const tagName = endTagMatch[1];
                // 从栈顶开始查找匹配的标签
                for (let j = stack.length - 1; j >= 0; j--) {
                    const stackItem = stack[j];
                    const elementTagName = (stackItem.element as any).tagName;
                    // 检查标签名是否匹配
                    if (elementTagName === tagName) {
                        stackItem.braceCount--;
                        if (stackItem.braceCount <= 0) {
                            stack.splice(j, 1);
                        }
                        break;
                    }
                }
            }
        }
        
        return elements;
    }

    /**
     * 解析 script 标签内容
     */
    private async parseScriptContent(lines: string[], document: vscode.TextDocument, startLineOffset: number = 0): Promise<CodeElement[]> {
        // 使用 JavaScript 解析器解析 script 内容
        const jsParser = new (await import('./JavaScriptParser')).JavaScriptParser();
        const elements = await jsParser.parse(document, lines, startLineOffset);
        return elements;
    }
}

