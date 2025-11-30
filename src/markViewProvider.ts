import * as vscode from 'vscode';
import { CodeStructViewProvider } from './codeStructViewProvider';
import { CodeElement, CodeElementType } from './fileStructureParser';
import { TagRuleConfig, TagRule } from './tagRuleConfig';

/**
 * 标记节点类型
 */
type MarkNode = MarkItem | ClassGroupItem;

/**
 * 标记项（显示有标记的方法）
 */
class MarkItem extends vscode.TreeItem {
    constructor(
        public readonly methodName: string,
        public readonly methodComment: string,
        public readonly markColor: string,
        public readonly markEmoji: string,
        public readonly fileUri: vscode.Uri,
        public readonly line: number,
        public readonly className: string,
        public readonly tagRule?: TagRule
    ) {
        // 标签格式：标记emoji + 方法注释（应用样式）
        let labelText = methodComment || methodName;
        
        // 应用文字样式标记（VS Code TreeView 对样式支持有限，我们通过文本标记来表示）
        if (tagRule) {
            const styleMarkers: string[] = [];
            if (tagRule.bold) styleMarkers.push('B');
            if (tagRule.italic) styleMarkers.push('I');
            if (tagRule.strikethrough) styleMarkers.push('S');
            if (tagRule.underline) styleMarkers.push('U');
            
            if (styleMarkers.length > 0) {
                labelText = `${labelText} [${styleMarkers.join(',')}]`;
            }
        }
        
        const label = `${markEmoji} ${labelText}`;
        super(label, vscode.TreeItemCollapsibleState.None);
        
        let tooltipText = `${className}.${methodName}\n行 ${line}\n标记: ${markColor}`;
        if (tagRule) {
            tooltipText += `\n标签: ${tagRule.tag}`;
            const styles: string[] = [];
            if (tagRule.bold) styles.push('粗体');
            if (tagRule.italic) styles.push('斜体');
            if (tagRule.strikethrough) styles.push('删除线');
            if (tagRule.underline) styles.push('下划线');
            if (styles.length > 0) {
                tooltipText += `\n样式: ${styles.join(', ')}`;
            }
        }
        this.tooltip = tooltipText;
        this.description = `${className}.${methodName}`;
        this.contextValue = 'markedMethod';
        
        // 点击跳转到对应的方法
        this.command = {
            command: 'vscode.open',
            title: '跳转到方法',
            arguments: [
                fileUri,
                { selection: new vscode.Range(line - 1, 0, line - 1, 0) }
            ]
        };
    }
}

/**
 * 类分组项（按类分组显示标记的方法）
 */
class ClassGroupItem extends vscode.TreeItem {
    constructor(
        public readonly className: string,
        public readonly fileUri: vscode.Uri,
        public readonly children: MarkItem[]
    ) {
        super(className, vscode.TreeItemCollapsibleState.Expanded);
        this.tooltip = `类 ${className} 中有 ${children.length} 个标记的方法`;
        this.contextValue = 'classGroup';
    }
}

/**
 * 标记视图提供者
 * 显示所有有标记的方法
 */
export class MarkViewProvider implements vscode.TreeDataProvider<MarkNode> {
    private _onDidChangeTreeData: vscode.EventEmitter<MarkNode | undefined | null | void> = new vscode.EventEmitter<MarkNode | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<MarkNode | undefined | null | void> = this._onDidChangeTreeData.event;

    // 代码结构视图提供者引用（用于访问标记数据）
    private structProvider: CodeStructViewProvider | undefined;

    constructor() {
        // 标记视图提供者需要访问结构视图提供者来获取标记信息
    }

    /**
     * 设置结构视图提供者引用
     */
    setStructProvider(provider: CodeStructViewProvider): void {
        this.structProvider = provider;
    }

    /**
     * 刷新标记视图
     */
    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    /**
     * 获取树节点
     */
    getTreeItem(element: MarkNode): vscode.TreeItem {
        return element;
    }

