import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { FileStructureParser, CodeElement, CodeElementType, AccessModifier } from './fileStructureParser';
import { IconManager } from './iconManager';
import { TreeNodeDecorator, NodeDecorationRule } from './treeNodeDecorator';
import { TagRuleConfig, TagRule } from './tagRuleConfig';

/**
 * 树节点类型（文件/目录/代码元素）
 */
type TreeNode = FileItem | CodeElementItem;

/**
 * 文件树节点
 */
class FileItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly resourceUri?: vscode.Uri,
        public readonly isDirectory: boolean = false,
        public readonly isParsableFile: boolean = false
    ) {
        super(label, collapsibleState);
        
        // 设置资源 URI，VSCode 会自动根据文件类型显示对应的图标
        if (resourceUri) {
            this.resourceUri = resourceUri;
            this.tooltip = resourceUri.fsPath;
        }

        // 如果是目录，设置上下文值
        if (isDirectory) {
            this.contextValue = 'directory';
        } else if (isParsableFile) {
            // 可解析的文件，设置为可展开
            this.contextValue = 'parsableFile';
            // 如果文件可解析，设置为可折叠状态（懒加载）
            if (this.collapsibleState === vscode.TreeItemCollapsibleState.None) {
                this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
            }
            // 重要：对于可折叠的文件，VSCode 可能会显示文件夹图标
            // 我们需要显式设置文件图标，使用图标管理器获取对应的图标
            if (resourceUri) {
                // 使用图标管理器获取对应的图标路径
                const iconPath = IconManager.getIconPath(resourceUri);
                if (iconPath) {
                    this.iconPath = iconPath;
                } else {
                    // 如果获取失败，使用默认图标
                    this.iconPath = new vscode.ThemeIcon('file-code');
                }
            }
            // 双击打开文件命令
            if (resourceUri) {
                this.command = {
                    command: 'vscode.open',
                    title: '打开文件',
                    arguments: [resourceUri]
                };
            }
        } else {
            this.contextValue = 'file';
        }

        // 文件点击命令（普通文件直接打开）
        if (resourceUri && !isDirectory && !isParsableFile) {
            this.command = {
                command: 'vscode.open',
                title: '打开文件',
                arguments: [resourceUri]
            };
        }
    }
}

/**
 * 代码元素树节点
 */
class CodeElementItem extends vscode.TreeItem {
    // 节点唯一标识URI（用于装饰器识别）
    public readonly nodeUri: vscode.Uri;
    // 装饰颜色（可变）
    private _decorationColor?: string;
    // 标签规则（用于文字样式）
    private _tagRule?: TagRule;

    constructor(
        public readonly codeElement: CodeElement,
        public readonly fileUri: vscode.Uri,
        decorationColor?: string,
        tagRule?: TagRule
    ) {
        const label = CodeStructViewProvider.formatCodeElementLabel(codeElement);
        const hasChildren = codeElement.children && codeElement.children.length > 0;
        
        console.log(`[CodeElementItem] 创建节点: ${codeElement.name}, 类型: ${codeElement.type}, 子节点数: ${codeElement.children?.length || 0}`);
        console.log(`[CodeElementItem] 节点注释: "${codeElement.comment}"`);
        console.log(`[CodeElementItem] 格式化后的标签: "${label}"`);
        if (hasChildren) {
            console.log(`[CodeElementItem] 子节点列表:`, codeElement.children?.map(c => `${c.name} (${c.type}, comment="${c.comment}")`).join(', '));
        }
        
        super(
            label,
            hasChildren ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
        );

        // 创建唯一标识URI（用于装饰器）
        const uniqueId = `${fileUri.toString()}#${codeElement.type}#${codeElement.name}#${codeElement.line}`;
        this.nodeUri = vscode.Uri.parse(`codestructview://node/${encodeURIComponent(uniqueId)}`);

        // 设置图标
        this.iconPath = CodeStructViewProvider.getIconForElementType(codeElement.type);
        
        // 设置工具提示
        this.tooltip = this.buildTooltip();
        
        // 设置标签规则（用于文字样式）
        if (tagRule) {
            this._tagRule = tagRule;
        }

        // 设置初始装饰颜色
        if (decorationColor) {
            this.updateDecorationColor(decorationColor);
        } else {
            // 设置描述（显示行号）
            this.description = `行 ${codeElement.line}`;
        }

        // 应用文字样式
        this.applyTextStyles();
        
        // 设置上下文值（用于右键菜单等）
        // 对于方法类型的节点，使用特殊的contextValue以便菜单只在方法上显示
        if (codeElement.type === CodeElementType.Method || 
            codeElement.type === CodeElementType.Function || 
            codeElement.type === CodeElementType.Constructor) {
            this.contextValue = 'codeElement.method';
        } else {
            this.contextValue = 'codeElement';
        }
        console.log(`[CodeElementItem] 设置 contextValue: ${this.contextValue}, 节点: ${codeElement.name}, 类型: ${codeElement.type}`);
        
        // 点击跳转到对应位置
        this.command = {
            command: 'vscode.open',
            title: '跳转到定义',
            arguments: [
                fileUri,
                { selection: new vscode.Range(codeElement.line - 1, 0, codeElement.line - 1, 0) }
            ]
        };
    }

    /**
     * 获取装饰颜色
     */
    get decorationColor(): string | undefined {
        return this._decorationColor;
    }

    /**
     * 更新装饰颜色
     */
    updateDecorationColor(color: string): void {
        console.log(`[updateDecorationColor] 更新节点 ${this.codeElement.name} 的装饰颜色为: ${color}`);
        this._decorationColor = color;
        // 使用resourceUri以便装饰器可以识别
        this.resourceUri = this.nodeUri;
        
        // 根据颜色选择对应的emoji标记
        const colorEmoji = this.getColorEmoji(color);
        
        // 将标记添加到标签前面（如果还没有添加）
        const currentLabel = typeof this.label === 'string' ? this.label : this.label?.label || '';
        const originalLabel = this.getOriginalLabel(currentLabel);
        
        // 应用文字样式（如果有标签规则）
        this.applyTextStyles();
        
        // 构建标签文本
        let labelText = originalLabel;
        if (this._tagRule) {
            // 如果有标签规则，使用TreeItemLabel以支持样式
            const label: vscode.TreeItemLabel = {
                label: labelText,
                highlights: undefined
            };
            
            // 应用样式标记（使用Markdown语法标记，虽然TreeView可能不完全支持，但至少可以尝试）
            if (this._tagRule.bold) {
                labelText = `**${labelText}**`;
            }
            if (this._tagRule.italic) {
                labelText = `*${labelText}*`;
            }
            // 注意：删除线和下划线在TreeView中不支持，但我们可以通过其他方式标记
            
            this.label = {
                label: `${colorEmoji} ${labelText}`,
                highlights: undefined
            };
        } else {
            this.label = `${colorEmoji} ${labelText}`;
        }
        
        console.log(`[updateDecorationColor] 标签更新为: "${typeof this.label === 'string' ? this.label : this.label.label}"`);
        
        // 描述只显示行号
        this.description = `行 ${this.codeElement.line}`;
    }

    /**
     * 应用文字样式
     */
    applyTextStyles(): void {
        if (!this._tagRule) {
            return;
        }

        const currentLabel = typeof this.label === 'string' ? this.label : this.label?.label || '';
        const originalLabel = this.getOriginalLabel(currentLabel);
        let styledLabel = originalLabel;

        // VS Code TreeView 的 label 支持 TreeItemLabel，但样式有限
        // 我们通过构建一个带有样式标记的标签文本
        // 注意：TreeView 对样式的支持有限，主要是通过 highlights 属性高亮部分文本
        
        // 由于 TreeView 的限制，我们主要通过视觉标记（emoji、颜色）来区分
        // 文字样式（粗体、斜体、删除线、下划线）在 TreeView 中不完全支持
        // 但我们可以尝试通过 TreeItemLabel 设置 highlights 来部分实现
        
        const labelObj: vscode.TreeItemLabel = {
            label: styledLabel,
            highlights: undefined
        };

        // 如果启用了粗体或斜体，可以通过 highlights 标记（但效果有限）
        if (this._tagRule.bold || this._tagRule.italic || this._tagRule.strikethrough || this._tagRule.underline) {
            // 创建带样式标记的标签
            // 由于 VS Code TreeView 不支持完整的 Markdown 样式，我们通过其他方式标记
            // 例如：在标签后添加样式指示符
            const styleMarkers: string[] = [];
            if (this._tagRule.bold) styleMarkers.push('B');
            if (this._tagRule.italic) styleMarkers.push('I');
            if (this._tagRule.strikethrough) styleMarkers.push('S');
            if (this._tagRule.underline) styleMarkers.push('U');
            
            if (styleMarkers.length > 0) {
                // 在标签后添加样式标记（用小括号）
                styledLabel = `${originalLabel} [${styleMarkers.join(',')}]`;
            }
            
            labelObj.label = styledLabel;
        }

        // 更新标签（如果有颜色标记，会在 updateDecorationColor 中处理）
        if (!this._decorationColor) {
            this.label = labelObj;
        }
    }

