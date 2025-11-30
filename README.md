# CodeStructView

![Version](https://img.shields.io/badge/version-1.0.1-blue.svg)
![VS Code](https://img.shields.io/badge/VS%20Code-1.74.0+-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-4.9.4-blue.svg)
![Platform](https://img.shields.io/badge/platform-VS%20Code-orange.svg)

[![Author](https://img.shields.io/badge/author-odinsam-blue.svg)](https://www.odinsam.com)

一个强大的 VS Code 扩展，用于查看和管理代码结构，支持代码标记、标签规则自动标记等功能。

## 功能特性

### 📁 代码结构视图

- **文件树视图**：以树形结构显示工作区的文件和目录
- **代码元素解析**：自动解析代码文件，显示类、接口、方法、属性等代码元素
- **支持多种语言**：支持 C#、Java、JavaScript、TypeScript、Vue、HTML 等文件
- **快速导航**：点击代码元素节点快速跳转到对应代码位置
- **智能图标**：根据文件类型和代码元素类型显示相应的图标

### 🏷️ 代码标记功能

- **颜色标记**：为方法节点添加颜色标记（红色、绿色、黄色、蓝色、紫色）
- **右键标记**：在方法节点上右键选择颜色进行标记
- **标记面板**：独立的"标记"视图，显示整个工程中所有标记的方法
- **标记分组**：标记面板按类分组显示，便于管理
- **标记持久化**：标记信息保存在工作区状态中，关闭 VS Code 后重新打开仍然保留

### 🔖 标签规则自动标记

- **配置文件**：在项目根目录创建 `.codeStructView` 配置文件
- **自动匹配**：当方法注释以配置的标签开头时，自动应用颜色标记和文字样式
- **文字样式**：支持粗体、斜体、删除线、下划线等文字样式（显示为文本标记）
- **智能缓存**：自动标记结果会被缓存，提升性能

### 📋 其他功能

- **刷新功能**：手动刷新代码结构视图和标记视图
- **清空标记**：一键清空所有标记
- **工作区独立**：每个工作区的标记数据独立存储，互不影响

## 安装

### 从 VSIX 安装

1. 下载 `.vsix` 文件
2. 在 VS Code 中打开命令面板（`Ctrl+Shift+P` / `Cmd+Shift+P`）
3. 输入 `Extensions: Install from VSIX...`
4. 选择下载的 `.vsix` 文件进行安装

### 从源代码安装

1. 克隆或下载本项目
2. 在项目目录下运行：
   ```bash
   npm install
   npm run compile
   ```
3. 按 `F5` 启动扩展开发宿主进行测试
4. 或使用 `vsce package` 打包为 `.vsix` 文件

## 使用说明

### 查看代码结构

1. 在左侧活动栏找到"代码结构"视图容器
2. 展开"代码结构"面板，查看文件和目录树
3. 点击文件节点展开，查看代码元素（类、方法等）
4. 点击代码元素节点，编辑器会自动跳转到对应位置

### 标记方法

1. 在代码结构视图中，找到要标记的方法节点
2. 右键点击方法节点
3. 选择"标记" → 选择颜色（红色、绿色、黄色、蓝色、紫色）
4. 方法节点前面会显示对应颜色的标记图标

### 查看所有标记

1. 在"代码结构"视图容器中，找到"标记"面板
2. 标记面板显示整个工程中所有标记的方法
3. 标记按类分组显示，每个类下显示该类的所有标记方法
4. 点击标记项可以跳转到对应的方法代码

### 清空所有标记

1. 在代码结构视图的空白处右键
2. 选择"清空所有标记"
3. 或在命令面板执行"清空所有标记"命令

### 配置标签规则

1. **创建配置文件**：
   - 在代码结构视图的标题栏点击"新增配置文件"按钮
   - 或在视图空白处右键选择"新增配置文件"
   - 系统会在项目根目录创建 `.codeStructView` 文件

2. **编辑配置文件**：
   ```json
   [
       {
           "tag": "todo",
           "color": "#FF2D00",
           "strikethrough": false,
           "underline": false,
           "bold": false,
           "italic": false
       },
       {
           "tag": "fixme",
           "color": "#FFFF00",
           "bold": true,
           "italic": true,
           "strikethrough": false,
           "underline": false
       }
   ]
   ```

3. **配置说明**：
   - `tag`: 标签名称（如 "todo"、"fixme"）
   - `color`: 标记颜色（十六进制格式，如 "#FF2D00"）
   - `bold`: 是否使用粗体样式
   - `italic`: 是否使用斜体样式
   - `strikethrough`: 是否使用删除线样式
   - `underline`: 是否使用下划线样式

4. **自动应用**：
   - 当方法注释以配置的标签开头时（如 `// todo: 需要完成的功能`）
   - 会自动应用对应的颜色标记和文字样式
   - 修改配置文件后，视图会自动刷新应用新规则

## 支持的文件类型

- C# (`.cs`)
- Java (`.java`)
- JavaScript (`.js`)
- TypeScript (`.ts`)
- Vue (`.vue`)
- HTML (`.html`)

## 标记颜色说明

| 颜色 | 标记图标 | 颜色值 |
|------|---------|--------|
| 红色 | 🔴 | #FF0000 |
| 绿色 | 🟢 | #00FF00 |
| 黄色 | 🟡 | #FFFF00 |
| 蓝色 | 🔵 | #0000FF |
| 紫色 | 🟣 | #800080 |

对于配置文件中自定义的颜色值，系统会智能匹配最接近的预定义颜色。

## 项目结构

```
CodeStructView/
├── src/
│   ├── extension.ts                  # 扩展主入口
│   ├── codeStructViewProvider.ts     # 代码结构视图提供者
│   ├── markViewProvider.ts           # 标记视图提供者
│   ├── fileStructureParser.ts        # 文件结构解析器
│   ├── tagRuleConfig.ts              # 标签规则配置管理
│   ├── treeNodeDecorator.ts          # 树节点装饰器
│   ├── iconManager.ts                # 图标管理器
│   ├── template/
│   │   └── .codeStructView           # 配置文件模板
│   └── parsers/                      # 语言解析器
│       ├── BaseParser.ts
│       ├── CSharpParser.ts
│       ├── JavaParser.ts
│       ├── JavaScriptParser.ts
│       ├── VueParser.ts
│       └── ...
├── package.json                      # 扩展配置
├── tsconfig.json                     # TypeScript 配置
└── README.md                         # 说明文档
```

## 开发说明

### 编译项目

```bash
# 安装依赖
npm install

# 编译 TypeScript
npm run compile

# 监听模式编译
npm run watch
```

### 打包扩展

```bash
# 安装 vsce
npm install -g vsce

# 打包（Gitee 仓库需要使用完整 URL）
vsce package --baseContentUrl https://gitee.com/odinsam/vse_code-struct-view/raw/master --baseImagesUrl https://gitee.com/odinsam/vse_code-struct-view/raw/master

# 或直接打包（如果 README 中已使用完整 URL）
vsce package
```

### 调试

1. 在 VS Code 中打开项目
2. 按 `F5` 启动扩展开发宿主
3. 在新窗口中测试扩展功能

## 技术栈

- **TypeScript**: 主要开发语言
- **VS Code API**: 扩展开发 API
- **TreeView API**: 树形视图实现
- **FileSystemWatcher**: 文件监听

## 版本历史

### v1.0.0

- ✨ 代码结构视图：显示文件和代码元素树
- ✨ 代码标记功能：支持为方法节点添加颜色标记
- ✨ 标记视图：显示所有标记的方法
- ✨ 标签规则配置：支持通过配置文件自动标记
- ✨ 自动标记：根据方法注释自动应用标记和样式
- ✨ 标记持久化：标记信息保存到工作区状态
- ✨ 多语言支持：支持 C#、Java、JavaScript、TypeScript、Vue、HTML

## 许可证

查看 [LICENSE](https://gitee.com/odinsam/vse_code-struct-view/blob/master/LICENSE) 文件了解详情。

## 贡献

欢迎提交 Issue 和 Pull Request！
