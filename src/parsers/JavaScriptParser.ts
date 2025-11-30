import * as vscode from 'vscode';
import { CodeElement, CodeElementType, AccessModifier } from '../fileStructureParser';
import { BaseParser } from './BaseParser';

/**
 * JavaScript/TypeScript 文件解析器
 */
export class JavaScriptParser extends BaseParser {
    async parse(document: vscode.TextDocument, lines: string[], startLineOffset: number = 0): Promise<CodeElement[]> {
        const elements: CodeElement[] = [];
        let lineNum = 0;
        let inExportDefault = false;
        let exportDefaultStartLine = 0;
        let braceCount = 0;

        for (const line of lines) {
            lineNum++;
            const trimmedLine = line.trim();
            
            // 跳过空行和注释
            if (!trimmedLine || trimmedLine.startsWith('//') || trimmedLine.startsWith('*') || trimmedLine.startsWith('/**')) {
                continue;
            }
            
            // 检查是否是 export default { ... } 格式（Vue 组件）
            if (trimmedLine.includes('export default') && trimmedLine.includes('{')) {
                inExportDefault = true;
                exportDefaultStartLine = lineNum + startLineOffset; // 加上行号偏移
                braceCount = (trimmedLine.match(/{/g) || []).length - (trimmedLine.match(/}/g) || []).length;
                
                // 创建 export default 元素
                const exportDefaultElement: CodeElement = {
                    name: 'export default',
                    type: CodeElementType.Class,
                    accessModifier: AccessModifier.Default,
                    line: exportDefaultStartLine,
                    children: [],
                    comment: undefined
                };
                elements.push(exportDefaultElement);
                
                // 解析 export default 对象中的属性
                if (braceCount > 0) {
                    const properties = this.parseExportDefaultProperties(lines, lineNum, exportDefaultElement, startLineOffset);
                    exportDefaultElement.children = properties;
                }
                
                continue;
            }
            
            // 如果在 export default 块中，继续计数大括号
            if (inExportDefault) {
                braceCount += (trimmedLine.match(/{/g) || []).length - (trimmedLine.match(/}/g) || []).length;
                if (braceCount <= 0) {
                    inExportDefault = false;
                }
                continue;
            }
            
            // 解析类定义
            const classElement = this.parseClass(trimmedLine, lineNum, lines);
            if (classElement) {
                elements.push(classElement);
                continue;
            }
            
            // 解析函数定义
            const functionElement = this.parseFunction(trimmedLine, lineNum, lines);
            if (functionElement) {
                elements.push(functionElement);
                continue;
            }
            
            // 解析接口定义（TypeScript）
            const interfaceElement = this.parseInterface(trimmedLine, lineNum, lines);
            if (interfaceElement) {
                elements.push(interfaceElement);
                continue;
            }
        }

        return elements;
    }