    /**
     * 设置标签规则
     */
    setTagRule(tagRule: TagRule): void {
        this._tagRule = tagRule;
        this.applyTextStyles();
    }

    /**
     * 获取标签规则
     */
    get tagRule(): TagRule | undefined {
        return this._tagRule;
    }

    /**
     * 获取原始标签（不包含标记）
     */
    private getOriginalLabel(currentLabel: string): string {
        // 移除可能存在的标记emoji
        const colors = CodeStructViewProvider.COLORS;
        let label = currentLabel;
        const emojis = [
            colors.RED.emoji,
            colors.GREEN.emoji,
            colors.YELLOW.emoji,
            colors.BLUE.emoji,
            colors.PURPLE.emoji,
            '🔖'
        ];
        
        for (const emoji of emojis) {
            if (label.startsWith(emoji + ' ')) {
                label = label.substring(emoji.length + 1);
                break;
            } else if (label.startsWith(emoji)) {
                label = label.substring(emoji.length);
                break;
            }
        }
        
        return label;
    }

    /**
     * 根据颜色值获取对应的emoji
     */
    private getColorEmoji(color: string): string {
        const colors = CodeStructViewProvider.COLORS;
        // 标准化颜色值（转为小写并去除空格）
        const normalizedColor = color.trim().toLowerCase();
        
        // 检查预定义颜色（支持大小写不敏感匹配）
        if (normalizedColor === colors.RED.value.toLowerCase()) return colors.RED.emoji;
        if (normalizedColor === colors.GREEN.value.toLowerCase()) return colors.GREEN.emoji;
        if (normalizedColor === colors.YELLOW.value.toLowerCase()) return colors.YELLOW.emoji;
        if (normalizedColor === colors.BLUE.value.toLowerCase()) return colors.BLUE.emoji;
        if (normalizedColor === colors.PURPLE.value.toLowerCase()) return colors.PURPLE.emoji;
        
        // 对于自定义颜色，根据颜色的RGB值选择合适的标记
        // 解析颜色值并判断色系
        const colorInfo = this.parseColor(color);
        if (colorInfo) {
            return this.getEmojiByColorInfo(colorInfo.r, colorInfo.g, colorInfo.b);
        }
        
        // 如果无法解析，使用默认标记
        return '🔖'; // 默认标记
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


    /**
     * 构建工具提示
     */
    private buildTooltip(): string {
        let tooltip = this.codeElement.name;
        
        if (this.codeElement.accessModifier !== AccessModifier.Default) {
            tooltip = `${this.codeElement.accessModifier} ${tooltip}`;
        }
        
        if (this.codeElement.returnType) {
            tooltip += `: ${this.codeElement.returnType}`;
        }
        
        if (this.codeElement.parameters) {
            tooltip += `(${this.codeElement.parameters})`;
        }
        
        // 对于方法，显示完整的注释信息
        if (this.codeElement.type === CodeElementType.Method || this.codeElement.type === CodeElementType.Function || this.codeElement.type === CodeElementType.Constructor) {
            if (this.codeElement.comment) {
                tooltip += `\n\n方法描述: ${this.codeElement.comment}`;
            }
            if (this.codeElement.params && this.codeElement.params.length > 0) {
                tooltip += `\n\n方法参数:`;
                this.codeElement.params.forEach(param => {
                    tooltip += `\n  ${param.name}: ${param.description}`;
                });
            }
            if (this.codeElement.returns) {
                tooltip += `\n\n方法返回: ${this.codeElement.returns}`;
            }
        } else {
            // 其他元素显示注释
            if (this.codeElement.comment) {
                tooltip += `\n\n${this.codeElement.comment}`;
            }
        }
        
        return tooltip;
    }
}

/**
 * 代码结构视图提供者
 */
export class CodeStructViewProvider implements vscode.TreeDataProvider<TreeNode> {
    private _onDidChangeTreeData: vscode.EventEmitter<TreeNode | undefined | null | void> = new vscode.EventEmitter<TreeNode | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<TreeNode | undefined | null | void> = this._onDidChangeTreeData.event;
    
    private panel: vscode.WebviewPanel | undefined;
    private workspaceRoot: string | undefined;
    private treeView: vscode.TreeView<TreeNode> | undefined;
    
    // 缓存已解析的文件结构
    private fileStructureCache: Map<string, CodeElement[]> = new Map();
    
    // 文件路径到节点的映射（用于快速定位）
    private filePathToNodeMap: Map<string, FileItem> = new Map();

    // 自动标记缓存（基于标签规则的标记）
    private autoMarkedNodesCache: Map<string, Array<{ nodeUri: vscode.Uri; color: string; element: CodeElement; fileUri: vscode.Uri; className?: string }>> = new Map();
    
    // 文件修改时间缓存（用于判断文件是否变化）
    private fileMTimeCache: Map<string, number> = new Map();

    // 支持的文件扩展名
    private readonly supportedExtensions = ['.cs', '.java', '.js', '.ts', '.vue', '.html'];

    // 节点装饰器
    private nodeDecorator: TreeNodeDecorator | undefined;

    // 节点标记存储（节点URI到颜色的映射）
    private nodeMarks: Map<string, string> = new Map();

    // 节点标记详细信息存储（节点URI到标记信息的映射）
    private nodeMarkDetails: Map<string, { color: string; element: CodeElement; fileUri: vscode.Uri; className?: string }> = new Map();

    // 扩展上下文（用于持久化存储）
    private context: vscode.ExtensionContext | undefined;

    // 颜色常量定义
    static readonly COLORS = {
        RED: { name: 'red', value: '#ff0000', emoji: '🔴' },
        GREEN: { name: 'green', value: '#00ff00', emoji: '🟢' },
        YELLOW: { name: 'yellow', value: '#ffff00', emoji: '🟡' },
        BLUE: { name: 'blue', value: '#0000ff', emoji: '🔵' },
        PURPLE: { name: 'purple', value: '#800080', emoji: '🟣' }
    };

    constructor(private readonly extensionUri: vscode.Uri, context?: vscode.ExtensionContext) {
        // 初始化图标管理器
        IconManager.initialize(extensionUri);
        
        // 保存上下文引用
        this.context = context;

        // 获取工作区根目录
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            this.workspaceRoot = workspaceFolders[0].uri.fsPath;
        }

        // 初始化装饰器
        this.nodeDecorator = new TreeNodeDecorator();
        
        // 从持久化存储中加载节点标记（同步加载）
        this.loadNodeMarks();
        
        // 监听工作区文件夹变化，重新加载标记（切换项目时）
        vscode.workspace.onDidChangeWorkspaceFolders(() => {
            // 更新工作区根目录
            const folders = vscode.workspace.workspaceFolders;
            if (folders && folders.length > 0) {
                this.workspaceRoot = folders[0].uri.fsPath;
            }
            // 重新加载该工作区的标记
            this.loadNodeMarks();
            // 刷新视图
            this.refresh();
        });
        
        // 监听配置变化，重新加载装饰规则
        vscode.workspace.onDidChangeConfiguration(() => {
            this.loadDecorationRules();
        });

        // 初始加载装饰规则
        this.loadDecorationRules();
    }

    /**
     * 设置节点装饰器
     */
    setNodeDecorator(decorator: TreeNodeDecorator): void {
        this.nodeDecorator = decorator;
    }

    /**
     * 加载装饰规则
     */
    private loadDecorationRules(): void {
        if (!this.nodeDecorator) {
            return;
        }

        // 清空现有装饰
        this.nodeDecorator.clearAllDecorations();

        // 从配置中加载规则
        const config = vscode.workspace.getConfiguration('codeStructView');
        const rules = TreeNodeDecorator.loadRulesFromConfig(config);

        // 规则将在创建节点时应用
        // 这里只是加载配置，实际应用在createCodeElementItem方法中
        console.log(`[CodeStructViewProvider] 加载了 ${rules.length} 个装饰规则`);
    }

    /**
     * 为代码元素查找匹配的装饰规则
     */
    private findMatchingDecorationRule(element: CodeElement): NodeDecorationRule | undefined {
        if (!this.nodeDecorator) {
            return undefined;
        }

        const config = vscode.workspace.getConfiguration('codeStructView');
        const rules = TreeNodeDecorator.loadRulesFromConfig(config);

        // 查找匹配的规则
        for (const rule of rules) {
            if (TreeNodeDecorator.matchesRule(element, rule)) {
                return rule;
            }
        }

        return undefined;
    }

