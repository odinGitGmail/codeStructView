import * as vscode from 'vscode';
import { CodeElement, CodeElementType } from '../fileStructureParser';
import { BaseParser } from './BaseParser';

/**
 * C# 文件解析器
 */
export class CSharpParser extends BaseParser {
    async parse(document: vscode.TextDocument, lines: string[]): Promise<CodeElement[]> {
        const elements: CodeElement[] = [];
        let lineNum = 0;
        let braceCount = 0;
        let currentNamespace: CodeElement | null = null;
        let namespaceStartBrace = -1; // 命名空间开始的大括号计数
        let currentClass: CodeElement | null = null;
        let classStartBrace = -1; // 类开始的大括号计数
        let inMethod = false; // 是否在方法内部
        let methodBraceLevel = -1; // 方法的大括号层级

        for (const line of lines) {
            lineNum++;
            const trimmedLine = line.trim();
            
            // 跳过空行和所有注释（包括 XML 文档注释）
            if (!trimmedLine || 
                trimmedLine.startsWith('//') || 
                trimmedLine.startsWith('*') || 
                trimmedLine.startsWith('///') ||
                trimmedLine.startsWith('/*') ||
                trimmedLine.startsWith('/**')) {
                continue;
            }
            
            // 计算大括号，确定作用域
            const openBraces = (line.match(/{/g) || []).length;
            const closeBraces = (line.match(/}/g) || []).length;
            const beforeBraceCount = braceCount;
            braceCount += openBraces - closeBraces;
            
            // 检查命名空间是否结束（命名空间的大括号闭合）
            if (currentNamespace && namespaceStartBrace >= 0 && braceCount <= namespaceStartBrace) {
                currentNamespace = null;
                namespaceStartBrace = -1;
                currentClass = null;
                classStartBrace = -1;
                inMethod = false;
                methodBraceLevel = -1;
            }
            
            // 检查类是否结束（类的大括号闭合）
            if (currentClass && classStartBrace >= 0 && braceCount <= classStartBrace) {
                currentClass = null;
                classStartBrace = -1;
                inMethod = false;
                methodBraceLevel = -1;
            }
            
            // 检查方法是否结束（方法的大括号闭合）
            if (inMethod && methodBraceLevel >= 0 && braceCount <= methodBraceLevel) {
                inMethod = false;
                methodBraceLevel = -1;
            }
            
            // 解析命名空间（必须在类之前）
            if (!currentNamespace && !currentClass) {
                const namespaceElement = this.parseNamespace(trimmedLine, lineNum, lines);
                if (namespaceElement) {
                    currentNamespace = namespaceElement;
                    namespaceStartBrace = beforeBraceCount; // 记录命名空间开始前的大括号计数
                    elements.push(namespaceElement);
                    continue;
                }
            }
            
            // 解析类定义（可以在命名空间内部，也可以不在）
            if (!currentClass) {
                const classElement = this.parseClass(trimmedLine, lineNum, lines);
                if (classElement) {
                    currentClass = classElement;
                    classStartBrace = beforeBraceCount; // 记录类开始前的大括号计数
                    
                    // 如果存在命名空间，将类添加到命名空间的子节点
                    if (currentNamespace) {
                        if (!currentNamespace.children) {
                            currentNamespace.children = [];
                        }
                        currentNamespace.children.push(classElement);
                    } else {
                        // 如果没有命名空间，直接添加到根元素
                        elements.push(classElement);
                    }
                    continue;
                }
            }
            
            // 如果在类内部
            if (currentClass) {
                // 如果在方法内部，跳过所有解析（不解析方法内部的内容）
                if (inMethod) {
                    // 检查是否是新方法的开始（方法定义行）
                    const methodElement = this.parseMethod(trimmedLine, lineNum, lines, currentClass.name);
                    if (methodElement) {
                        // 这是一个新方法，更新方法状态
                        methodBraceLevel = braceCount;
                        if (!currentClass.children) {
                            currentClass.children = [];
                        }
                        currentClass.children.push(methodElement);
                    }
                    continue; // 跳过方法内部的所有内容
                }
                
                // 先尝试解析构造方法（必须在类内部，且不在方法内部）
                const constructorElement = this.parseConstructor(trimmedLine, lineNum, lines, currentClass.name);
                if (constructorElement) {
                    inMethod = true;
                    methodBraceLevel = braceCount; // 记录构造方法体开始的大括号计数
                    if (!currentClass.children) {
                        currentClass.children = [];
                    }
                    currentClass.children.push(constructorElement);
                    continue;
                }
                
                // 解析方法（必须在类内部，且不在方法内部）
                const methodElement = this.parseMethod(trimmedLine, lineNum, lines, currentClass.name);
                if (methodElement) {
                    inMethod = true;
                    methodBraceLevel = braceCount; // 记录方法体开始的大括号计数
                    if (!currentClass.children) {
                        currentClass.children = [];
                    }
                    currentClass.children.push(methodElement);
                    continue;
                }
                
                // 解析属性（必须在类内部，且不在方法内部）
                const propertyElement = this.parseProperty(trimmedLine, lineNum, lines);
                if (propertyElement) {
                    if (!currentClass.children) {
                        currentClass.children = [];
                    }
                    currentClass.children.push(propertyElement);
                    continue;
                }
                
                // 解析字段（必须在类内部，且不在方法内部）
                const fieldElement = this.parseField(trimmedLine, lineNum, lines);
                if (fieldElement) {
                    if (!currentClass.children) {
                        currentClass.children = [];
                    }
                    currentClass.children.push(fieldElement);
                    continue;
                }
            }
            
            // 解析接口定义（不在类内部）
            if (!currentClass) {
                const interfaceElement = this.parseInterface(trimmedLine, lineNum, lines);
                if (interfaceElement) {
                    // 如果存在命名空间，将接口添加到命名空间的子节点
                    if (currentNamespace) {
                        if (!currentNamespace.children) {
                            currentNamespace.children = [];
                        }
                        currentNamespace.children.push(interfaceElement);
                    } else {
                        elements.push(interfaceElement);
                    }
                    continue;
                }
                
                // 解析枚举
                const enumElement = this.parseEnum(trimmedLine, lineNum, lines);
                if (enumElement) {
                    // 如果存在命名空间，将枚举添加到命名空间的子节点
                    if (currentNamespace) {
                        if (!currentNamespace.children) {
                            currentNamespace.children = [];
                        }
                        currentNamespace.children.push(enumElement);
                    } else {
                        elements.push(enumElement);
                    }
                    continue;
                }
            }
        }

        return elements;
    }