    /**
     * 获取父节点
     */
    getParent(element: MarkNode): Thenable<MarkNode | undefined> {
        // 标记项没有父节点（或者可以按类分组）
        return Promise.resolve(undefined);
    }

    /**
     * 获取子节点
     */
    async getChildren(element?: MarkNode): Promise<MarkNode[]> {
        if (!this.structProvider) {
            return [];
        }

        // 如果没有传入元素，返回根节点（按类分组的有标记方法）
        if (!element) {
            return this.getAllMarkedMethods();
        }

        // 如果是类分组项，返回该类的标记方法
        if (element instanceof ClassGroupItem) {
            return element.children;
        }

        return [];
    }

    /**
     * 获取所有有标记的方法
     */
    private async getAllMarkedMethods(): Promise<MarkNode[]> {
        if (!this.structProvider) {
            console.log('[getAllMarkedMethods] 结构提供者未设置');
            return [];
        }

        console.log('[getAllMarkedMethods] 开始获取所有标记的方法');

        // 获取所有标记的节点
        const markedNodes = await this.getMarkedNodes();
        
        console.log(`[getAllMarkedMethods] 获取到 ${markedNodes.length} 个标记节点`);
        
        if (markedNodes.length === 0) {
            return [];
        }

        // 按类和文件分组
        const classGroups = new Map<string, {
            className: string;
            fileUri: vscode.Uri;
            methods: Array<{
                name: string;
                comment: string;
                color: string;
                emoji: string;
                line: number;
                tagRule?: TagRule;
            }>;
        }>();

        for (const { nodeUri, color, element, fileUri, className } of markedNodes) {
            // 只显示方法类型的标记节点
            if (element.type !== CodeElementType.Method && 
                element.type !== CodeElementType.Function &&
                element.type !== CodeElementType.Constructor) {
                continue;
            }

            // 查找所属的类
            const finalClassName = className || await this.findClassName(element, fileUri) || '未知类';
            
            // 获取方法注释（优先使用comment，如果没有则使用name）
            let methodComment = element.comment || element.name;
            // 清理注释内容（移除多余的符号）
            if (methodComment) {
                methodComment = methodComment.trim();
                // 移除可能的标签前缀，如"方法描述:"等
                methodComment = methodComment.replace(/^(方法描述|方法注释|描述|注释)[:：]\s*/i, '');
            }
            
            // 检查是否有匹配的标签规则
            const tagRule = TagRuleConfig.matchTagRule(element.comment);
            
            // 获取颜色对应的emoji
            const emoji = this.getColorEmoji(color);

            const groupKey = `${fileUri.toString()}#${finalClassName}`;
            if (!classGroups.has(groupKey)) {
                classGroups.set(groupKey, {
                    className: finalClassName,
                    fileUri: fileUri,
                    methods: []
                });
            }

            const group = classGroups.get(groupKey)!;
            group.methods.push({
                name: element.name,
                comment: methodComment,
                color: color,
                emoji: emoji,
                line: element.line,
                tagRule: tagRule
            });
        }

        // 转换为类分组项
        const result: MarkNode[] = [];
        for (const group of classGroups.values()) {
            const markItems = group.methods.map(m => 
                new MarkItem(m.name, m.comment, m.color, m.emoji, group.fileUri, m.line, group.className, m.tagRule)
            );
            result.push(new ClassGroupItem(group.className, group.fileUri, markItems));
        }

        console.log(`[getAllMarkedMethods] 返回 ${result.length} 个类分组，共 ${markedNodes.length} 个标记方法`);
        return result;
    }

    /**
     * 获取所有标记的节点信息
     */
    private async getMarkedNodes(): Promise<Array<{ nodeUri: vscode.Uri; color: string; element: CodeElement; fileUri: vscode.Uri; className?: string }>> {
        if (!this.structProvider) {
            return [];
        }

        // 使用 CodeStructViewProvider 的公共方法获取所有标记节点
        return await this.structProvider.getAllMarkedNodes();
    }