    /**
     * 从持久化存储中加载节点标记
     * 
     * 说明：
     * - 使用 workspaceState 存储标记，每个工作区的标记是独立的
     * - 当切换项目（工作区）时，VS Code 会自动加载对应工作区的状态
     * - 节点URI基于完整文件路径生成，确保每个项目的标记是独立的
     * - 这确保了：
     *   1. 项目A的标记不会影响项目B
     *   2. 切换项目时，每个项目的标记都能准确恢复
     *   3. 关闭VS Code后重新打开，标记依然保留（存储在对应工作区的状态中）
     */
    private loadNodeMarks(): void {
        if (!this.context) {
            console.warn('[CodeStructViewProvider] 上下文未设置，无法加载节点标记');
            return;
        }

        try {
            // 从工作区状态中加载节点标记
            // workspaceState 是每个工作区独立的存储空间
            // VS Code 在切换工作区时会自动切换对应的状态存储
            const savedMarks = this.context.workspaceState.get<{ [key: string]: string }>('nodeMarks', {});
            
            // 将保存的标记加载到内存中的 Map
            this.nodeMarks.clear();
            this.nodeMarkDetails.clear();
            for (const [nodeUri, color] of Object.entries(savedMarks)) {
                this.nodeMarks.set(nodeUri, color);
                // 详细信息需要从节点URI解析，或者单独存储
                // 暂时只存储颜色，详细信息在getAllMarkedNodes时动态解析
            }

            console.log(`[CodeStructViewProvider] 从工作区状态加载了 ${this.nodeMarks.size} 个节点标记`);
        } catch (error) {
            console.error('[CodeStructViewProvider] 加载节点标记失败:', error);
        }
    }

    /**
     * 保存节点标记到持久化存储
     */
    private async saveNodeMarks(): Promise<void> {
        if (!this.context) {
            console.warn('[CodeStructViewProvider] 上下文未设置，无法保存节点标记');
            return;
        }

        try {
            // 将内存中的 Map 转换为对象
            const marksObject: { [key: string]: string } = {};
            for (const [nodeUri, color] of this.nodeMarks.entries()) {
                marksObject[nodeUri] = color;
            }

            // 保存到工作区状态
            await this.context.workspaceState.update('nodeMarks', marksObject);
            console.log(`[CodeStructViewProvider] 保存了 ${this.nodeMarks.size} 个节点标记`);
        } catch (error) {
            console.error('[CodeStructViewProvider] 保存节点标记失败:', error);
        }
    }

    /**
     * 标记节点（设置节点颜色）
     */
    async markNode(nodeUri: vscode.Uri, color: string): Promise<void> {
        const uriString = nodeUri.toString();
        console.log(`[markNode] 标记节点: ${uriString}, 颜色: ${color}`);
        this.nodeMarks.set(uriString, color);
        console.log(`[markNode] 当前内存中的标记数量: ${this.nodeMarks.size}`);
        
        // 保存到持久化存储
        await this.saveNodeMarks();
        
        // 刷新树视图以应用新的标记
        console.log(`[markNode] 刷新树视图`);
        this.refresh();
        
        // 刷新标记视图
        if (this.markViewRefreshCallback) {
            this.markViewRefreshCallback();
        }
    }

    /**
     * 移除节点标记
     */
    async removeNodeMark(nodeUri: vscode.Uri): Promise<void> {
        const uriString = nodeUri.toString();
        if (this.nodeMarks.delete(uriString)) {
            // 保存到持久化存储
            await this.saveNodeMarks();
            
            // 刷新树视图
            this.refresh();
            
            // 刷新标记视图
            if (this.markViewRefreshCallback) {
                this.markViewRefreshCallback();
            }
        }
    }

    /**
     * 清空所有标记
     */
    async clearAllMarks(): Promise<void> {
        console.log('[clearAllMarks] 清空所有标记');
        const count = this.nodeMarks.size;
        this.nodeMarks.clear();
        
        // 保存到持久化存储
        await this.saveNodeMarks();
        
        // 刷新树视图
        this.refresh();
        
        // 刷新标记视图
        if (this.markViewRefreshCallback) {
            this.markViewRefreshCallback();
        }
        
        console.log(`[clearAllMarks] 已清空 ${count} 个标记`);
    }

    /**
     * 获取节点的标记颜色
     */
    getNodeMark(nodeUri: vscode.Uri): string | undefined {
        const uriString = nodeUri.toString();
        const mark = this.nodeMarks.get(uriString);
        console.log(`[getNodeMark] 查询节点标记: ${uriString}, 找到标记: ${mark || '无'}`);
        return mark;
    }

    /**
     * 获取所有标记的节点信息（供标记视图使用）
     * 包括手动标记的节点和通过注释标签规则自动标记的节点
     */
    async getAllMarkedNodes(): Promise<Array<{ nodeUri: vscode.Uri; color: string; element: CodeElement; fileUri: vscode.Uri; className?: string }>> {
        const resultMap = new Map<string, { nodeUri: vscode.Uri; color: string; element: CodeElement; fileUri: vscode.Uri; className?: string }>();

        console.log(`[getAllMarkedNodes] 开始获取所有标记节点，当前有 ${this.nodeMarks.size} 个手动标记`);

        // 第一步：遍历所有手动标记的节点
        for (const [nodeUriString, color] of this.nodeMarks.entries()) {
            try {
                // 解析节点URI
                const nodeUri = vscode.Uri.parse(nodeUriString);
                console.log(`[getAllMarkedNodes] 处理手动标记节点URI: ${nodeUriString}`);
                
                // 从URI中提取文件路径和节点信息
                const encodedUniqueId = nodeUri.path.substring(1); // 移除开头的 /
                const uniqueId = decodeURIComponent(encodedUniqueId);
                
                // 分割uniqueId
                const parts = uniqueId.split('#');
                if (parts.length >= 4) {
                    const fileUriString = parts[0];
                    const fileUri = vscode.Uri.parse(fileUriString);
                    const elementType = parts[1] as CodeElementType;
                    const elementName = parts[2];
                    const lineNumber = parseInt(parts[3]);

                    // 检查文件是否存在
                    try {
                        await vscode.workspace.fs.stat(fileUri);
                    } catch (error) {
                        console.warn(`[getAllMarkedNodes] 文件不存在，跳过: ${fileUri.fsPath}`);
                        continue;
                    }

                    // 查找对应的代码元素
                    const elements = await this.getFileStructure(fileUri);
                    const element = this.findElementInTree(elements, elementName, lineNumber, elementType);
                    
                    if (element) {
                        // 查找所属的类
                        const className = await this.findClassNameForElement(element, fileUri, elements);
                        
                        // 使用 nodeUriString 作为 key 来去重
                        resultMap.set(nodeUriString, {
                            nodeUri: nodeUri,
                            color: color,
                            element: element,
                            fileUri: fileUri,
                            className: className
                        });
                        console.log(`[getAllMarkedNodes] 成功添加手动标记节点: ${elementName}, 类: ${className || '未知'}`);
                    }
                }
            } catch (error) {
                console.error(`[getAllMarkedNodes] 解析手动标记节点失败: ${nodeUriString}`, error);
            }
        }

        // 第二步：扫描整个工程，查找所有匹配标签规则的方法
        console.log(`[getAllMarkedNodes] 开始扫描工程，查找自动标记的节点`);
        const autoMarkedNodes = await this.scanWorkspaceForTaggedMethods();
        console.log(`[getAllMarkedNodes] 扫描到 ${autoMarkedNodes.length} 个自动标记的节点`);

        // 将自动标记的节点添加到结果中（如果还没有手动标记）
        for (const autoNode of autoMarkedNodes) {
            const nodeUriString = autoNode.nodeUri.toString();
            // 只添加没有被手动标记的节点（手动标记优先级更高）
            if (!resultMap.has(nodeUriString)) {
                resultMap.set(nodeUriString, autoNode);
                console.log(`[getAllMarkedNodes] 添加自动标记节点: ${autoNode.element.name}`);
            }
        }

        const result = Array.from(resultMap.values());
        console.log(`[getAllMarkedNodes] 共找到 ${result.length} 个标记节点（${this.nodeMarks.size} 个手动 + ${autoMarkedNodes.length} 个自动）`);
        return result;
    }