    /**
     * 解析类定义
     */
    private parseClass(line: string, lineNum: number, lines: string[]): CodeElement | null {
        const classMatch = line.match(/(?:public|private|protected|internal)?\s*(?:abstract|sealed|static)?\s*class\s+(\w+)/);
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
        const interfaceMatch = line.match(/(?:public|private|protected|internal)?\s*interface\s+(\w+)/);
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
     * 解析命名空间
     */
    private parseNamespace(line: string, lineNum: number, lines: string[]): CodeElement | null {
        const namespaceMatch = line.match(/namespace\s+([\w.]+)/);
        if (namespaceMatch) {
            return this.createElement(
                namespaceMatch[1],
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
        const enumMatch = line.match(/(?:public|private|protected|internal)?\s*enum\s+(\w+)/);
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

    /**
     * 解析构造方法
     */
    private parseConstructor(line: string, lineNum: number, lines: string[], className: string): CodeElement | null {
        // 排除属性（属性有大括号在同一行）
        if (line.includes('{') && (line.includes('get') || line.includes('set'))) {
            return null;
        }
        
        // 构造方法没有返回类型，方法名与类名相同
        // 支持：public ClassName(...) 或 private ClassName(...) 或 ClassName(...) 或 static ClassName(...)
        
        // 模式1：static 构造函数：static ClassName(...)
        let constructorMatch = line.match(/static\s+(?:public|private|protected|internal)?\s*(\w+)\s*\(([^)]*)\)/);
        
        // 模式2：有访问修饰符的构造函数：public ClassName(...) 或 private ClassName(...)
        if (!constructorMatch) {
            constructorMatch = line.match(/(?:public|private|protected|internal)\s*(\w+)\s*\(([^)]*)\)/);
        }
        
        // 模式3：没有访问修饰符的构造函数：ClassName(...)
        if (!constructorMatch) {
            constructorMatch = line.match(/^\s*(\w+)\s*\(([^)]*)\)/);
        }
        
        if (constructorMatch) {
            const methodName = constructorMatch[1];
            const parameters = constructorMatch[2] || '';
            
            // 检查方法名是否与类名相同（构造方法的特征）
            if (methodName === className) {
                return this.createElement(
                    methodName,
                    CodeElementType.Constructor,
                    lineNum,
                    line,
                    lines,
                    undefined,
                    parameters
                );
            }
        }
        
        return null;
    }

    /**
     * 解析方法
     */
    private parseMethod(line: string, lineNum: number, lines: string[], className: string): CodeElement | null {
        // 排除属性（属性有大括号在同一行）
        if (line.includes('{') && (line.includes('get') || line.includes('set'))) {
            return null;
        }
        
        // 匹配方法定义：可选的访问修饰符 + 可选的 static/async/virtual/override/abstract + 返回类型 + 方法名 + 参数
        // 必须至少包含访问修饰符或 static，确保是类的方法成员
        // 支持：public static void Method() 或 static void Method() 或 public void Method()
        // 模式1：static 在访问修饰符之前：static public void Method() 或 static void Method()
        let methodMatch = line.match(/static\s+(?:public|private|protected|internal)?\s*(?:async|virtual|override|abstract)?\s*([\w<>,\s.]+?)\s+(\w+)\s*\(([^)]*)\)/);
        
        // 模式2：访问修饰符在 static 之前：public static void Method() 或 public void Method()
        if (!methodMatch) {
            methodMatch = line.match(/(?:public|private|protected|internal)\s*(?:static|async|virtual|override|abstract)?\s*([\w<>,\s.]+?)\s+(\w+)\s*\(([^)]*)\)/);
        }
        