    /**
     * 解析 export default 对象中的属性（Vue 组件）
     */
    private parseExportDefaultProperties(lines: string[], startLine: number, parentElement: CodeElement, startLineOffset: number = 0): CodeElement[] {
        const properties: CodeElement[] = [];
        let braceCount = 0;
        let inExportDefault = false;
        let currentProperty: { name: string; startLine: number; braceCount: number; type: string } | null = null;
        
        // Vue 组件的常见属性
        const vuePropertyPatterns = [
            { name: 'name', pattern: /^\s*name\s*[:=]\s*['"]([^'"]+)['"]/, type: 'property' },
            { name: 'data', pattern: /^\s*data\s*[:=]\s*(?:\([^)]*\)\s*=>\s*)?{/, type: 'data' },
            { name: 'methods', pattern: /^\s*methods\s*[:=]\s*{/, type: 'methods' },
            { name: 'computed', pattern: /^\s*computed\s*[:=]\s*{/, type: 'computed' },
            { name: 'watch', pattern: /^\s*watch\s*[:=]\s*{/, type: 'watch' },
            { name: 'props', pattern: /^\s*props\s*[:=]\s*{/, type: 'props' },
            { name: 'components', pattern: /^\s*components\s*[:=]\s*{/, type: 'components' },
            { name: 'mounted', pattern: /^\s*mounted\s*\([^)]*\)\s*{/, type: 'lifecycle' },
            { name: 'created', pattern: /^\s*created\s*\([^)]*\)\s*{/, type: 'lifecycle' },
            { name: 'beforeMount', pattern: /^\s*beforeMount\s*\([^)]*\)\s*{/, type: 'lifecycle' },
            { name: 'beforeDestroy', pattern: /^\s*beforeDestroy\s*\([^)]*\)\s*{/, type: 'lifecycle' },
            { name: 'destroyed', pattern: /^\s*destroyed\s*\([^)]*\)\s*{/, type: 'lifecycle' },
            { name: 'beforeCreate', pattern: /^\s*beforeCreate\s*\([^)]*\)\s*{/, type: 'lifecycle' },
            { name: 'beforeUpdate', pattern: /^\s*beforeUpdate\s*\([^)]*\)\s*{/, type: 'lifecycle' },
            { name: 'updated', pattern: /^\s*updated\s*\([^)]*\)\s*{/, type: 'lifecycle' },
            { name: 'activated', pattern: /^\s*activated\s*\([^)]*\)\s*{/, type: 'lifecycle' },
            { name: 'deactivated', pattern: /^\s*deactivated\s*\([^)]*\)\s*{/, type: 'lifecycle' },
            { name: 'setup', pattern: /^\s*setup\s*[:=]\s*(?:\([^)]*\)\s*=>\s*)?{/, type: 'setup' }
        ];
        
        for (let i = startLine - 1; i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();
            
            // 跳过空行和注释
            if (!trimmedLine || trimmedLine.startsWith('//') || trimmedLine.startsWith('*')) {
                continue;
            }
            
            // 检查是否是 export default 开始
            if (trimmedLine.includes('export default') && trimmedLine.includes('{')) {
                inExportDefault = true;
                braceCount = (trimmedLine.match(/{/g) || []).length - (trimmedLine.match(/}/g) || []).length;
                continue;
            }
            
            if (!inExportDefault) {
                continue;
            }
            
            // 更新大括号计数
            const lineBraceCount = (trimmedLine.match(/{/g) || []).length - (trimmedLine.match(/}/g) || []).length;
            braceCount += lineBraceCount;
            
            // 如果当前正在解析某个属性，检查是否结束
            if (currentProperty) {
                currentProperty.braceCount += lineBraceCount;
                
                // 如果当前属性的块结束了，解析其内容
                if (currentProperty.braceCount <= 0) {
                    const propertyElement = properties.find(p => p.name === currentProperty!.name);
                    if (propertyElement) {
                        // 根据属性类型解析内容
                        if (currentProperty.type === 'methods') {
                            propertyElement.children = this.parseMethodsContent(lines, currentProperty.startLine, i + 1, startLineOffset);
                        } else if (currentProperty.type === 'computed') {
                            propertyElement.children = this.parseComputedContent(lines, currentProperty.startLine, i + 1, startLineOffset);
                        } else if (currentProperty.type === 'data') {
                            propertyElement.children = this.parseDataContent(lines, currentProperty.startLine, i + 1, startLineOffset);
                        } else if (currentProperty.type === 'watch') {
                            propertyElement.children = this.parseWatchContent(lines, currentProperty.startLine, i + 1, startLineOffset);
                        } else if (currentProperty.type === 'props') {
                            propertyElement.children = this.parsePropsContent(lines, currentProperty.startLine, i + 1, startLineOffset);
                        }
                        // 生命周期钩子不需要解析子内容，它们本身就是方法
                    }
                    currentProperty = null;
                }
                continue;
            }
            
            // 检查是否是 Vue 组件属性
            for (const prop of vuePropertyPatterns) {
                if (prop.pattern.test(trimmedLine)) {
                    const actualLineNumber = i + 1 + startLineOffset; // 加上行号偏移
                    const element = this.createElement(
                        prop.name,
                        CodeElementType.Property,
                        actualLineNumber,
                        line,
                        lines,
                        undefined,
                        undefined,
                        i // 传入相对于 lines 数组的索引
                    );
                    properties.push(element);
                    
                    // 如果是需要解析内容的属性，开始跟踪
                    if (['methods', 'computed', 'data', 'watch', 'props'].includes(prop.type)) {
                        currentProperty = {
                            name: prop.name,
                            startLine: i + 1,
                            braceCount: (trimmedLine.match(/{/g) || []).length - (trimmedLine.match(/}/g) || []).length,
                            type: prop.type
                        };
                    } else if (prop.type === 'lifecycle') {
                        // 生命周期钩子不需要跟踪，它们本身就是方法，不需要解析子内容
                        // 但我们需要确保它们被正确添加到 properties 中
                    }
                    break;
                }
            }
            
            // 如果大括号计数归零，说明 export default 块结束
            if (braceCount <= 0) {
                break;
            }
        }
        
        return properties;
    }

    /**
     * 解析 methods 内容
     */
    private parseMethodsContent(lines: string[], startLine: number, endLine: number, startLineOffset: number = 0): CodeElement[] {
        const methods: CodeElement[] = [];
        let braceCount = 0;
        let inMethods = false;
        let inMethodBody = false;
        let methodBodyBraceCount = 0;
        
        for (let i = startLine - 1; i < endLine && i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();
            
            // 跳过空行和注释
            if (!trimmedLine || trimmedLine.startsWith('//') || trimmedLine.startsWith('*')) {
                continue;
            }
            
            // 检查 methods 开始
            if (trimmedLine.includes('methods') && trimmedLine.includes('{')) {
                inMethods = true;
                braceCount = (trimmedLine.match(/{/g) || []).length - (trimmedLine.match(/}/g) || []).length;
                continue;
            }
            
            if (!inMethods) {
                continue;
            }
            
            // 更新 methods 块的大括号计数
            const lineBraceCount = (trimmedLine.match(/{/g) || []).length - (trimmedLine.match(/}/g) || []).length;
            
            // 如果正在方法体内，更新方法体的大括号计数
            if (inMethodBody) {
                methodBodyBraceCount += lineBraceCount;
                
                // 如果方法体结束
                if (methodBodyBraceCount <= 0) {
                    inMethodBody = false;
                    methodBodyBraceCount = 0;
                }
                
                // 更新 methods 块的大括号计数
                braceCount += lineBraceCount;
                
                // 如果 methods 块结束
                if (braceCount <= 0) {
                    break;
                }
                
                continue; // 跳过方法体内的内容
            }
            
            // 解析方法定义：methodName() { 或 methodName: function() { 或 methodName: () => {
            const methodMatch = trimmedLine.match(/^\s*(\w+)\s*[:=]\s*(?:function\s*\(|\(|async\s*\(|async\s*function\s*\()/) ||
                              trimmedLine.match(/^\s*(\w+)\s*\(/);
            
            if (methodMatch) {
                const methodName = methodMatch[1];
                // 提取参数
                const paramMatch = trimmedLine.match(/\(([^)]*)\)/);
                const parameters = paramMatch ? paramMatch[1] : '';
                
                // 检查方法体是否在同一行开始
                const hasMethodBody = trimmedLine.includes('{');
                if (hasMethodBody) {
                    // 方法体在同一行开始，计算方法体的大括号计数
                    methodBodyBraceCount = (trimmedLine.match(/{/g) || []).length - (trimmedLine.match(/}/g) || []).length;
                    if (methodBodyBraceCount > 0) {
                        inMethodBody = true;
                    }
                }
                
                const actualLineNumber = i + 1 + startLineOffset; // 加上行号偏移
                // 注意：createElement 中的 line 参数是实际行号，但 extractXmlCommentInfo 需要的是相对于 lines 数组的索引
                // 所以我们需要传入相对于 lines 数组的索引（i），而不是实际行号
                const methodElement = this.createElement(
                    methodName,
                    CodeElementType.Method,
                    actualLineNumber,
                    line,
                    lines,
                    undefined,
                    parameters,
                    i // 传入相对于 lines 数组的索引，用于 extractXmlCommentInfo
                );
                methods.push(methodElement);
                
                // 更新 methods 块的大括号计数
                braceCount += lineBraceCount;
                
                // 如果 methods 块结束
                if (braceCount <= 0) {
                    break;
                }
                
                continue;
            }
            
            // 如果当前行是方法体的开始（方法定义在上一行，方法体在这一行）
            // 只有在不在方法体内且当前行是单独的 { 时才进入方法体
            if (!inMethodBody && trimmedLine === '{') {
                methodBodyBraceCount = 1;
                inMethodBody = true;
                // 更新 methods 块的大括号计数
                braceCount += lineBraceCount;
                continue;
            }
            
            // 更新 methods 块的大括号计数
            braceCount += lineBraceCount;
            
            // 如果 methods 块结束
            if (braceCount <= 0) {
                break;
            }
        }
        
        return methods;
    }

    /**
     * 解析 computed 内容
     */
    private parseComputedContent(lines: string[], startLine: number, endLine: number, startLineOffset: number = 0): CodeElement[] {
        const computed: CodeElement[] = [];
        let braceCount = 0;
        let inComputed = false;
        
        for (let i = startLine - 1; i < endLine && i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();
            
            // 跳过空行和注释
            if (!trimmedLine || trimmedLine.startsWith('//') || trimmedLine.startsWith('*')) {
                continue;
            }
            
            // 检查 computed 开始
            if (trimmedLine.includes('computed') && trimmedLine.includes('{')) {
                inComputed = true;
                braceCount = (trimmedLine.match(/{/g) || []).length - (trimmedLine.match(/}/g) || []).length;
                continue;
            }
            
            if (!inComputed) {
                continue;
            }
            
            // 更新大括号计数
            braceCount += (trimmedLine.match(/{/g) || []).length - (trimmedLine.match(/}/g) || []).length;
            
            // 解析计算属性：propertyName() { 或 propertyName: { get() { ... } }
            const computedMatch = trimmedLine.match(/^\s*(\w+)\s*[:=]\s*(?:function\s*\(|\(|{)/);
            
            if (computedMatch) {
                const propertyName = computedMatch[1];
                const actualLineNumber = i + 1 + startLineOffset; // 加上行号偏移
                const computedElement = this.createElement(
                    propertyName,
                    CodeElementType.Property,
                    actualLineNumber,
                    line,
                    lines,
                    undefined,
                    undefined,
                    i // 传入相对于 lines 数组的索引
                );
                computed.push(computedElement);
            }
            
            // 如果 computed 块结束
            if (braceCount <= 0) {
                break;
            }
        }
        
        return computed;
    }

    /**
     * 解析 data 内容
     */
    private parseDataContent(lines: string[], startLine: number, endLine: number, startLineOffset: number = 0): CodeElement[] {
        const data: CodeElement[] = [];
        let braceCount = 0;
        let inData = false;
        let inReturn = false;
        
        for (let i = startLine - 1; i < endLine && i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();
            
            // 跳过空行和注释
            if (!trimmedLine || trimmedLine.startsWith('//') || trimmedLine.startsWith('*')) {
                continue;
            }
            
            // 检查 data 开始
            if (trimmedLine.includes('data') && (trimmedLine.includes('{') || trimmedLine.includes('('))) {
                inData = true;
                braceCount = (trimmedLine.match(/{/g) || []).length - (trimmedLine.match(/}/g) || []).length;
                continue;
            }
            
            if (!inData) {
                continue;
            }
            
            // 检查 return 语句
            if (trimmedLine.includes('return') && trimmedLine.includes('{')) {
                inReturn = true;
                braceCount = (trimmedLine.match(/{/g) || []).length - (trimmedLine.match(/}/g) || []).length;
                continue;
            }
            
            if (!inReturn) {
                continue;
            }
            
            // 更新大括号计数
            braceCount += (trimmedLine.match(/{/g) || []).length - (trimmedLine.match(/}/g) || []).length;
            
            // 解析数据属性：propertyName: value 或 'propertyName': value
            const dataMatch = trimmedLine.match(/^\s*(?:['"]?)(\w+)(?:['"]?)\s*[:=]/);
            
            if (dataMatch) {
                const propertyName = dataMatch[1];
                const actualLineNumber = i + 1 + startLineOffset; // 加上行号偏移
                const dataElement = this.createElement(
                    propertyName,
                    CodeElementType.Variable,
                    actualLineNumber,
                    line,
                    lines,
                    undefined,
                    undefined,
                    i // 传入相对于 lines 数组的索引
                );
                data.push(dataElement);
            }
            
            // 如果 data 块结束
            if (braceCount <= 0) {
                break;
            }
        }
        
        return data;
    }

    /**
     * 解析 watch 内容
     */
    private parseWatchContent(lines: string[], startLine: number, endLine: number, startLineOffset: number = 0): CodeElement[] {
        const watch: CodeElement[] = [];
        let braceCount = 0;
        let inWatch = false;
        
        for (let i = startLine - 1; i < endLine && i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();
            
            // 跳过空行和注释
            if (!trimmedLine || trimmedLine.startsWith('//') || trimmedLine.startsWith('*')) {
                continue;
            }
            
            // 检查 watch 开始
            if (trimmedLine.includes('watch') && trimmedLine.includes('{')) {
                inWatch = true;
                braceCount = (trimmedLine.match(/{/g) || []).length - (trimmedLine.match(/}/g) || []).length;
                continue;
            }
            
            if (!inWatch) {
                continue;
            }
            
            // 更新大括号计数
            braceCount += (trimmedLine.match(/{/g) || []).length - (trimmedLine.match(/}/g) || []).length;
            
            // 解析 watch 属性：'propertyName': function() { 或 propertyName() { 或 'propertyName'(newVal, oldVal) {
            const watchMatch = trimmedLine.match(/^\s*(?:['"]?)(\w+)(?:['"]?)\s*[:=]\s*(?:function\s*\(|\(|async\s*\(|async\s*function\s*\()/) ||
                              trimmedLine.match(/^\s*(?:['"]?)(\w+)(?:['"]?)\s*\(/);
            
            if (watchMatch) {
                const watchName = watchMatch[1];
                const actualLineNumber = i + 1 + startLineOffset; // 加上行号偏移
                const watchElement = this.createElement(
                    watchName,
                    CodeElementType.Method,
                    actualLineNumber,
                    line,
                    lines,
                    undefined,
                    undefined,
                    i // 传入相对于 lines 数组的索引
                );
                watch.push(watchElement);
            }
            
            // 如果 watch 块结束
            if (braceCount <= 0) {
                break;
            }
        }
        
        return watch;
    }

    /**
     * 解析 props 内容
     */
    private parsePropsContent(lines: string[], startLine: number, endLine: number, startLineOffset: number = 0): CodeElement[] {
        const props: CodeElement[] = [];
        let braceCount = 0;
        let inProps = false;
        
        for (let i = startLine - 1; i < endLine && i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();
            
            // 跳过空行和注释
            if (!trimmedLine || trimmedLine.startsWith('//') || trimmedLine.startsWith('*')) {
                continue;
            }
            
            // 检查 props 开始
            if (trimmedLine.includes('props') && trimmedLine.includes('{')) {
                inProps = true;
                braceCount = (trimmedLine.match(/{/g) || []).length - (trimmedLine.match(/}/g) || []).length;
                continue;
            }
            
            if (!inProps) {
                continue;
            }
            
            // 更新大括号计数
            braceCount += (trimmedLine.match(/{/g) || []).length - (trimmedLine.match(/}/g) || []).length;
            
            // 解析 prop 定义：propName: { type: String, default: '' } 或 propName: String
            const propMatch = trimmedLine.match(/^\s*(?:['"]?)(\w+)(?:['"]?)\s*[:=]/);
            
            if (propMatch) {
                const propName = propMatch[1];
                const actualLineNumber = i + 1 + startLineOffset; // 加上行号偏移
                const propElement = this.createElement(
                    propName,
                    CodeElementType.Property,
                    actualLineNumber,
                    line,
                    lines,
                    undefined,
                    undefined,
                    i // 传入相对于 lines 数组的索引
                );
                props.push(propElement);
            }
            
            // 如果 props 块结束
            if (braceCount <= 0) {
                break;
            }
        }
        
        return props;
    }

    /**
     * 解析类定义
     */
    private parseClass(line: string, lineNum: number, lines: string[]): CodeElement | null {
        const classMatch = line.match(/(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+(\w+)/);
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
     * 解析函数定义
     */
    private parseFunction(line: string, lineNum: number, lines: string[]): CodeElement | null {
        // function functionName() 或 const functionName = () => 或 functionName() {}
        const functionMatch = line.match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/) ||
                              line.match(/(?:export\s+)?(?:const|let|var)\s+(\w+)\s*[=:]\s*(?:async\s*)?\(/) ||
                              line.match(/(?:export\s+)?(\w+)\s*[:=]\s*(?:async\s*)?\(/);
        
        if (functionMatch) {
            return this.createElement(
                functionMatch[1],
                CodeElementType.Function,
                lineNum,
                line,
                lines
            );
        }
        return null;
    }

    /**
     * 解析接口定义（TypeScript）
     */
    private parseInterface(line: string, lineNum: number, lines: string[]): CodeElement | null {
        const interfaceMatch = line.match(/(?:export\s+)?interface\s+(\w+)/);
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
}