    /**
     * 扫描整个工作区，查找所有匹配标签规则的方法（带缓存）
     */
    private async scanWorkspaceForTaggedMethods(): Promise<Array<{ nodeUri: vscode.Uri; color: string; element: CodeElement; fileUri: vscode.Uri; className?: string }>> {
        const result: Array<{ nodeUri: vscode.Uri; color: string; element: CodeElement; fileUri: vscode.Uri; className?: string }> = [];
        
        if (!this.workspaceRoot) {
            console.log('[scanWorkspaceForTaggedMethods] 工作区根目录不存在');
            return result;
        }

        // 检查缓存是否有效（简化版本：缓存仅在手动刷新时清除，文件变化通过监听器处理）
        const cacheKey = 'all';
        const cachedResult = this.autoMarkedNodesCache.get(cacheKey);
        if (cachedResult) {
            console.log(`[scanWorkspaceForTaggedMethods] 使用缓存，共 ${cachedResult.length} 个自动标记节点`);
            return cachedResult;
        }

        // 缓存不存在或无效，重新扫描
        console.log('[scanWorkspaceForTaggedMethods] 开始扫描工程，查找自动标记的节点');
        const allFiles = await this.getAllParsableFiles(this.workspaceRoot);
        console.log(`[scanWorkspaceForTaggedMethods] 找到 ${allFiles.length} 个可解析的文件`);

        // 对每个文件解析结构，查找匹配标签规则的方法
        for (const fileUri of allFiles) {
            try {
                // 记录文件修改时间
                const stats = await fs.promises.stat(fileUri.fsPath);
                this.fileMTimeCache.set(fileUri.fsPath, stats.mtimeMs);
                
                const elements = await this.getFileStructure(fileUri);
                const markedElements = this.findTaggedElementsInTree(elements, fileUri);
                
                for (const { element, tagRule } of markedElements) {
                    // 创建节点URI（与手动标记的格式一致）
                    const uniqueId = `${fileUri.toString()}#${element.type}#${element.name}#${element.line}`;
                    const nodeUri = vscode.Uri.parse(`codestructview://node/${encodeURIComponent(uniqueId)}`);
                    
                    // 查找所属的类
                    const className = await this.findClassNameForElement(element, fileUri, elements);
                    
                    result.push({
                        nodeUri: nodeUri,
                        color: tagRule.color,
                        element: element,
                        fileUri: fileUri,
                        className: className
                    });
                }
            } catch (error) {
                console.error(`[scanWorkspaceForTaggedMethods] 处理文件失败: ${fileUri.fsPath}`, error);
            }
        }

        // 保存到缓存
        this.autoMarkedNodesCache.set(cacheKey, result);
        console.log(`[scanWorkspaceForTaggedMethods] 扫描完成，缓存 ${result.length} 个自动标记节点`);

        return result;
    }

    /**
     * 清除自动标记缓存（当文件变化或配置变化时调用）
     */
    private clearAutoMarkCache(): void {
        this.autoMarkedNodesCache.clear();
        console.log('[clearAutoMarkCache] 已清除自动标记缓存');
    }