    /**
     * 查找方法所属的类名
     */
    private async findClassName(element: CodeElement, fileUri: vscode.Uri, className?: string): Promise<string> {
        // 如果已经提供了类名，直接返回
        if (className) {
            return className;
        }
        
        // 否则尝试从结构提供者查找
        if (!this.structProvider) {
            return '未知类';
        }

        // 通过解析文件结构来查找类名
        try {
            const elements = await this.structProvider.getFileStructure(fileUri);
            return await this.structProvider.findClassNameForElement(element, fileUri, elements) || '未知类';
        } catch (error) {
            console.error('[findClassName] 查找类名失败:', error);
            return '未知类';
        }
    }

    /**
     * 根据颜色值获取对应的emoji
     */
    private getColorEmoji(color: string): string {
        const colors = CodeStructViewProvider.COLORS;
        // 标准化颜色值（转为小写）
        const normalizedColor = color.trim().toLowerCase();
        
        if (normalizedColor === colors.RED.value.toLowerCase()) return colors.RED.emoji;
        if (normalizedColor === colors.GREEN.value.toLowerCase()) return colors.GREEN.emoji;
        if (normalizedColor === colors.YELLOW.value.toLowerCase()) return colors.YELLOW.emoji;
        if (normalizedColor === colors.BLUE.value.toLowerCase()) return colors.BLUE.emoji;
        if (normalizedColor === colors.PURPLE.value.toLowerCase()) return colors.PURPLE.emoji;
        
        // 对于自定义颜色，根据颜色的RGB值选择合适的标记
        const colorInfo = this.parseColor(color);
        if (colorInfo) {
            return this.getEmojiByColorInfo(colorInfo.r, colorInfo.g, colorInfo.b);
        }
        
        return '🔖';
    }

    /**
     * 解析颜色值
     */
    private parseColor(color: string): { r: number; g: number; b: number } | undefined {
        if (!color.startsWith('#')) {
            return undefined;
        }
        
        const hex = color.substring(1).toLowerCase();
        if (hex.length === 6) {
            const r = parseInt(hex.substring(0, 2), 16);
            const g = parseInt(hex.substring(2, 4), 16);
            const b = parseInt(hex.substring(4, 6), 16);
            return { r, g, b };
        } else if (hex.length === 3) {
            const r = parseInt(hex[0] + hex[0], 16);
            const g = parseInt(hex[1] + hex[1], 16);
            const b = parseInt(hex[2] + hex[2], 16);
            return { r, g, b };
        }
        
        return undefined;
    }

    /**
     * 根据RGB值获取对应的emoji
     */
    private getEmojiByColorInfo(r: number, g: number, b: number): string {
        const colors = CodeStructViewProvider.COLORS;
        
        // 判断颜色类型
        // 红色系：R 最高，G 和 B 较低
        if (r > 200 && g < 100 && b < 100) {
            // 橙红色范围：R 高，G 中等（45-150），B 低
            if (g >= 45 && g <= 150) {
                return '🟠'; // 橙色（最接近 #FF2D00）
            }
            return colors.RED.emoji; // 纯红色
        }
        // 绿色系
        if (g > 200 && r < 100 && b < 100) {
            return colors.GREEN.emoji;
        }
        // 黄色系：R 和 G 都高，B 低
        if (r > 200 && g > 200 && b < 100) {
            return colors.YELLOW.emoji;
        }
        // 蓝色系
        if (b > 200 && r < 100 && g < 100) {
            return colors.BLUE.emoji;
        }
        // 紫色系：R 和 B 都中等，G 低
        if (r > 100 && b > 100 && g < 100) {
            return colors.PURPLE.emoji;
        }
        
        // 对于其他颜色，使用通用的标记
        return '🔖';
    }
}