        // 模式3：只有 static，没有访问修饰符：static void Method()
        if (!methodMatch) {
            methodMatch = line.match(/static\s+([\w<>,\s.]+?)\s+(\w+)\s*\(([^)]*)\)/);
        }
        
        if (methodMatch) {
            const returnType = methodMatch[1].trim();
            const methodName = methodMatch[2];
            const parameters = methodMatch[3] || '';
            
            // 排除构造函数：如果方法名与类名相同，且返回类型也与类名相同，可能是构造函数
            // 但构造方法应该已经在 parseConstructor 中处理了，这里只处理有返回类型的情况
            // 如果返回类型与方法名相同，且方法名也与类名相同，可能是构造函数（虽然这种情况不常见）
            if (returnType === methodName && methodName === className) {
                return this.createElement(
                    methodName,
                    CodeElementType.Constructor,
                    lineNum,
                    line,
                    lines,
                    undefined,
                    parameters
                );
            }
            
            // 普通方法
            return this.createElement(
                methodName,
                CodeElementType.Method,
                lineNum,
                line,
                lines,
                returnType,
                parameters
            );
        }
        return null;
    }

    /**
     * 解析属性
     */
    private parseProperty(line: string, lineNum: number, lines: string[]): CodeElement | null {
        // 匹配属性定义：可选的访问修饰符 + 可选的 static/virtual/override + 类型 + 属性名 { get; set; }
        // 必须至少包含访问修饰符或 static，确保是类的属性成员
        // 支持：public static string Property { get; set; } 或 static string Property { get; set; } 或 public string Property { get; set; }
        // 模式1：static 在访问修饰符之前：static public string Property { get; set; } 或 static string Property { get; set; }
        let propertyMatch = line.match(/static\s+(?:public|private|protected|internal)?\s*(?:virtual|override)?\s*(\w+(?:<[^>]+>)?)\s+(\w+)\s*\{/);
        
        // 模式2：访问修饰符在 static 之前：public static string Property { get; set; } 或 public string Property { get; set; }
        if (!propertyMatch) {
            propertyMatch = line.match(/(?:public|private|protected|internal)\s*(?:static|virtual|override)?\s*(\w+(?:<[^>]+>)?)\s+(\w+)\s*\{/);
        }
        
        // 模式3：只有 static，没有访问修饰符：static string Property { get; set; }
        if (!propertyMatch) {
            propertyMatch = line.match(/static\s+(\w+(?:<[^>]+>)?)\s+(\w+)\s*\{/);
        }
        
        if (propertyMatch) {
            return this.createElement(
                propertyMatch[2],
                CodeElementType.Property,
                lineNum,
                line,
                lines,
                propertyMatch[1]
            );
        }
        return null;
    }

    /**
     * 解析字段/变量（类成员，不包括方法内部的局部变量）
     */
    private parseField(line: string, lineNum: number, lines: string[]): CodeElement | null {
        // 排除方法（方法有括号）和属性（属性有大括号）
        if (line.includes('(') || (line.includes('{') && !line.includes('get') && !line.includes('set'))) {
            return null;
        }
        
        // 必须至少包含访问修饰符或 static/readonly/const，确保是类的成员字段
        // 支持：public static int Field; 或 static int Field; 或 public int Field;
        if (!line.match(/^\s*(?:public|private|protected|internal|static|readonly|const)/)) {
            return null;
        }
        
        // 匹配：可选的访问修饰符 + 可选的 static/readonly/const + 类型 + 字段名
        // 模式1：static/readonly/const 在访问修饰符之前：static public int Field; 或 static int Field;
        let fieldMatch = line.match(/(?:static|readonly|const)\s+(?:public|private|protected|internal)?\s*(\w+(?:<[^>]+>)?)\s+(\w+)(?:\s*[=;])/);
        
        // 模式2：访问修饰符在 static/readonly/const 之前：public static int Field; 或 public int Field;
        if (!fieldMatch) {
            fieldMatch = line.match(/(?:public|private|protected|internal)\s*(?:static|readonly|const)?\s*(\w+(?:<[^>]+>)?)\s+(\w+)(?:\s*[=;])/);
        }
        
        // 模式3：只有 static/readonly/const，没有访问修饰符：static int Field;
        if (!fieldMatch) {
            fieldMatch = line.match(/(?:static|readonly|const)\s+(\w+(?:<[^>]+>)?)\s+(\w+)(?:\s*[=;])/);
        }
        
        if (fieldMatch) {
            return this.createElement(
                fieldMatch[2],
                CodeElementType.Field,
                lineNum,
                line,
                lines,
                fieldMatch[1]
            );
        }
        return null;
    }
}
