import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 标签规则配置接口
 */
export interface TagRule {
    tag: string;
    color: string;
    strikethrough: boolean;
    underline: boolean;
    bold: boolean;
    italic: boolean;
}

/**
 * 标签规则配置管理器
 */
export class TagRuleConfig {
    private static readonly CONFIG_FILE_NAME = '.codeStructView';
    private static extensionContext: vscode.ExtensionContext | undefined;
    private static tagRules: TagRule[] = [];
    private static configWatcher: vscode.FileSystemWatcher | undefined;

    /**
     * 设置扩展上下文（用于获取模板文件路径）
     */
    static setExtensionContext(context: vscode.ExtensionContext): void {
        TagRuleConfig.extensionContext = context;
    }

    /**
     * 获取模板文件路径
     */
    private static getTemplatePath(): string {
        if (!TagRuleConfig.extensionContext) {
            throw new Error('扩展上下文未设置');
        }
        return path.join(TagRuleConfig.extensionContext.extensionPath, 'src', 'template', TagRuleConfig.CONFIG_FILE_NAME);
    }

    /**
     * 获取配置文件的路径
     */
    private static getConfigFilePath(): string | undefined {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return undefined;
        }
        // 使用第一个工作区文件夹的根目录
        return path.join(workspaceFolders[0].uri.fsPath, TagRuleConfig.CONFIG_FILE_NAME);
    }

    /**
     * 创建配置文件（从模板复制）
     */
    static async createConfigFile(): Promise<void> {
        const configPath = this.getConfigFilePath();
        if (!configPath) {
            vscode.window.showErrorMessage('未找到工作区文件夹');
            return;
        }

        // 检查配置文件是否已存在
        if (fs.existsSync(configPath)) {
            const result = await vscode.window.showWarningMessage(
                '配置文件已存在，是否要覆盖？',
                { modal: true },
                '覆盖',
                '取消'
            );
            if (result !== '覆盖') {
                return;
            }
        }

        try {
            // 读取模板文件
            const templatePath = this.getTemplatePath();
            if (!fs.existsSync(templatePath)) {
                vscode.window.showErrorMessage(`模板文件不存在: ${templatePath}`);
                return;
            }
            const templateContent = fs.readFileSync(templatePath, 'utf-8');
            // 写入配置文件
            fs.writeFileSync(configPath, templateContent, 'utf-8');
            console.log(`[TagRuleConfig] 配置文件已创建: ${configPath}`);
            vscode.window.showInformationMessage(`配置文件已创建: ${TagRuleConfig.CONFIG_FILE_NAME}`);
            // 重新加载配置
            await this.loadConfig();
        } catch (error: any) {
            console.error(`[TagRuleConfig] 创建配置文件失败:`, error);
            vscode.window.showErrorMessage(`创建配置文件失败: ${error.message}`);
        }
    }

    /**
     * 加载配置文件
     */
    static async loadConfig(): Promise<void> {
        const configPath = this.getConfigFilePath();
        if (!configPath) {
            TagRuleConfig.tagRules = [];
            return;
        }

        // 检查配置文件是否存在
        if (!fs.existsSync(configPath)) {
            TagRuleConfig.tagRules = [];
            console.log(`[TagRuleConfig] 配置文件不存在: ${configPath}`);
            return;
        }

        try {
            // 读取配置文件
            const content = fs.readFileSync(configPath, 'utf-8');
            const rules = JSON.parse(content) as TagRule[];
            
            // 验证配置格式
            if (!Array.isArray(rules)) {
                throw new Error('配置文件格式错误：根元素必须是数组');
            }

            // 验证每个规则
            const validRules: TagRule[] = [];
            for (const rule of rules) {
                if (this.validateRule(rule)) {
                    validRules.push(rule);
                } else {
                    console.warn(`[TagRuleConfig] 跳过无效的规则:`, rule);
                }
            }

            TagRuleConfig.tagRules = validRules;
            console.log(`[TagRuleConfig] 已加载 ${validRules.length} 个标签规则`);
        } catch (error: any) {
            console.error(`[TagRuleConfig] 加载配置文件失败:`, error);
            TagRuleConfig.tagRules = [];
            vscode.window.showErrorMessage(`加载配置文件失败: ${error.message}`);
        }
    }

    /**
     * 验证规则格式
     */
    private static validateRule(rule: any): rule is TagRule {
        return (
            typeof rule === 'object' &&
            typeof rule.tag === 'string' &&
            typeof rule.color === 'string' &&
            /^#[0-9A-Fa-f]{6}$/.test(rule.color) &&
            typeof rule.strikethrough === 'boolean' &&
            typeof rule.underline === 'boolean' &&
            typeof rule.bold === 'boolean' &&
            typeof rule.italic === 'boolean'
        );
    }

    /**
     * 获取所有标签规则
     */
    static getTagRules(): TagRule[] {
        return [...TagRuleConfig.tagRules];
    }

    /**
     * 根据注释匹配标签规则
     */
    static matchTagRule(comment: string | undefined): TagRule | undefined {
        if (!comment) {
            return undefined;
        }

        // 去除注释符号和空格
        let cleanedComment = comment.trim();
        
        // 移除开头的空格
        while (cleanedComment.startsWith(' ')) {
            cleanedComment = cleanedComment.substring(1).trim();
        }
        
        // 移除开头的斜杠（包括多个连续的斜杠）
        while (cleanedComment.startsWith('/')) {
            cleanedComment = cleanedComment.substring(1).trim();
        }
        
        // 移除开头的星号（包括多个连续的星号）
        while (cleanedComment.startsWith('*')) {
            cleanedComment = cleanedComment.substring(1).trim();
        }
        
        // 再次移除可能残留的开头空格
        while (cleanedComment.startsWith(' ')) {
            cleanedComment = cleanedComment.substring(1).trim();
        }
        
        // 转为小写用于匹配
        cleanedComment = cleanedComment.toLowerCase();
        
        // 检查每个规则
        for (const rule of TagRuleConfig.tagRules) {
            const tag = rule.tag.toLowerCase();
            // 检查注释是否以标签开头（忽略大小写，忽略空白字符）
            if (cleanedComment.startsWith(tag)) {
                // 确保标签后面是空白字符、冒号或结束，避免部分匹配
                const nextChar = cleanedComment[tag.length];
                if (!nextChar || nextChar === ' ' || nextChar === ':' || nextChar === '\t') {
                    return rule;
                }
            }
        }

        return undefined;
    }

    /**
     * 监听配置文件变化
     */
    static watchConfigFile(context: vscode.ExtensionContext): void {
        // 如果已经有监听器，先销毁
        if (TagRuleConfig.configWatcher) {
            TagRuleConfig.configWatcher.dispose();
        }

        const configPath = this.getConfigFilePath();
        if (!configPath) {
            return;
        }

        // 创建文件监听器
        TagRuleConfig.configWatcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(path.dirname(configPath), TagRuleConfig.CONFIG_FILE_NAME)
        );

        // 监听文件变化
        TagRuleConfig.configWatcher.onDidChange(async () => {
            console.log('[TagRuleConfig] 配置文件已更改，重新加载');
            await TagRuleConfig.loadConfig();
            // 通知视图刷新（通过事件）
            vscode.commands.executeCommand('codeStructView.refresh');
        });

        TagRuleConfig.configWatcher.onDidCreate(async () => {
            console.log('[TagRuleConfig] 配置文件已创建，重新加载');
            await TagRuleConfig.loadConfig();
            // 通知视图刷新
            vscode.commands.executeCommand('codeStructView.refresh');
        });

        TagRuleConfig.configWatcher.onDidDelete(async () => {
            console.log('[TagRuleConfig] 配置文件已删除，清空规则');
            TagRuleConfig.tagRules = [];
            // 通知视图刷新
            vscode.commands.executeCommand('codeStructView.refresh');
        });

        // 将监听器添加到上下文
        context.subscriptions.push(TagRuleConfig.configWatcher);
    }

    /**
     * 将颜色值转换为颜色名称（用于匹配预定义颜色）
     */
    static colorToColorName(color: string): string | undefined {
        // 颜色映射表（与 CodeStructViewProvider.COLORS 保持一致）
        const colorMap: { [key: string]: string } = {
            '#FF0000': 'red',
            '#00FF00': 'green',
            '#FFFF00': 'yellow',
            '#0000FF': 'blue',
            '#800080': 'purple'
        };
        return colorMap[color.toUpperCase()];
    }
}

