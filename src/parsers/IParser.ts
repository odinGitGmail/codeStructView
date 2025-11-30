import { CodeElement } from '../fileStructureParser';

/**
 * 文件解析器接口
 */
export interface IParser {
    /**
     * 解析文件内容
     * @param document 文档对象
     * @param lines 文件行数组
     * @returns 代码元素数组
     */
    parse(document: any, lines: string[]): Promise<CodeElement[]>;
}

