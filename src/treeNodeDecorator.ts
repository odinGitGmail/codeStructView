import * as vscode from 'vscode';
import { CodeElementType, AccessModifier, CodeElement } from './fileStructureParser';

/**
 * 节点装饰规则配置
 */
export interface NodeDecorationRule {
    /**
     * 节点类型匹配规则（支持多种类型）
     */
    nodeTypes?: CodeElementType[];
    
    /**
     * 访问修饰符匹配规则（支持多种修饰符）
     */
    accessModifiers?: AccessModifier[];
    
    /**
     * 节点名称匹配规则（支持正则表达式）
     */
    namePattern?: string;
    
    /**
     * 是否匹配有注释的节点
     */
    hasComment?: boolean;
    
    /**
     * 装饰颜色（十六进制颜色值，如 #ff0000）
     */
    color: string;
    
    /**
     * 工具提示文本（可选）
     */
    tooltip?: string;
}

/**
 * 树节点装饰器提供者
 * 用于为特定的树节点设置装饰颜色
 */
export class TreeNodeDecorator implements vscode.FileDecorationProvider {
    private _onDidChangeFileDecorations: vscode.EventEmitter<vscode.Uri | vscode.Uri[]> = new vscode.EventEmitter<vscode.Uri | vscode.Uri[]>();
    readonly onDidChangeFileDecorations: vscode.Event<vscode.Uri | vscode.Uri[]> = this._onDidChangeFileDecorations.event;

    // 节点URI到装饰规则的映射
    private nodeDecorations: Map<string, NodeDecorationRule> = new Map();

    /**
     * 提供文件装饰（实现FileDecorationProvider接口）
     */
    provideFileDecoration(uri: vscode.Uri, token: vscode.CancellationToken): vscode.ProviderResult<vscode.FileDecoration> {
        const uriString = uri.toString();
        const rule = this.nodeDecorations.get(uriString);
        
        if (!rule) {
            return undefined;
        }

        // 返回装饰信息
        // 注意：FileDecoration主要影响资源管理器视图，对于自定义TreeView可能不生效
        // 但我们可以尝试设置，如果VS Code支持的话
        // FileDecoration的color需要使用ThemeColor，但我们保存的是十六进制颜色值
        // 这里我们返回一个基本的装饰，实际的颜色效果需要通过其他方式实现
        return {
            badge: '',
            // color属性在FileDecoration中是可选的，且需要是ThemeColor类型
            // 由于我们使用的是自定义颜色，这里不设置color，而是通过其他方式实现视觉效果
            tooltip: rule.tooltip || `装饰节点: ${rule.color}`
        };
    }

    /**
     * 注册节点装饰规则
     * @param nodeUri 节点URI
     * @param rule 装饰规则
     */
    registerNodeDecoration(nodeUri: string, rule: NodeDecorationRule): void {
        this.nodeDecorations.set(nodeUri, rule);
        this._onDidChangeFileDecorations.fire(vscode.Uri.parse(nodeUri));
    }

    /**
     * 移除节点装饰规则
     * @param nodeUri 节点URI
     */
    unregisterNodeDecoration(nodeUri: string): void {
        if (this.nodeDecorations.delete(nodeUri)) {
            this._onDidChangeFileDecorations.fire(vscode.Uri.parse(nodeUri));
        }
    }

    /**
     * 清空所有装饰规则
     */
    clearAllDecorations(): void {
        const uris = Array.from(this.nodeDecorations.keys()).map(uri => vscode.Uri.parse(uri));
        this.nodeDecorations.clear();
        if (uris.length > 0) {
            this._onDidChangeFileDecorations.fire(uris);
        }
    }

    /**
     * 获取节点的装饰规则
     */
    getNodeDecorationRule(nodeUri: string): NodeDecorationRule | undefined {
        return this.nodeDecorations.get(nodeUri);
    }

    /**
     * 根据代码元素和规则检查是否需要装饰
     * @param element 代码元素
     * @param rule 装饰规则
     * @returns 是否匹配规则
     */
    static matchesRule(element: CodeElement, rule: NodeDecorationRule): boolean {
        // 检查节点类型
        if (rule.nodeTypes && rule.nodeTypes.length > 0) {
            if (!rule.nodeTypes.includes(element.type)) {
                return false;
            }
        }

        // 检查访问修饰符
        if (rule.accessModifiers && rule.accessModifiers.length > 0) {
            if (!rule.accessModifiers.includes(element.accessModifier)) {
                return false;
            }
        }

        // 检查名称模式（正则表达式）
        if (rule.namePattern) {
            try {
                const regex = new RegExp(rule.namePattern);
                if (!regex.test(element.name)) {
                    return false;
                }
            } catch (error) {
                console.error('装饰规则名称模式正则表达式错误:', error);
                return false;
            }
        }

        // 检查是否有注释
        if (rule.hasComment !== undefined) {
            const hasComment = !!element.comment;
            if (rule.hasComment !== hasComment) {
                return false;
            }
        }

        return true;
    }

    /**
     * 从配置中加载装饰规则
     * @param config VS Code配置
     * @returns 装饰规则列表
     */
    static loadRulesFromConfig(config: vscode.WorkspaceConfiguration): NodeDecorationRule[] {
        const rules: NodeDecorationRule[] = [];
        const configRules = config.get<NodeDecorationRule[]>('nodeDecorationRules', []);

        for (const configRule of configRules) {
            // 转换节点类型字符串为枚举
            if (configRule.nodeTypes) {
                configRule.nodeTypes = configRule.nodeTypes.map(type => type as CodeElementType);
            }

            // 转换访问修饰符字符串为枚举
            if (configRule.accessModifiers) {
                configRule.accessModifiers = configRule.accessModifiers.map(mod => mod as AccessModifier);
            }

            rules.push(configRule);
        }

        return rules;
    }
}

