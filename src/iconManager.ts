import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 图标主题配置接口
 */
interface IconThemeConfig {
    iconDefinitions: {
        [key: string]: {
            iconPath: string;
        };
    };
    file?: string;
    fileExtensions?: {
        [ext: string]: string;
    };
    fileNames?: {
        [name: string]: string;
    };
}

/**
 * 图标管理器
 */
export class IconManager {
    private static config: IconThemeConfig | null = null;
    private static extensionUri: vscode.Uri | null = null;

    /**
     * 初始化图标管理器
     */
    static initialize(extensionUri: vscode.Uri): void {
        this.extensionUri = extensionUri;
        this.loadConfig();
    }

    /**
     * 加载图标主题配置
     */
    private static loadConfig(): void {
        if (!this.extensionUri) {
            return;
        }

        try {
            const configPath = vscode.Uri.joinPath(this.extensionUri, 'fileicons', 'odinsam-icon-theme.json');
            let configContent = fs.readFileSync(configPath.fsPath, 'utf-8');
            
            // 移除 BOM (Byte Order Mark) 字符
            if (configContent.charCodeAt(0) === 0xFEFF) {
                configContent = configContent.slice(1);
            }
            
            // 移除其他可能的不可见字符
            configContent = configContent.trim();
            
            this.config = JSON.parse(configContent) as IconThemeConfig;
        } catch (error) {
            console.error('加载图标主题配置失败:', error);
            this.config = null;
        }
    }

    /**
     * 根据文件 URI 获取图标路径
     */
    static getIconPath(uri: vscode.Uri): vscode.Uri | vscode.ThemeIcon | undefined {
        if (!this.config || !this.extensionUri) {
            // 如果没有配置，返回默认图标
            return new vscode.ThemeIcon('file-code');
        }

        const fsPath = uri.fsPath;
        if (!fsPath || typeof fsPath !== 'string' || fsPath.length === 0) {
            return undefined;
        }
        const fileName = path.basename(fsPath);
        const ext = path.extname(uri.fsPath).toLowerCase().substring(1); // 去掉点号

        // 1. 先检查文件名匹配
        if (this.config.fileNames && this.config.fileNames[fileName]) {
            const iconKey = this.config.fileNames[fileName];
            return this.getIconUri(iconKey);
        }

        // 2. 检查文件扩展名匹配
        if (ext && this.config.fileExtensions && this.config.fileExtensions[ext]) {
            const iconKey = this.config.fileExtensions[ext];
            return this.getIconUri(iconKey);
        }

        // 3. 使用默认文件图标
        if (this.config.file) {
            return this.getIconUri(this.config.file);
        }

        // 4. 如果都没有，返回默认主题图标
        return new vscode.ThemeIcon('file-code');
    }

    /**
     * 根据图标键获取图标 URI
     */
    private static getIconUri(iconKey: string): vscode.Uri | undefined {
        if (!this.config || !this.extensionUri) {
            return undefined;
        }

        const iconDef = this.config.iconDefinitions[iconKey];
        if (!iconDef) {
            return undefined;
        }

        // 图标路径是相对于配置文件所在目录的
        const iconPath = iconDef.iconPath;
        // 去掉开头的 ./
        const relativePath = iconPath.startsWith('./') ? iconPath.substring(2) : iconPath;
        
        // 构建完整的图标路径
        return vscode.Uri.joinPath(this.extensionUri, 'fileicons', relativePath);
    }
}

