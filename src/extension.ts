import * as vscode from 'vscode';
import { CodeStructViewProvider } from './codeStructViewProvider';
import { TreeNodeDecorator } from './treeNodeDecorator';
import { MarkViewProvider } from './markViewProvider';
import { TagRuleConfig } from './tagRuleConfig';

/**
 * 扩展激活函数
 * @param context VSCode 扩展上下文
 */
export function activate(context: vscode.ExtensionContext) {
    console.log('CodeStructView 扩展已激活');

    // 设置扩展上下文（用于获取模板文件路径）
    TagRuleConfig.setExtensionContext(context);

    // 加载标签规则配置
    TagRuleConfig.loadConfig().then(() => {
        console.log('[activate] 标签规则配置已加载');
    }).catch(err => {
        console.error('[activate] 加载标签规则配置失败:', err);
    });

    // 监听配置文件变化
    TagRuleConfig.watchConfigFile(context);

    // 创建代码结构视图提供者（传递 context 用于持久化存储）
    const provider = new CodeStructViewProvider(context.extensionUri, context);

    // 创建并注册节点装饰器提供者
    const nodeDecorator = new TreeNodeDecorator();
    const decorationProvider = vscode.window.registerFileDecorationProvider(nodeDecorator);
    
    // 设置节点装饰器到提供者
    provider.setNodeDecorator(nodeDecorator);

    // 创建标记视图提供者
    const markProvider = new MarkViewProvider();
    markProvider.setStructProvider(provider);

    // 注册结构树视图
    const treeView = vscode.window.createTreeView('codeStructView', {
        treeDataProvider: provider,
        showCollapseAll: true
    });

    // 注册标记树视图
    const markView = vscode.window.createTreeView('codeMarkView', {
        treeDataProvider: markProvider,
        showCollapseAll: true
    });

    // 设置树视图引用
    provider.setTreeView(treeView);
    
    // 设置标记视图刷新回调，当标记变化时自动刷新标记视图
    provider.setMarkViewRefreshCallback(() => {
        markProvider.refresh();
    });

    // 注册显示面板命令
    const showPanelCommand = vscode.commands.registerCommand('codeStructView.showPanel', () => {
        provider.showPanel();
    });

    // 注册刷新命令
    const refreshCommand = vscode.commands.registerCommand('codeStructView.refresh', () => {
        provider.refresh();
    });

    // 注册标记命令（添加详细的调试日志）
    const markRedCommand = vscode.commands.registerCommand('codeStructView.markNodeRed', async (...args: any[]) => {
        console.log('[markNodeRed] 命令被调用，参数数量:', args.length);
        console.log('[markNodeRed] 参数详情:', JSON.stringify(args, null, 2));
        const node = args[0];
        console.log('[markNodeRed] 第一个参数（节点）:', node);
        console.log('[markNodeRed] 节点类型:', typeof node);
        console.log('[markNodeRed] 节点属性:', node ? Object.keys(node) : 'null');
        
        if (node && node.nodeUri) {
            console.log('[markNodeRed] 找到 nodeUri:', node.nodeUri.toString());
            await provider.markNode(node.nodeUri, CodeStructViewProvider.COLORS.RED.value);
        } else {
            console.warn('[markNodeRed] 节点无效或缺少 nodeUri');
            console.warn('[markNodeRed] 节点值:', node);
            console.warn('[markNodeRed] nodeUri 存在?', node && node.nodeUri ? '是' : '否');
        }
    });

    const markGreenCommand = vscode.commands.registerCommand('codeStructView.markNodeGreen', async (...args: any[]) => {
        console.log('[markNodeGreen] 命令被调用，参数:', args);
        const node = args[0];
        if (node && node.nodeUri) {
            await provider.markNode(node.nodeUri, CodeStructViewProvider.COLORS.GREEN.value);
        }
    });

    const markYellowCommand = vscode.commands.registerCommand('codeStructView.markNodeYellow', async (...args: any[]) => {
        console.log('[markNodeYellow] 命令被调用，参数:', args);
        const node = args[0];
        if (node && node.nodeUri) {
            await provider.markNode(node.nodeUri, CodeStructViewProvider.COLORS.YELLOW.value);
        }
    });

    const markBlueCommand = vscode.commands.registerCommand('codeStructView.markNodeBlue', async (...args: any[]) => {
        console.log('[markNodeBlue] 命令被调用，参数:', args);
        const node = args[0];
        if (node && node.nodeUri) {
            await provider.markNode(node.nodeUri, CodeStructViewProvider.COLORS.BLUE.value);
        }
    });

    const markPurpleCommand = vscode.commands.registerCommand('codeStructView.markNodePurple', async (...args: any[]) => {
        console.log('[markNodePurple] 命令被调用，参数:', args);
        const node = args[0];
        if (node && node.nodeUri) {
            await provider.markNode(node.nodeUri, CodeStructViewProvider.COLORS.PURPLE.value);
        }
    });

    // 注册移除标记命令
    const removeMarkCommand = vscode.commands.registerCommand('codeStructView.removeMark', async (...args: any[]) => {
        console.log('[removeMark] 命令被调用，参数:', args);
        const node = args[0];
        if (node && node.nodeUri) {
            await provider.removeNodeMark(node.nodeUri);
        }
    });

    // 注册清空所有标记命令
    const clearAllMarksCommand = vscode.commands.registerCommand('codeStructView.clearAllMarks', async () => {
        console.log('[clearAllMarks] 清空所有标记命令被调用');
        await provider.clearAllMarks();
        console.log('[clearAllMarks] 已清空所有标记');
    });

    // 注册创建配置文件命令
    const createConfigFileCommand = vscode.commands.registerCommand('codeStructView.createConfigFile', async () => {
        console.log('[createConfigFile] 创建配置文件命令被调用');
        await TagRuleConfig.createConfigFile();
        // 配置文件创建后，刷新视图以应用新的规则
        provider.refresh();
    });

    // 当工作区文件夹改变时，刷新视图
    const onDidChangeWorkspaceFolders = vscode.workspace.onDidChangeWorkspaceFolders(() => {
        provider.refresh();
    });

    // 当活动编辑器改变时，定位到对应的文件节点
    const onDidChangeActiveEditor = vscode.window.onDidChangeActiveTextEditor(async (editor) => {
        if (editor && editor.document.uri.scheme === 'file') {
            // 延迟一下，确保视图已经更新
            setTimeout(async () => {
                await provider.revealFile(editor.document.uri);
            }, 100);
        }
    });

    // 将所有订阅添加到上下文中
    context.subscriptions.push(
        treeView,
        markView,
        decorationProvider,
        showPanelCommand,
        refreshCommand,
        markRedCommand,
        markGreenCommand,
        markYellowCommand,
        markBlueCommand,
        markPurpleCommand,
        removeMarkCommand,
        clearAllMarksCommand,
        createConfigFileCommand,
        onDidChangeWorkspaceFolders,
        onDidChangeActiveEditor
    );
}

/**
 * 扩展停用函数
 */
export function deactivate() {
    console.log('CodeStructView 扩展已停用');
}

