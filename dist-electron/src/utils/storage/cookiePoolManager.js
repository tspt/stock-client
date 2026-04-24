/**
 * Cookie池管理器 - 单例模式
 * 负责Cookie的智能选择、健康管理和状态跟踪
 */
import { addCookie, getAllCookies, updateCookieHealth, removeCookie, clearAllCookies, } from './cookiePoolDB.js';
import { logger } from '../business/logger.js';
/**
 * Cookie池管理器类
 */
class CookiePoolManager {
    constructor() {
        Object.defineProperty(this, "cookies", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
        Object.defineProperty(this, "operationLogs", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "healthCheckInterval", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        Object.defineProperty(this, "isInitialized", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
    }
    /**
     * 获取单例实例
     */
    static getInstance() {
        if (!CookiePoolManager.instance) {
            CookiePoolManager.instance = new CookiePoolManager();
        }
        return CookiePoolManager.instance;
    }
    /**
     * 初始化 - 从IndexedDB加载Cookie
     */
    async initialize() {
        if (this.isInitialized) {
            logger.info('[CookiePool] 已经初始化，跳过');
            return;
        }
        try {
            const cookies = await getAllCookies();
            this.cookies.clear();
            cookies.forEach((cookie) => {
                this.cookies.set(cookie.id, cookie);
            });
            this.isInitialized = true;
            logger.info(`[CookiePool] 初始化完成，加载了 ${cookies.length} 个Cookie`);
            // 启动定时健康检查（可选）
            // this.startHealthCheck();
        }
        catch (error) {
            logger.error('[CookiePool] 初始化失败:', error);
            throw error;
        }
    }
    /**
     * 智能获取下一个Cookie
     * 策略：按健康评分排序，取前20个中随机选择一个，并应用冷却机制
     */
    getNextCookie() {
        const activeCookies = Array.from(this.cookies.values()).filter((c) => c.isActive);
        if (activeCookies.length === 0) {
            logger.warn('[CookiePool] 没有可用的活跃Cookie');
            return null;
        }
        // 按健康评分降序排序
        activeCookies.sort((a, b) => b.healthScore - a.healthScore);
        // 过滤掉还在冷却期的Cookie（30秒冷却时间）
        const now = Date.now();
        const COOLDOWN_TIME = 30 * 1000; // 30秒
        const availableCookies = activeCookies.filter((c) => {
            const timeSinceLastUse = now - c.lastUsedAt;
            return timeSinceLastUse >= COOLDOWN_TIME;
        });
        // 如果所有Cookie都在冷却期，则从所有活跃Cookie中选择（降级策略）
        const candidateCookies = availableCookies.length > 0 ? availableCookies : activeCookies;
        // 取前20个（或全部如果不足20个）
        const topCookies = candidateCookies.slice(0, 20);
        // 加权随机选择（健康评分高的被选中概率更大）
        const totalScore = topCookies.reduce((sum, c) => sum + c.healthScore, 0);
        let random = Math.random() * totalScore;
        let selected = topCookies[0];
        for (const cookie of topCookies) {
            random -= cookie.healthScore;
            if (random <= 0) {
                selected = cookie;
                break;
            }
        }
        // 更新最后使用时间
        selected.lastUsedAt = Date.now();
        this.cookies.set(selected.id, selected);
        logger.debug(`[CookiePool] 选择Cookie: ${selected.id.substring(0, 8)}..., 健康评分: ${selected.healthScore.toFixed(1)}`);
        return selected.value;
    }
    /**
     * 获取下一个Cookie及其对应的User-Agent（用于东方财富接口）
     * @returns { cookie: string, userAgent?: string } | null
     */
    getNextCookieWithUA() {
        const activeCookies = Array.from(this.cookies.values()).filter((c) => c.isActive);
        if (activeCookies.length === 0) {
            logger.warn('[CookiePool] 没有可用的活跃Cookie');
            return null;
        }
        // 按健康评分降序排序
        activeCookies.sort((a, b) => b.healthScore - a.healthScore);
        // 过滤掉还在冷却期的Cookie（30秒冷却时间）
        const now = Date.now();
        const COOLDOWN_TIME = 30 * 1000; // 30秒
        const availableCookies = activeCookies.filter((c) => {
            const timeSinceLastUse = now - c.lastUsedAt;
            return timeSinceLastUse >= COOLDOWN_TIME;
        });
        // 如果所有Cookie都在冷却期，则从所有活跃Cookie中选择（降级策略）
        const candidateCookies = availableCookies.length > 0 ? availableCookies : activeCookies;
        // 取前20个（或全部如果不足20个）
        const topCookies = candidateCookies.slice(0, 20);
        // 加权随机选择（健康评分高的被选中概率更大）
        const totalScore = topCookies.reduce((sum, c) => sum + c.healthScore, 0);
        let random = Math.random() * totalScore;
        let selected = topCookies[0];
        for (const cookie of topCookies) {
            random -= cookie.healthScore;
            if (random <= 0) {
                selected = cookie;
                break;
            }
        }
        // 更新最后使用时间
        selected.lastUsedAt = Date.now();
        this.cookies.set(selected.id, selected);
        logger.debug(`[CookiePool] 选择Cookie: ${selected.id.substring(0, 8)}..., UA: ${selected.userAgent || '未设置'}, 健康评分: ${selected.healthScore.toFixed(1)}`);
        return {
            cookie: selected.value,
            userAgent: selected.userAgent,
        };
    }
    /**
     * 报告Cookie使用成功
     */
    async reportSuccess(cookieValue) {
        const cookie = this.findCookieByValue(cookieValue);
        if (!cookie) {
            logger.warn('[CookiePool] 未找到对应的Cookie，无法报告成功');
            return;
        }
        try {
            await updateCookieHealth(cookie.id, true);
            // 更新内存中的数据
            cookie.successCount += 1;
            cookie.lastUsedAt = Date.now();
            // 重新计算健康评分
            this.recalculateHealthScore(cookie);
            this.cookies.set(cookie.id, cookie);
            this.addLog({
                timestamp: Date.now(),
                action: 'success',
                success: true,
                message: `Cookie使用成功`,
                cookieId: cookie.id,
            });
            logger.debug(`[CookiePool] Cookie ${cookie.id.substring(0, 8)}... 报告成功`);
        }
        catch (error) {
            logger.error('[CookiePool] 报告成功失败:', error);
        }
    }
    /**
     * 报告Cookie使用失败
     */
    async reportFailure(cookieValue) {
        const cookie = this.findCookieByValue(cookieValue);
        if (!cookie) {
            logger.warn('[CookiePool] 未找到对应的Cookie，无法报告失败');
            return;
        }
        try {
            await updateCookieHealth(cookie.id, false);
            // 更新内存中的数据
            cookie.failureCount += 1;
            cookie.lastUsedAt = Date.now();
            // 重新计算健康评分
            this.recalculateHealthScore(cookie);
            // 如果失败次数过多，标记为非活跃
            if (cookie.failureCount > 10 && cookie.successCount < 5) {
                cookie.isActive = false;
                logger.warn(`[CookiePool] Cookie ${cookie.id.substring(0, 8)}... 因失败次数过多被禁用`);
            }
            this.cookies.set(cookie.id, cookie);
            this.addLog({
                timestamp: Date.now(),
                action: 'failure',
                success: false,
                message: `Cookie使用失败，失败次数: ${cookie.failureCount}`,
                cookieId: cookie.id,
            });
            logger.debug(`[CookiePool] Cookie ${cookie.id.substring(0, 8)}... 报告失败`);
        }
        catch (error) {
            logger.error('[CookiePool] 报告失败失败:', error);
        }
    }
    /**
     * 添加单个Cookie（带UA信息）
     */
    async addCookieWithUA(cookieString, userAgent, source = 'manual') {
        try {
            // 验证Cookie格式
            if (!cookieString || cookieString.trim().length < 10) {
                logger.warn('[CookiePool] Cookie格式无效');
                return false;
            }
            // 生成唯一ID
            const id = `cookie_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
            const cookie = {
                id,
                value: cookieString.trim(),
                createdAt: Date.now(),
                lastUsedAt: 0,
                successCount: 0,
                failureCount: 0,
                isActive: true,
                healthScore: 100,
                userAgent: userAgent,
            };
            // 保存到IndexedDB
            await addCookie(cookie);
            // 更新内存
            this.cookies.set(id, cookie);
            this.addLog({
                timestamp: Date.now(),
                action: 'add',
                success: true,
                message: `添加Cookie（带UA）`,
                cookieId: id,
            });
            const sourceText = source === 'auto' ? '自动获取' : '手动添加';
            logger.info(`[CookiePool] ${sourceText}Cookie成功 (UA: ${userAgent.substring(0, 30)}...)`);
            return true;
        }
        catch (error) {
            logger.error('[CookiePool] 添加Cookie失败:', error);
            this.addLog({
                timestamp: Date.now(),
                action: 'add',
                success: false,
                message: `添加Cookie失败: ${error instanceof Error ? error.message : String(error)}`,
            });
            return false;
        }
    }
    /**
     * 手动添加Cookie
     * @param cookieString Cookie字符串
     * @param source 来源：'manual' | 'auto' （默认 manual）
     */
    async addCookieFromInput(cookieString, source = 'manual') {
        try {
            // 验证Cookie格式
            if (!cookieString || cookieString.trim().length < 10) {
                logger.warn('[CookiePool] Cookie格式无效');
                return false;
            }
            // 生成唯一ID
            const id = `cookie_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
            const cookie = {
                id,
                value: cookieString.trim(),
                createdAt: Date.now(),
                lastUsedAt: 0,
                successCount: 0,
                failureCount: 0,
                isActive: true,
                healthScore: 100,
            };
            // 保存到IndexedDB
            await addCookie(cookie);
            // 更新内存
            this.cookies.set(id, cookie);
            const sourceText = source === 'auto' ? '自动获取' : '手动添加';
            this.addLog({
                timestamp: Date.now(),
                action: 'add',
                success: true,
                message: `${sourceText}Cookie成功`,
                cookieId: id,
            });
            logger.info(`[CookiePool] 成功${sourceText}Cookie: ${id.substring(0, 8)}...`);
            return true;
        }
        catch (error) {
            logger.error('[CookiePool] 添加Cookie失败:', error);
            this.addLog({
                timestamp: Date.now(),
                action: 'add',
                success: false,
                message: `添加Cookie失败: ${error instanceof Error ? error.message : String(error)}`,
            });
            return false;
        }
    }
    /**
     * 批量添加Cookie
     * @param cookieStrings Cookie字符串数组
     * @param source 来源：'manual' | 'auto' （默认 manual）
     */
    async addCookiesBatch(cookieStrings, source = 'manual') {
        let successCount = 0;
        for (const cookieString of cookieStrings) {
            if (await this.addCookieFromInput(cookieString, source)) {
                successCount++;
            }
        }
        const sourceText = source === 'auto' ? '自动获取' : '手动添加';
        logger.info(`[CookiePool] 批量${sourceText}完成: ${successCount}/${cookieStrings.length} 成功`);
        return successCount;
    }
    /**
     * 删除Cookie
     */
    async removeCookie(cookieId) {
        try {
            await removeCookie(cookieId);
            this.cookies.delete(cookieId);
            this.addLog({
                timestamp: Date.now(),
                action: 'remove',
                success: true,
                message: `删除Cookie`,
                cookieId,
            });
            logger.info(`[CookiePool] 删除Cookie: ${cookieId.substring(0, 8)}...`);
            return true;
        }
        catch (error) {
            logger.error('[CookiePool] 删除Cookie失败:', error);
            return false;
        }
    }
    /**
     * 测试单个Cookie
     */
    async testCookie(cookieId) {
        const cookie = this.cookies.get(cookieId);
        if (!cookie) {
            logger.warn('[CookiePool] Cookie不存在，无法测试');
            return false;
        }
        try {
            // 使用Electron主进程测试，避免CORS限制
            const electronAPI = window.electronAPI;
            if (!electronAPI?.testCookie) {
                logger.error('[CookiePool] Electron API不可用');
                return false;
            }
            const result = await electronAPI.testCookie(cookie.value);
            if (!result.success) {
                throw new Error(result.error || '测试失败');
            }
            const isValid = result.isValid;
            if (isValid) {
                await this.reportSuccess(cookie.value);
            }
            else {
                await this.reportFailure(cookie.value);
            }
            this.addLog({
                timestamp: Date.now(),
                action: 'test',
                success: isValid,
                message: `测试Cookie: ${isValid ? '有效' : '无效'}`,
                cookieId,
            });
            return isValid;
        }
        catch (error) {
            await this.reportFailure(cookie.value);
            this.addLog({
                timestamp: Date.now(),
                action: 'test',
                success: false,
                message: `测试Cookie失败: ${error instanceof Error ? error.message : String(error)}`,
                cookieId,
            });
            return false;
        }
    }
    /**
     * 批量测试Cookie（并行执行）
     * @param concurrency 并发数，默认5
     */
    async testCookiesBatch(cookieIds, concurrency = 5) {
        const total = cookieIds.length;
        let completed = 0;
        logger.info(`[CookiePool] 开始批量测试 ${total} 个Cookie，并发数: ${concurrency}`);
        // 分批处理
        for (let i = 0; i < total; i += concurrency) {
            const batch = cookieIds.slice(i, i + concurrency);
            // 并行测试当前批次
            await Promise.all(batch.map(async (cookieId) => {
                try {
                    await this.testCookie(cookieId);
                }
                catch (error) {
                    logger.error(`[CookiePool] 测试Cookie ${cookieId} 异常:`, error);
                }
                finally {
                    completed++;
                    // 每完成10个输出一次进度
                    if (completed % 10 === 0 || completed === total) {
                        logger.info(`[CookiePool] 测试进度: ${completed}/${total} (${((completed / total) *
                            100).toFixed(1)}%)`);
                    }
                }
            }));
            // 批次间短暂暂停，避免请求过快
            if (i + concurrency < total) {
                await new Promise((resolve) => setTimeout(resolve, 200));
            }
        }
        logger.info('[CookiePool] 批量测试完成');
    }
    /**
     * 测试所有Cookie
     */
    async testAllCookies() {
        const cookies = Array.from(this.cookies.values());
        const cookieIds = cookies.map((c) => c.id);
        // 使用批量并行测试
        await this.testCookiesBatch(cookieIds, 5);
    }
    /**
     * 导出Cookie
     * @param filter 过滤条件：'all' | 'active' | 'inactive'
     * @param format 导出格式：'txt' | 'json'
     */
    async exportCookies(filter = 'all', format = 'json') {
        try {
            const { exportCookies: exportCookiesFromDB } = await import('./cookiePoolDB');
            const cookies = await exportCookiesFromDB(filter);
            if (cookies.length === 0) {
                throw new Error('没有可导出的Cookie');
            }
            let content;
            let mimeType;
            let extension;
            if (format === 'json') {
                // JSON格式 - 完整信息
                const exportData = {
                    exportDate: new Date().toISOString(),
                    version: '1.0',
                    filter,
                    total: cookies.length,
                    active: cookies.filter((c) => c.isActive).length,
                    cookies: cookies.map((c) => ({
                        id: c.id,
                        value: c.value,
                        createdAt: c.createdAt,
                        lastUsedAt: c.lastUsedAt,
                        successCount: c.successCount,
                        failureCount: c.failureCount,
                        isActive: c.isActive,
                        healthScore: c.healthScore,
                    })),
                };
                content = JSON.stringify(exportData, null, 2);
                mimeType = 'application/json';
                extension = 'json';
            }
            else {
                // 文本格式 - 简洁版
                const validCookies = cookies.filter((c) => c.value && c.value.trim().length > 0);
                if (validCookies.length === 0) {
                    throw new Error('没有有效的Cookie可导出');
                }
                const lines = [
                    `# Cookie池导出 - ${new Date().toLocaleString('zh-CN')}`,
                    `# 总数: ${validCookies.length}, 活跃: ${validCookies.filter((c) => c.isActive).length}, 失效: ${validCookies.filter((c) => !c.isActive).length}`,
                    `# 过滤条件: ${filter === 'all' ? '全部' : filter === 'active' ? '仅活跃' : '仅失效'}`,
                    '',
                    ...validCookies.map((c) => c.value),
                ];
                content = lines.join('\n');
                mimeType = 'text/plain';
                extension = 'txt';
            }
            // 生成文件名
            const timestamp = new Date()
                .toISOString()
                .replace(/[:.]/g, '-')
                .replace('T', '_')
                .substring(0, 19);
            const filename = `cookies_${filter}_${timestamp}.${extension}`;
            // 创建Blob
            const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
            // 附加文件名到Blob（某些浏览器支持）
            blob.name = filename;
            logger.info(`[CookiePool] 成功导出 ${cookies.length} 个Cookie (${format.toUpperCase()})`);
            return blob;
        }
        catch (error) {
            logger.error('[CookiePool] 导出Cookie失败:', error);
            throw error;
        }
    }
    /**
     * 导入Cookie
     * @param file JSON文件
     * @returns 导入结果
     */
    async importCookies(file) {
        try {
            // 验证文件类型
            if (!file.name.endsWith('.json')) {
                throw new Error('只支持JSON格式的Cookie文件');
            }
            // 读取文件内容
            const text = await file.text();
            let data;
            try {
                data = JSON.parse(text);
            }
            catch (error) {
                throw new Error('JSON格式错误，文件可能已损坏');
            }
            // 验证数据结构
            if (!data.cookies || !Array.isArray(data.cookies)) {
                throw new Error('无效的Cookie文件格式');
            }
            // 验证版本兼容性
            if (data.version && data.version !== '1.0') {
                logger.warn(`[CookiePool] 警告: 导入文件版本 ${data.version} 与当前版本 1.0 不匹配`);
            }
            // 检查数量上限
            const currentCount = this.cookies.size;
            const importCount = data.cookies.length;
            const { MAX_COOKIE_COUNT } = await import('../config/constants');
            if (currentCount + importCount > MAX_COOKIE_COUNT) {
                return {
                    successCount: 0,
                    skippedCount: importCount,
                    duplicateIds: [],
                    error: `导入后将超过上限（当前${currentCount}个 + 导入${importCount}个 > 上限${MAX_COOKIE_COUNT}个）`,
                };
            }
            // 转换数据格式
            const cookies = data.cookies.map((c) => ({
                id: c.id,
                value: c.value,
                createdAt: c.createdAt || Date.now(),
                lastUsedAt: c.lastUsedAt || 0,
                successCount: c.successCount || 0,
                failureCount: c.failureCount || 0,
                isActive: c.isActive !== undefined ? c.isActive : true,
                healthScore: c.healthScore !== undefined ? c.healthScore : 100,
            }));
            // 导入到数据库（自动跳过重复）
            const { importCookies: importCookiesToDB } = await import('./cookiePoolDB');
            const result = await importCookiesToDB(cookies, true);
            // 重新加载内存中的Cookie
            const { getAllCookies } = await import('./cookiePoolDB');
            const allCookies = await getAllCookies();
            this.cookies.clear();
            allCookies.forEach((cookie) => {
                this.cookies.set(cookie.id, cookie);
            });
            logger.info(`[CookiePool] 成功导入 ${result.successCount} 个Cookie，跳过 ${result.skippedCount} 个`);
            return result;
        }
        catch (error) {
            logger.error('[CookiePool] 导入Cookie失败:', error);
            throw error;
        }
    }
    /**
     * 获取统计信息
     */
    getStats() {
        const allCookies = Array.from(this.cookies.values());
        const activeCookies = allCookies.filter((c) => c.isActive);
        const totalCount = allCookies.length;
        const activeCount = activeCookies.length;
        const avgHealthScore = totalCount > 0 ? allCookies.reduce((sum, c) => sum + c.healthScore, 0) / totalCount : 0;
        const totalRequests = allCookies.reduce((sum, c) => sum + c.successCount + c.failureCount, 0);
        const totalSuccess = allCookies.reduce((sum, c) => sum + c.successCount, 0);
        const successRate = totalRequests > 0 ? totalSuccess / totalRequests : 0;
        return {
            totalCount,
            activeCount,
            avgHealthScore,
            totalRequests,
            successRate,
        };
    }
    /**
     * 获取所有Cookie
     */
    getAllCookies() {
        return Array.from(this.cookies.values());
    }
    /**
     * 获取操作日志
     */
    getOperationLogs(limit = 50) {
        return this.operationLogs.slice(-limit).reverse();
    }
    /**
     * 清空所有Cookie
     */
    async clearAll() {
        try {
            await clearAllCookies();
            this.cookies.clear();
            this.addLog({
                timestamp: Date.now(),
                action: 'remove',
                success: true,
                message: '清空所有Cookie',
            });
            logger.info('[CookiePool] 已清空所有Cookie');
            return true;
        }
        catch (error) {
            logger.error('[CookiePool] 清空Cookie失败:', error);
            return false;
        }
    }
    /**
     * 启动定时健康检查
     */
    startHealthCheck(intervalMs = 60 * 60 * 1000) {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }
        this.healthCheckInterval = setInterval(async () => {
            logger.info('[CookiePool] 执行定时健康检查');
            await this.testAllCookies();
        }, intervalMs);
        logger.info(`[CookiePool] 已启动定时健康检查，间隔: ${intervalMs / 1000 / 60}分钟`);
    }
    /**
     * 停止定时健康检查
     */
    stopHealthCheck() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
            logger.info('[CookiePool] 已停止定时健康检查');
        }
    }
    /**
     * 根据Cookie值查找Cookie条目
     */
    findCookieByValue(value) {
        for (const [, cookie] of this.cookies) {
            if (cookie.value === value) {
                return cookie;
            }
        }
        return undefined;
    }
    /**
     * 重新计算健康评分
     */
    recalculateHealthScore(cookie) {
        const totalRequests = cookie.successCount + cookie.failureCount;
        let score = 100;
        if (totalRequests > 0) {
            const successRate = cookie.successCount / totalRequests;
            score *= successRate;
        }
        // 年龄衰减：超过24小时每小时减1分
        const ageInHours = (Date.now() - cookie.createdAt) / (1000 * 60 * 60);
        if (ageInHours > 24) {
            score -= ageInHours - 24;
        }
        cookie.healthScore = Math.max(0, Math.min(100, score));
    }
    /**
     * 添加操作日志
     */
    addLog(log) {
        this.operationLogs.push(log);
        // 保留最近100条日志
        if (this.operationLogs.length > 100) {
            this.operationLogs = this.operationLogs.slice(-100);
        }
    }
}
Object.defineProperty(CookiePoolManager, "instance", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: null
});
export default CookiePoolManager;
