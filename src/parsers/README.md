# 文件解析器架构说明

## 设计模式

本模块使用**策略模式（Strategy Pattern）**和**工厂模式（Factory Pattern）**来实现文件解析功能。

## 架构结构

```
parsers/
├── IParser.ts              # 解析器接口
├── BaseParser.ts           # 基础解析器抽象类（提供通用方法）
├── ParserFactory.ts        # 解析器工厂类
├── CSharpParser.ts         # C# 文件解析器
├── JavaParser.ts           # Java 文件解析器
├── JavaScriptParser.ts      # JavaScript/TypeScript 文件解析器
├── VueParser.ts            # Vue 文件解析器
└── HtmlParser.ts           # HTML 文件解析器
```

## 核心组件

### 1. IParser 接口
定义了解析器的基本契约：
- `parse(document, lines)`: 解析文件内容，返回代码元素数组

### 2. BaseParser 抽象类
提供所有解析器共用的功能：
- `extractAccessModifier()`: 提取访问修饰符
- `extractComment()`: 提取注释
- `createElement()`: 创建代码元素

### 3. ParserFactory 工厂类
负责创建和管理解析器：
- `createParser(filePath)`: 根据文件扩展名创建对应的解析器
- `registerParser(extension, ParserClass)`: 注册新的解析器
- `isSupported(filePath)`: 检查是否支持该文件类型
- `getSupportedExtensions()`: 获取所有支持的文件扩展名

### 4. 具体解析器类
每种文件类型都有对应的解析器：
- **CSharpParser**: 解析 C# 文件（类、接口、命名空间、枚举）
- **JavaParser**: 解析 Java 文件（类、接口、包、枚举）
- **JavaScriptParser**: 解析 JavaScript/TypeScript 文件（类、函数、接口）
- **VueParser**: 解析 Vue 文件（提取 script 标签内容）
- **HtmlParser**: 解析 HTML 文件（script 标签、主要元素）

## 使用方式

### 基本使用

```typescript
import { ParserFactory } from './parsers/ParserFactory';

// 创建解析器
const parser = ParserFactory.createParser('/path/to/file.cs');

if (parser) {
    // 解析文件
    const elements = await parser.parse(document, lines);
}
```

### 扩展新的文件类型

1. 创建新的解析器类，实现 `IParser` 接口或继承 `BaseParser`：

```typescript
import { BaseParser } from './BaseParser';
import { CodeElement, CodeElementType } from '../fileStructureParser';

export class PythonParser extends BaseParser {
    async parse(document: vscode.TextDocument, lines: string[]): Promise<CodeElement[]> {
        const elements: CodeElement[] = [];
        // 实现解析逻辑
        return elements;
    }
}
```

2. 在 `ParserFactory` 中注册新解析器：

```typescript
import { PythonParser } from './PythonParser';

ParserFactory.registerParser('.py', PythonParser);
```

或者在 `ParserFactory` 的构造函数中直接添加：

```typescript
private static parsers: Map<string, new () => IParser> = new Map([
    // ... 现有解析器
    ['.py', PythonParser]
]);
```

## 优势

1. **易于扩展**: 添加新文件类型只需创建新的解析器类并注册
2. **代码复用**: 通用功能在 `BaseParser` 中实现，避免重复代码
3. **职责分离**: 每种文件类型有独立的解析逻辑，互不干扰
4. **类型安全**: 使用 TypeScript 接口确保类型安全
5. **符合开闭原则**: 对扩展开放，对修改关闭

## 扩展示例

### 添加 Python 解析器

```typescript
// src/parsers/PythonParser.ts
import * as vscode from 'vscode';
import { CodeElement, CodeElementType } from '../fileStructureParser';
import { BaseParser } from './BaseParser';

export class PythonParser extends BaseParser {
    async parse(document: vscode.TextDocument, lines: string[]): Promise<CodeElement[]> {
        const elements: CodeElement[] = [];
        let lineNum = 0;

        for (const line of lines) {
            lineNum++;
            const trimmedLine = line.trim();
            
            // 跳过空行和注释
            if (!trimmedLine || trimmedLine.startsWith('#') || trimmedLine.startsWith('"""')) {
                continue;
            }
            
            // 解析类定义
            const classMatch = trimmedLine.match(/class\s+(\w+)/);
            if (classMatch) {
                elements.push(this.createElement(
                    classMatch[1],
                    CodeElementType.Class,
                    lineNum,
                    trimmedLine,
                    lines
                ));
            }
            
            // 解析函数定义
            const functionMatch = trimmedLine.match(/def\s+(\w+)\s*\(/);
            if (functionMatch) {
                elements.push(this.createElement(
                    functionMatch[1],
                    CodeElementType.Function,
                    lineNum,
                    trimmedLine,
                    lines
                ));
            }
        }

        return elements;
    }
}
```

然后在 `ParserFactory.ts` 中注册：

```typescript
import { PythonParser } from './PythonParser';

private static parsers: Map<string, new () => IParser> = new Map([
    // ... 现有解析器
    ['.py', PythonParser]
]);
```

## 注意事项

1. 所有解析器都应该继承 `BaseParser` 以复用通用功能
2. 解析器应该处理空行、注释等边界情况
3. 解析器应该返回有效的 `CodeElement` 数组
4. 如果解析失败，应该返回空数组而不是抛出异常