    /**
     * 递归查找所有可解析的文件
     */
    private async getAllParsableFiles(dirPath: string): Promise<vscode.Uri[]> {
        const files: vscode.Uri[] = [];
        
        try {
            const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);
                
                // 跳过隐藏文件和常见忽略目录
                if (entry.name.startsWith('.') && entry.name !== '.vscode' && entry.name !== '.git') {
                    continue;
                }
                if (entry.name === 'node_modules' || entry.name === 'out' || entry.name === 'dist' || entry.name === 'build') {
                    continue;
                }
                
                if (entry.isDirectory()) {
                    // 递归扫描子目录
                    const subFiles = await this.getAllParsableFiles(fullPath);
                    files.push(...subFiles);
                } else {
                    // 检查是否是可解析的文件
                    const ext = path.extname(entry.name).toLowerCase();
                    if (this.supportedExtensions.includes(ext)) {
                        files.push(vscode.Uri.file(fullPath));
                    }
                }
            }
        } catch (error) {
            console.error(`[getAllParsableFiles] 扫描目录失败: ${dirPath}`, error);
        }
        
        return files;
    }

    /**
     * 在代码元素树中递归查找所有匹配标签规则的方法
     */
    private findTaggedElementsInTree(
        elements: TreeNode[] | CodeElement[],
        fileUri: vscode.Uri
    ): Array<{ element: CodeElement; tagRule: TagRule }> {
        const result: Array<{ element: CodeElement; tagRule: TagRule }> = [];
        
        for (const node of elements) {
            let element: CodeElement;
            
            if (node instanceof CodeElementItem) {
                element = node.codeElement;
            } else if ('type' in node && 'name' in node) {
                // 是 CodeElement
                element = node as CodeElement;
            } else {
                continue;
            }
            
            // 检查是否是方法类型的元素
            if (element.type === CodeElementType.Method || 
                element.type === CodeElementType.Function || 
                element.type === CodeElementType.Constructor) {
                
                // 检查是否匹配标签规则
                const tagRule = TagRuleConfig.matchTagRule(element.comment);
                if (tagRule) {
                    result.push({ element, tagRule });
                    console.log(`[findTaggedElementsInTree] 找到匹配标签规则的方法: ${element.name}, 标签: ${tagRule.tag}`);
                }
            }
            
            // 递归查找子元素
            if (element.children && element.children.length > 0) {
                const childResults = this.findTaggedElementsInTree(element.children, fileUri);
                result.push(...childResults);
            }
        }
        
        return result;
    }

    /**
     * 在代码元素树中查找元素
     */
    private findElementInTree(
        elements: TreeNode[],
        name: string,
        line: number,
        type: string
    ): CodeElement | undefined {
        for (const node of elements) {
            if (node instanceof CodeElementItem) {
                const element = node.codeElement;
                if (element.name === name && element.line === line && element.type === type) {
                    return element;
                }
                
                // 递归查找子元素
                if (element.children) {
                    const found = this.findElementInChildren(element.children, name, line, type);
                    if (found) {
                        return found;
                    }
                }
            }
        }
        return undefined;
    }

    /**
     * 在子元素中递归查找
     */
    private findElementInChildren(
        children: CodeElement[],
        name: string,
        line: number,
        type: string
    ): CodeElement | undefined {
        for (const child of children) {
            if (child.name === name && child.line === line && child.type === type) {
                return child;
            }
            if (child.children) {
                const found = this.findElementInChildren(child.children, name, line, type);
                if (found) {
                    return found;
                }
            }
        }
        return undefined;
    }

    /**
     * 查找元素所属的类名
     * 公共方法，供标记视图使用
     */
    async findClassNameForElement(
        element: CodeElement,
        fileUri: vscode.Uri,
        elements: TreeNode[]
    ): Promise<string | undefined> {
        // 递归查找父元素中的类
        const findClass = (elements: TreeNode[], target: CodeElement, parentClass?: string): string | undefined => {
            for (const node of elements) {
                if (node instanceof CodeElementItem) {
                    const el = node.codeElement;
                    
                    // 如果找到目标元素
                    if (el === target) {
                        return parentClass;
                    }
                    
                    // 如果是类，记录为父类
                    let currentClass = parentClass;
                    if (el.type === CodeElementType.Class) {
                        currentClass = el.name;
                    }
                    
                    // 递归查找子元素
                    if (el.children) {
                        const childElements = el.children.map(child => 
                            new CodeElementItem(child, node.fileUri)
                        );
                        const found = findClass(childElements, target, currentClass);
                        if (found !== undefined) {
                            return found;
                        }
                    }
                }
            }
            return undefined;
        };

        return findClass(elements, element);
    }

    /**
     * 设置树视图引用
     */
    setTreeView(treeView: vscode.TreeView<TreeNode>): void {
        this.treeView = treeView;
    }

    /**
     * 刷新树视图
     */
    refresh(): void {
        console.log('[refresh] 刷新树视图，清空缓存');
        this.fileStructureCache.clear();
        this.filePathToNodeMap.clear();
        this.clearAutoMarkCache(); // 清除自动标记缓存
        console.log('[refresh] 触发树数据变化事件');
        this._onDidChangeTreeData.fire();
    }

    /**
     * 标记视图刷新回调（由标记视图提供者设置）
     */
    private markViewRefreshCallback: (() => void) | undefined;

    /**
     * 设置标记视图刷新回调
     */
    setMarkViewRefreshCallback(callback: () => void): void {
        this.markViewRefreshCallback = callback;
    }

    /**
     * 定位到文件节点
     */
    async revealFile(uri: vscode.Uri): Promise<void> {
        if (!this.treeView || !this.workspaceRoot) {
            return;
        }

        try {
            const filePath = uri.fsPath;
            
            // 检查文件是否在工作区内
            if (!filePath.startsWith(this.workspaceRoot)) {
                return;
            }
            
            // 查找文件节点（可能需要多次尝试，因为树可能还在加载）
            let fileNode: FileItem | null = null;
            let attempts = 0;
            const maxAttempts = 5;
            
            while (!fileNode && attempts < maxAttempts) {
                fileNode = await this.findFileNode(uri);
                if (!fileNode) {
                    // 等待一下再重试
                    await new Promise(resolve => setTimeout(resolve, 200));
                    attempts++;
                }
            }
            
            if (fileNode) {
                // 先找到文件节点的父节点（目录），reveal 父节点可以让文件节点在可视区域的更上方
                const parentNode = await this.getParent(fileNode);
                if (parentNode && parentNode instanceof FileItem && parentNode.isDirectory) {
                    // 先 reveal 父目录节点，让它滚动到可视区域
                    await this.treeView.reveal(parentNode, {
                        focus: false,
                        select: false,
                        expand: true
                    });
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
                
                // 先展开文件节点
                await this.treeView.reveal(fileNode, {
                    focus: false,
                    select: false,
                    expand: true
                });
                
                // 等待文件结构加载
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // 再次 reveal 文件节点，使用 focus: true 让它滚动到可视区域顶部
                await this.treeView.reveal(fileNode, {
                    focus: true,
                    select: true,
                    expand: false
                });
                
                // 等待一下，确保滚动完成
                await new Promise(resolve => setTimeout(resolve, 100));
                
                // 获取文件的子节点（应该是 namespace 或 class）
                const fileChildren = await this.getChildren(fileNode);
                console.log(`[revealFile] 文件子节点数量: ${fileChildren?.length || 0}`);
                
                if (fileChildren && fileChildren.length > 0) {
                    // 查找 namespace 或 class 节点，或者 Vue 的 export default 节点
                    let namespaceNode: CodeElementItem | null = null;
                    let classNode: CodeElementItem | null = null;
                    let exportDefaultNode: CodeElementItem | null = null;
                    
                    for (const child of fileChildren) {
                        if (child instanceof CodeElementItem) {
                            const element = child.codeElement;
                            console.log(`[revealFile] 找到子节点: ${element.name}, 类型: ${element.type}`);
                            
                            // 如果是 namespace，展开它并查找 class
                            if (element.type === CodeElementType.Namespace) {
                                namespaceNode = child;
                                await this.treeView.reveal(child, {
                                    focus: false,
                                    select: false,
                                    expand: true
                                });
                                
                                // 等待 namespace 的子节点加载
                                await new Promise(resolve => setTimeout(resolve, 300));
                                
                                // 获取 namespace 的子节点，查找 class
                                const namespaceChildren = await this.getChildren(child);
                                console.log(`[revealFile] namespace 子节点数量: ${namespaceChildren?.length || 0}`);
                                
                                if (namespaceChildren) {
                                    for (const nsChild of namespaceChildren) {
                                        if (nsChild instanceof CodeElementItem && nsChild.codeElement.type === CodeElementType.Class) {
                                            classNode = nsChild;
                                            console.log(`[revealFile] 找到 class 节点: ${nsChild.codeElement.name}`);
                                            break;
                                        }
                                    }
                                }
                            } 
                            // 如果是 class，直接使用
                            else if (element.type === CodeElementType.Class) {
                                // 检查是否是 Vue 的 export default
                                if (element.name === 'export default') {
                                    exportDefaultNode = child;
                                    console.log(`[revealFile] 找到 export default 节点: ${element.name}`);
                                } else {
                                    classNode = child;
                                    console.log(`[revealFile] 找到 class 节点（直接）: ${element.name}`);
                                }
                                break;
                            }
                        }
                    }
                    
                    // 如果找到了 export default 节点（Vue 文件），展开它并查找 methods
                    if (exportDefaultNode) {
                        console.log(`[revealFile] 展开 export default 节点: ${exportDefaultNode.codeElement.name}`);
                        // 先展开
                        await this.treeView.reveal(exportDefaultNode, {
                            focus: false,
                            select: false,
                            expand: true
                        });
                        
                        // 等待子节点加载
                        await new Promise(resolve => setTimeout(resolve, 200));
                        
                        // 再次 reveal，让它滚动到顶部
                        await this.treeView.reveal(exportDefaultNode, {
                            focus: true,
                            select: true,
                            expand: false
                        });
                        
                        await new Promise(resolve => setTimeout(resolve, 100));
                        
                        // 等待 export default 的子节点加载
                        await new Promise(resolve => setTimeout(resolve, 300));
                        
                        // 获取 export default 的子节点，查找 methods
                        const exportDefaultChildren = await this.getChildren(exportDefaultNode);
                        console.log(`[revealFile] export default 子节点数量: ${exportDefaultChildren?.length || 0}`);
                        
                        if (exportDefaultChildren && exportDefaultChildren.length > 0) {
                            let methodsNode: CodeElementItem | null = null;
                            
                            // 查找 methods 节点
                            for (const child of exportDefaultChildren) {
                                if (child instanceof CodeElementItem) {
                                    const childElement = child.codeElement;
                                    if (childElement.type === CodeElementType.Property && childElement.name === 'methods') {
                                        methodsNode = child;
                                        console.log(`[revealFile] 找到 methods 节点: ${childElement.name}`);
                                        break;
                                    }
                                }
                            }
                            
                            // 如果找到了 methods 节点，展开它并展开所有有子节点的方法
                            if (methodsNode) {
                                console.log(`[revealFile] 展开 methods 节点: ${methodsNode.codeElement.name}`);
                                await this.treeView.reveal(methodsNode, {
                                    focus: false,
                                    select: false,
                                    expand: true
                                });
                                
                                // 等待 methods 的子节点加载
                                await new Promise(resolve => setTimeout(resolve, 300));
                                
                                // 获取 methods 的子节点，展开所有有子节点的方法
                                const methodsChildren = await this.getChildren(methodsNode);
                                console.log(`[revealFile] methods 子节点数量: ${methodsChildren?.length || 0}`);
                                
                                if (methodsChildren && methodsChildren.length > 0) {
                                    for (const methodChild of methodsChildren) {
                                        if (methodChild instanceof CodeElementItem) {
                                            const methodElement = methodChild.codeElement;
                                            // 检查是否是方法节点且有子节点
                                            if (methodElement.type === CodeElementType.Method && 
                                                methodElement.children && 
                                                methodElement.children.length > 0) {
                                                console.log(`[revealFile] 展开有子节点的方法: ${methodElement.name}, 子节点数: ${methodElement.children.length}`);
                                                await this.treeView.reveal(methodChild, {
                                                    focus: false,
                                                    select: false,
                                                    expand: true
                                                });
                                                // 添加小延迟，避免展开过快
                                                await new Promise(resolve => setTimeout(resolve, 50));
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                    // 如果找到了 class 节点（C# 文件），展开并选中它（expand: true 会展开显示其成员）
                    else if (classNode) {
                        console.log(`[revealFile] 展开 class 节点: ${classNode.codeElement.name}`);
                        // 先展开
                        await this.treeView.reveal(classNode, {
                            focus: false,
                            select: false,
                            expand: true  // 展开 class 节点，显示其成员
                        });
                        
                        // 等待子节点加载
                        await new Promise(resolve => setTimeout(resolve, 200));
                        
                        // 再次 reveal，让它滚动到顶部
                        await this.treeView.reveal(classNode, {
                            focus: true,
                            select: true,
                            expand: false
                        });
                        
                        await new Promise(resolve => setTimeout(resolve, 100));
                        
                        // 等待 class 的子节点加载
                        await new Promise(resolve => setTimeout(resolve, 300));
                        
                        // 获取 class 的子节点，展开所有方法节点
                        const classChildren = await this.getChildren(classNode);
                        console.log(`[revealFile] class 子节点数量: ${classChildren?.length || 0}`);
                        
                        if (classChildren && classChildren.length > 0) {
                            // 展开所有方法节点（Method 或 Constructor），如果有子节点则展开
                            for (const classChild of classChildren) {
                                if (classChild instanceof CodeElementItem) {
                                    const childElement = classChild.codeElement;
                                    if (childElement.type === CodeElementType.Method || 
                                        childElement.type === CodeElementType.Constructor) {
                                        // 检查方法是否有子节点（方法描述、参数、返回值）
                                        const hasChildren = childElement.children && childElement.children.length > 0;
                                        if (hasChildren) {
                                            console.log(`[revealFile] 展开有子节点的方法: ${childElement.name}, 子节点数: ${childElement.children!.length}`);
                                            // 展开方法节点
                                            await this.treeView.reveal(classChild, {
                                                focus: false,
                                                select: false,
                                                expand: true  // 展开方法节点，显示其子节点（方法描述、参数、返回值）
                                            });
                                            // 添加小延迟，避免展开过快
                                            await new Promise(resolve => setTimeout(resolve, 50));
                                        }
                                    }
                                }
                            }
                        }
                    } else {
                        console.log(`[revealFile] 未找到 class 或 export default 节点`);
                    }
                }
            } else {
                console.log('未找到文件节点:', filePath);
            }
        } catch (error) {
            console.error('定位文件节点失败:', error);
        }
    }

    /**
     * 查找文件节点
     */
    private async findFileNode(uri: vscode.Uri): Promise<FileItem | null> {
        // 先检查缓存
        if (this.filePathToNodeMap.has(uri.fsPath)) {
            return this.filePathToNodeMap.get(uri.fsPath)!;
        }

        // 从根目录开始查找
        if (!this.workspaceRoot) {
            return null;
        }

        const filePath = uri.fsPath;
        // 确保 workspaceRoot 和 filePath 都是有效的字符串
        if (!filePath || typeof filePath !== 'string') {
            console.error('[findFileNode] 文件路径无效:', filePath);
            return null;
        }
        
        const relativePath = filePath.replace(this.workspaceRoot + path.sep, '');
        const pathParts = relativePath.split(path.sep);

        // 递归查找节点
        return await this.findNodeByPath(pathParts, 0, null);
    }

    /**
     * 根据路径查找节点
     */
    private async findNodeByPath(pathParts: string[], index: number, parent: TreeNode | null): Promise<FileItem | null> {
        if (index >= pathParts.length) {
            return null;
        }

        const targetName = pathParts[index];
        const children = await this.getChildren(parent || undefined);

        for (const child of children) {
            if (child instanceof FileItem) {
                let matches = false;
                
                // 使用 label 匹配
                if (child.label === targetName) {
                    matches = true;
                }
                
                // 如果有 resourceUri，也使用文件名匹配（处理大小写问题）
                if (child.resourceUri && child.resourceUri.fsPath) {
                    const fsPath = child.resourceUri.fsPath;
                    if (typeof fsPath === 'string' && fsPath.length > 0) {
                        const fileName = path.basename(fsPath);
                        if (fileName === targetName) {
                            matches = true;
                        }
                    }
                }
                
                if (matches) {
                    // 如果是最后一个部分，验证完整路径并返回
                    if (index === pathParts.length - 1) {
                        if (child.resourceUri && child.resourceUri.fsPath) {
                            const childPath = child.resourceUri.fsPath;
                            // 确保 workspaceRoot 和 pathParts 都是有效的
                            if (!this.workspaceRoot || typeof this.workspaceRoot !== 'string') {
                                console.error('[findNodeByPath] workspaceRoot 无效');
                                return null;
                            }
                            
                            // 过滤掉无效的 pathParts
                            const validPathParts = pathParts.filter(p => p && typeof p === 'string' && p.length > 0);
                            if (validPathParts.length === 0) {
                                return null;
                            }
                            
                            const targetPath = path.join(this.workspaceRoot, ...validPathParts);
                            
                            // 确保 childPath 是有效的字符串
                            if (typeof childPath !== 'string' || childPath.length === 0) {
                                return null;
                            }
                            
                            // 标准化路径进行比较（处理路径分隔符和大小写问题）
                            const normalizedChildPath = path.normalize(childPath).toLowerCase();
                            const normalizedTargetPath = path.normalize(targetPath).toLowerCase();
                            
                            if (normalizedChildPath === normalizedTargetPath) {
                                // 缓存节点
                                this.filePathToNodeMap.set(childPath, child);
                                return child;
                            }
                        } else {
                            // 如果没有 resourceUri，但 label 匹配，也返回（可能是特殊情况）
                            return child;
                        }
                    } else {
                        // 继续查找子节点
                        const found = await this.findNodeByPath(pathParts, index + 1, child);
                        if (found) {
                            return found;
                        }
                    }
                }
            }
        }

        return null;
    }

    /**
     * 获取树节点
     */
    getTreeItem(element: TreeNode): vscode.TreeItem {
        // 添加调试日志
        if (element instanceof CodeElementItem) {
            console.log(`[getTreeItem] CodeElementItem - label: ${element.label}, contextValue: ${element.contextValue}, nodeUri: ${element.nodeUri.toString()}`);
        } else if (element instanceof FileItem) {
            console.log(`[getTreeItem] FileItem - label: ${element.label}, contextValue: ${element.contextValue}, isDirectory: ${element.isDirectory}, isParsableFile: ${element.isParsableFile}`);
        }
        
        // 对于可解析的文件，确保显示文件图标
        if (element instanceof FileItem && element.isParsableFile && element.resourceUri) {
            // 确保 resourceUri 已设置，这样 VSCode 会根据文件类型显示对应的文件图标
            // 即使节点是可折叠的，只要 resourceUri 正确设置，就会显示文件图标
            // 注意：不能修改 resourceUri（它是只读的），但可以确保它已正确设置
        }
        return element;
    }

    /**
     * 获取父节点（TreeDataProvider 需要实现此方法才能使用 reveal）
     */
    getParent(element: TreeNode): Thenable<TreeNode | undefined> {
        // 对于文件节点，需要找到其父目录
        if (element instanceof FileItem && element.resourceUri) {
            const filePath = element.resourceUri.fsPath;
            const parentPath = path.dirname(filePath);
            
            // 如果是工作区根目录，返回 undefined
            if (parentPath === this.workspaceRoot || !this.workspaceRoot || !parentPath.startsWith(this.workspaceRoot)) {
                return Promise.resolve(undefined);
            }
            
            // 查找父目录节点
            const parentUri = vscode.Uri.file(parentPath);
            return this.findFileNode(parentUri).then(node => node || undefined);
        }
        
        // 对于代码元素节点，需要找到其父元素
        if (element instanceof CodeElementItem) {
            // 代码元素的父元素需要通过文件结构来查找
            // 我们需要从文件开始，逐级查找父节点
            return this.findParentCodeElement(element);
        }
        
        return Promise.resolve(undefined);
    }

    /**
     * 查找代码元素的父节点
     */
    private async findParentCodeElement(element: CodeElementItem): Promise<TreeNode | undefined> {
        try {
            // 首先找到文件节点
            const fileUri = element.fileUri;
            const fileNode = await this.findFileNode(fileUri);
            
            if (!fileNode) {
                console.log(`[findParentCodeElement] 未找到文件节点: ${fileUri.fsPath}`);
                return undefined;
            }
            
            // 获取文件结构
            const fileElements = await this.getFileStructure(fileUri);
            console.log(`[findParentCodeElement] 文件元素数量: ${fileElements.length}`);
            
            // 递归查找父元素
            const findParent = (elements: CodeElement[], target: CodeElement, parent: CodeElement | null = null): CodeElement | null => {
                for (const el of elements) {
                    // 使用对象引用比较，而不是内容比较
                    if (el === target) {
                        return parent;
                    }
                    if (el.children && el.children.length > 0) {
                        const found = findParent(el.children, target, el);
                        if (found !== null) {
                            return found;
                        }
                    }
                }
                return null;
            };
            
            // 在所有文件元素中查找父元素
            for (const fileElement of fileElements) {
                if (fileElement instanceof CodeElementItem) {
                    // 如果就是文件的第一级元素（namespace 或 class），父节点是文件
                    if (fileElement.codeElement === element.codeElement) {
                        console.log(`[findParentCodeElement] 找到第一级元素，父节点是文件`);
                        return fileNode;
                    }
                    
                    // 在文件元素及其子元素中查找
                    const parentElement = findParent([fileElement.codeElement], element.codeElement);
                    if (parentElement) {
                        console.log(`[findParentCodeElement] 找到父元素: ${parentElement.name}`);
                        // 找到父元素，需要创建对应的 CodeElementItem
                        return this.createCodeElementItem(parentElement, fileUri);
                    }
                }
            }
            
            // 如果没找到，可能是文件的第一级元素
            for (const fileElement of fileElements) {
                if (fileElement instanceof CodeElementItem) {
                    if (fileElement.codeElement.children) {
                        for (const child of fileElement.codeElement.children) {
                            if (child === element.codeElement) {
                                console.log(`[findParentCodeElement] 找到第一级元素的子元素，父节点是: ${fileElement.codeElement.name}`);
                                return fileElement;
                            }
                        }
                    }
                }
            }
            
            console.log(`[findParentCodeElement] 未找到父元素，返回文件节点作为默认父节点`);
            // 如果找不到，返回文件节点作为默认父节点
            return fileNode;
        } catch (error) {
            console.error(`[findParentCodeElement] 查找父元素失败:`, error);
            return undefined;
        }
    }

    /**
     * 获取子节点
     */
    getChildren(element?: TreeNode): Thenable<TreeNode[]> {
        if (!this.workspaceRoot) {
            return Promise.resolve([new FileItem('没有打开的工作区', vscode.TreeItemCollapsibleState.None)]);
        }

        if (!element) {
            // 根节点：返回工作区根目录的内容
            return this.getDirectoryContents(this.workspaceRoot);
        } else if (element instanceof FileItem) {
            // 文件项
            if (element.isDirectory) {
                // 目录：返回目录内容
                return this.getDirectoryContents(element.resourceUri!.fsPath);
            } else if (element.isParsableFile && element.resourceUri) {
                // 可解析的文件：返回文件结构
                return this.getFileStructure(element.resourceUri);
            }
        } else if (element instanceof CodeElementItem) {
            // 代码元素：返回子元素
            if (element.codeElement.children && element.codeElement.children.length > 0) {
                console.log(`[getChildren] 返回 ${element.codeElement.children.length} 个子节点给 ${element.codeElement.name} (${element.codeElement.type})`);
                const children = element.codeElement.children.map(child => {
                    console.log(`[getChildren] 创建子节点: ${child.name}, 类型: ${child.type}, 注释: ${child.comment}`);
                    return this.createCodeElementItem(child, element.fileUri);
                });
                return Promise.resolve(children);
            } else {
                console.log(`[getChildren] ${element.codeElement.name} (${element.codeElement.type}) 没有子节点`);
            }
        }

        return Promise.resolve([]);
    }

    /**
     * 获取目录内容
     */
    private async getDirectoryContents(dirPath: string): Promise<FileItem[]> {
        // 确保 dirPath 是有效的字符串
        if (!dirPath || typeof dirPath !== 'string' || dirPath.length === 0) {
            console.error('[getDirectoryContents] 目录路径无效:', dirPath);
            return [];
        }
        
        try {
            const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
            
            // 过滤掉常见忽略目录
            const filteredEntries = entries.filter(entry => {
                const name = entry.name;
                // 确保 name 是有效的字符串
                if (!name || typeof name !== 'string' || name.length === 0) {
                    return false;
                }
                // 忽略常见构建目录
                if (name === 'node_modules' || name === 'out' || name === 'dist' || name === 'build') {
                    return false;
                }
                // 允许显示所有文件，包括以 . 开头的隐藏文件
                return true;
            });

            // 排序：目录在前，文件在后，然后按名称排序
            filteredEntries.sort((a, b) => {
                if (a.isDirectory() && !b.isDirectory()) {
                    return -1;
                }
                if (!a.isDirectory() && b.isDirectory()) {
                    return 1;
                }
                return a.name.localeCompare(b.name);
            });

            // 转换为 FileItem，过滤掉无效的条目
            return filteredEntries
                .map(entry => {
                    // 确保 dirPath 和 entry.name 都是有效的字符串
                    if (!dirPath || typeof dirPath !== 'string' || !entry.name || typeof entry.name !== 'string') {
                        console.error('[getDirectoryContents] 无效的路径或文件名:', { dirPath, name: entry.name });
                        return null;
                    }
                    
                    const fullPath = path.join(dirPath, entry.name);
                    // 确保 fullPath 是有效的
                    if (!fullPath || typeof fullPath !== 'string' || fullPath.length === 0) {
                        console.error('[getDirectoryContents] 生成的路径无效:', fullPath);
                        return null;
                    }
                    
                    const uri = vscode.Uri.file(fullPath);
                    const isDirectory = entry.isDirectory();
                    const ext = path.extname(entry.name).toLowerCase();
                    const isParsableFile = !isDirectory && this.supportedExtensions.includes(ext);
                    
                    const fileItem = new FileItem(
                        entry.name,
                        isDirectory ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
                        uri,
                        isDirectory,
                        isParsableFile
                    );
                    
                    // 缓存文件节点
                    if (!isDirectory && uri) {
                        this.filePathToNodeMap.set(uri.fsPath, fileItem);
                    }
                    
                    return fileItem;
                })
                .filter((item): item is FileItem => item !== null);
        } catch (error) {
            console.error('读取目录失败:', error);
            return [];
        }
    }

    /**
     * 创建代码元素节点并应用装饰规则
     */
    private createCodeElementItem(element: CodeElement, fileUri: vscode.Uri): CodeElementItem {
        // 检查注释标签规则（优先级：手动标记 > 标签规则 > 装饰规则）
        let tagRule: TagRule | undefined;
        let tagRuleColor: string | undefined;
        
        // 对于方法类型的节点，检查注释标签
        if (element.type === CodeElementType.Method || 
            element.type === CodeElementType.Function || 
            element.type === CodeElementType.Constructor) {
            tagRule = TagRuleConfig.matchTagRule(element.comment);
            if (tagRule) {
                tagRuleColor = tagRule.color;
                console.log(`[createCodeElementItem] 节点 ${element.name} 匹配标签规则: ${tagRule.tag}, 颜色: ${tagRuleColor}`);
            }
        }

        // 先创建临时节点以获取 nodeUri
        const tempItem = new CodeElementItem(element, fileUri, undefined, tagRule);
        const nodeUri = tempItem.nodeUri;
        
        // 检查是否有已保存的标记（优先级最高）
        const actualSavedMarkColor = this.getNodeMark(nodeUri);
        let decorationColor: string | undefined = actualSavedMarkColor || tagRuleColor;
        
        console.log(`[createCodeElementItem] 创建节点: ${element.name}, nodeUri: ${nodeUri.toString()}`);
        console.log(`[createCodeElementItem] 节点 ${element.name} 的标记颜色: ${decorationColor || '无'}`);

        // 如果有保存的标记，使用保存的标记（优先级最高）
        if (actualSavedMarkColor) {
            decorationColor = actualSavedMarkColor;
            console.log(`[createCodeElementItem] 使用保存的标记颜色: ${decorationColor}`);
        } else if (tagRuleColor) {
            // 使用标签规则的颜色（如果匹配到标签规则）
            decorationColor = tagRuleColor;
            console.log(`[createCodeElementItem] 使用标签规则颜色: ${decorationColor}`);
        } else {
            // 如果没有保存的标记和标签规则，查找匹配的装饰规则
            const decorationRule = this.findMatchingDecorationRule(element);
            decorationColor = decorationRule ? decorationRule.color : undefined;
            
            // 如果找到装饰规则，注册装饰
            if (decorationRule && this.nodeDecorator) {
                this.nodeDecorator.registerNodeDecoration(nodeUri.toString(), decorationRule);
            }
        }

        // 如果有保存的标记，也注册装饰（用于工具提示等）
        if (actualSavedMarkColor && this.nodeDecorator) {
            const markRule: NodeDecorationRule = {
                color: actualSavedMarkColor,
                tooltip: `标记: ${actualSavedMarkColor}`
            };
            this.nodeDecorator.registerNodeDecoration(nodeUri.toString(), markRule);
        }

        // 如果有颜色，更新节点的装饰颜色（会自动应用文字样式）
        if (decorationColor) {
            console.log(`[createCodeElementItem] 更新节点装饰颜色: ${decorationColor}`);
            tempItem.updateDecorationColor(decorationColor);
        } else {
            console.log(`[createCodeElementItem] 节点没有装饰颜色`);
        }

        return tempItem;
    }

    /**
     * 获取文件结构（懒加载）
     * 公共方法，供标记视图使用
     */
    async getFileStructure(uri: vscode.Uri): Promise<TreeNode[]> {
        const filePath = uri.fsPath;
        console.log('开始解析文件结构:', filePath);
        
        // 检查缓存
        if (this.fileStructureCache.has(filePath)) {
            const elements = this.fileStructureCache.get(filePath)!;
            console.log('使用缓存，找到', elements.length, '个元素');
            return elements.map(element => this.createCodeElementItem(element, uri));
        }

        try {
            // 解析文件结构
            console.log('开始解析文件:', filePath);
            const elements = await FileStructureParser.parseFile(uri);
            console.log('解析完成，找到', elements.length, '个元素');
            
            if (elements.length === 0) {
                console.log('文件没有找到代码结构');
                return [new FileItem('未找到代码结构', vscode.TreeItemCollapsibleState.None)];
            }
            
            // 缓存结果
            this.fileStructureCache.set(filePath, elements);
            
            // 转换为树节点
            return elements.map(element => this.createCodeElementItem(element, uri));
        } catch (error) {
            console.error('解析文件结构失败:', error);
            return [new FileItem(`解析失败: ${error}`, vscode.TreeItemCollapsibleState.None)];
        }
    }

    /**
     * 格式化代码元素标签
     */
    static formatCodeElementLabel(element: CodeElement): string {
        let label = element.name;
        
        // 添加访问修饰符
        if (element.accessModifier !== AccessModifier.Default) {
            label = `${element.accessModifier} ${label}`;
        }
        
        // 添加返回类型和参数（方法/函数）
        if (element.type === CodeElementType.Method || element.type === CodeElementType.Function || element.type === CodeElementType.Constructor) {
            if (element.returnType) {
                label += `: ${element.returnType}`;
            }
            if (element.parameters !== undefined) {
                label += `(${element.parameters})`;
            }
            // 方法节点不显示注释，注释信息通过子节点显示
        } else if (element.type === CodeElementType.Variable) {
            // 变量节点（包括方法描述、方法参数、方法返回、参数等）
            if (element.comment) {
                // 清理注释：移除开头的空格、斜线、星号和空格+斜线+星号
                let comment = element.comment.trim();
                console.log(`[formatCodeElementLabel] 变量节点 ${element.name} 原始注释: "${comment}"`);
                
                // 移除开头的空格
                while (comment.startsWith(' ')) {
                    comment = comment.substring(1).trim();
                }
                
                // 移除开头的斜线（包括多个连续的斜线）
                while (comment.startsWith('/')) {
                    comment = comment.substring(1).trim();
                }
                
                // 移除开头的星号（包括多个连续的星号）
                while (comment.startsWith('*')) {
                    comment = comment.substring(1).trim();
                }
                
                // 再次移除可能残留的开头空格
                while (comment.startsWith(' ')) {
                    comment = comment.substring(1).trim();
                }
                
                console.log(`[formatCodeElementLabel] 变量节点 ${element.name} 清理后注释: "${comment}"`);
                // 不添加 // 前缀，直接显示注释内容
                if (comment) {
                    label += ` ${comment}`;
                }
            }
        } else {
            // 其他元素显示注释（确保没有开头的空格、斜杠和星号）
            if (element.comment) {
                let comment = element.comment.trim();
                console.log(`[formatCodeElementLabel] 其他节点 ${element.name} 原始注释: "${comment}"`);
                
                // 移除开头的空格
                while (comment.startsWith(' ')) {
                    comment = comment.substring(1).trim();
                }
                
                // 移除开头的斜线（包括多个连续的斜线）
                while (comment.startsWith('/')) {
                    comment = comment.substring(1).trim();
                }
                
                // 移除开头的星号（包括多个连续的星号）
                while (comment.startsWith('*')) {
                    comment = comment.substring(1).trim();
                }
                
                // 再次移除可能残留的开头空格
                while (comment.startsWith(' ')) {
                    comment = comment.substring(1).trim();
                }
                
                console.log(`[formatCodeElementLabel] 其他节点 ${element.name} 清理后注释: "${comment}"`);
                // 不添加 // 前缀，直接显示注释内容
                if (comment) {
                    label += ` ${comment}`;
                }
            }
        }
        
        return label;
    }

    /**
     * 根据元素类型获取图标
     */
    static getIconForElementType(type: CodeElementType): vscode.ThemeIcon {
        switch (type) {
            case CodeElementType.Class:
                return new vscode.ThemeIcon('symbol-class');
            case CodeElementType.Interface:
                return new vscode.ThemeIcon('symbol-interface');
            case CodeElementType.Method:
            case CodeElementType.Function:
                return new vscode.ThemeIcon('symbol-method');
            case CodeElementType.Property:
                return new vscode.ThemeIcon('symbol-property');
            case CodeElementType.Variable:
            case CodeElementType.Field:
                return new vscode.ThemeIcon('symbol-variable');
            case CodeElementType.Namespace:
                return new vscode.ThemeIcon('symbol-namespace');
            case CodeElementType.Enum:
                return new vscode.ThemeIcon('symbol-enum');
            case CodeElementType.Constructor:
                return new vscode.ThemeIcon('symbol-constructor');
            case CodeElementType.Module:
                return new vscode.ThemeIcon('symbol-module');
            default:
                return new vscode.ThemeIcon('symbol-misc');
        }
    }

    /**
     * 显示代码结构面板
     */
    showPanel(): void {
        if (this.panel) {
            // 如果面板已存在，显示它
            this.panel.reveal(vscode.ViewColumn.Beside);
        } else {
            // 创建新面板
            this.panel = vscode.window.createWebviewPanel(
                'codeStructView',
                '代码结构视图',
                vscode.ViewColumn.Beside,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true
                }
            );

            // 设置面板内容
            this.updatePanelContent();

            // 当面板关闭时，清理引用
            this.panel.onDidDispose(() => {
                this.panel = undefined;
            });

            // 当活动编辑器改变时，更新面板内容
            vscode.window.onDidChangeActiveTextEditor(() => {
                if (this.panel) {
                    this.updatePanelContent();
                }
            });
        }
    }

    /**
     * 更新面板内容
     */
    private async updatePanelContent(): Promise<void> {
        if (!this.panel) {
            return;
        }

        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            this.panel.webview.html = this.getEmptyPanelHtml();
            return;
        }

        const document = editor.document;
        const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
            'vscode.executeDocumentSymbolProvider',
            document.uri
        );

        if (!symbols || symbols.length === 0) {
            this.panel.webview.html = this.getEmptyPanelHtml();
            return;
        }

        // 生成 HTML 内容
        this.panel.webview.html = this.getPanelHtml(symbols, document.fileName);
    }

    /**
     * 获取面板 HTML 内容
     */
    private getPanelHtml(symbols: vscode.DocumentSymbol[], fileName: string): string {
        const symbolList = this.formatSymbols(symbols);
        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>代码结构视图</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
        }
        h1 {
            font-size: 18px;
            margin-bottom: 10px;
            color: var(--vscode-textLink-foreground);
        }
        .file-name {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 20px;
        }
        .symbol-item {
            padding: 5px 0;
            cursor: pointer;
            border-left: 2px solid transparent;
            padding-left: 10px;
            margin-left: 0;
        }
        .symbol-item:hover {
            background-color: var(--vscode-list-hoverBackground);
            border-left-color: var(--vscode-textLink-foreground);
        }
        .symbol-name {
            font-weight: 500;
        }
        .symbol-info {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-left: 20px;
        }
        .symbol-kind {
            display: inline-block;
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 11px;
            margin-left: 10px;
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
        }
    </style>
</head>
<body>
    <h1>代码结构</h1>
    <div class="file-name">${this.escapeHtml(fileName)}</div>
    <div class="symbol-list">
        ${symbolList}
    </div>
</body>
</html>`;
    }

    /**
     * 格式化符号列表为 HTML
     */
    private formatSymbols(symbols: vscode.DocumentSymbol[], indent: number = 0): string {
        let html = '';
        for (const symbol of symbols) {
            const kind = this.getSymbolKind(symbol.kind);
            const indentStyle = `margin-left: ${indent * 20}px;`;
            html += `
            <div class="symbol-item" style="${indentStyle}">
                <span class="symbol-name">${this.escapeHtml(symbol.name)}</span>
                <span class="symbol-kind">${kind}</span>
                <div class="symbol-info">行 ${symbol.range.start.line + 1}</div>
            </div>
            `;
            if (symbol.children && symbol.children.length > 0) {
                html += this.formatSymbols(symbol.children, indent + 1);
            }
        }
        return html;
    }

    /**
     * 获取符号类型名称
     */
    private getSymbolKind(kind: vscode.SymbolKind): string {
        switch (kind) {
            case vscode.SymbolKind.Class:
                return 'class';
            case vscode.SymbolKind.Method:
                return 'method';
            case vscode.SymbolKind.Function:
                return 'function';
            case vscode.SymbolKind.Interface:
                return 'interface';
            case vscode.SymbolKind.Variable:
                return 'variable';
            case vscode.SymbolKind.Namespace:
                return 'namespace';
            case vscode.SymbolKind.Module:
                return 'module';
            case vscode.SymbolKind.Property:
                return 'property';
            case vscode.SymbolKind.Enum:
                return 'enum';
            case vscode.SymbolKind.Constructor:
                return 'constructor';
            default:
                return 'other';
        }
    }

    /**
     * 获取空面板 HTML
     */
    private getEmptyPanelHtml(): string {
        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>代码结构视图</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            text-align: center;
        }
    </style>
</head>
<body>
    <p>没有活动的编辑器或未找到代码结构</p>
</body>
</html>`;
    }

    /**
     * HTML 转义
     */
    private escapeHtml(text: string): string {
        const map: { [key: string]: string } = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }
}

