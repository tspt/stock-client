/**
 * F10 单个区块的「懒加载 + IndexedDB 缓存」状态机（三个区块共用同一份实现）
 *
 * 行为约定：
 * 1. 抽屉打开 / 切换股票时**只读缓存**，不发任何请求；
 * 2. 命中缓存 → 直接展示（不做 TTL 过期判断，股东数据是季度级更新）；
 * 3. 未命中 → 停在「未加载」态（`data === null`），等用户点击「加载数据」；
 * 4. 点击加载 → 请求接口 → 写入缓存 → 展示；已有数据时同一个按钮变为「刷新」。
 *
 * 之所以把接口请求与缓存结构外置成 `adapter`：三个区块的缓存字段与
 * 请求参数各不相同（如十大流通股东要额外记录报告期），但状态机完全一致，
 * 用适配器隔离后状态机可以保持泛型且类型安全。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { F10CacheRecord } from '@/types/f10';
import { getF10Cache } from '@/utils/storage/f10IndexedDB';
import { logger } from '@/utils/business/logger';

/** 区块适配器：把「怎么取数 / 怎么读写自己的缓存字段」交给调用方 */
export interface F10SectionAdapter<T> {
  /** 请求接口（失败时抛异常） */
  fetchData: (code: string) => Promise<T[]>;
  /** 从缓存记录中取出本区块的缓存，无缓存返回 null */
  read: (record: F10CacheRecord) => { data: T[]; updatedAt: number } | null;
  /** 把最新数据写回缓存（只覆盖本区块） */
  write: (code: string, data: T[], updatedAt: number) => Promise<void>;
}

export interface UseF10SectionResult<T> {
  /** null = 尚未加载（既无缓存也没点过加载）；[] = 已加载但无数据 */
  data: T[] | null;
  /** 缓存写入时间（毫秒），未加载时为 null */
  updatedAt: number | null;
  loading: boolean;
  error: string | null;
  /** 加载 / 刷新 */
  load: () => void;
}

interface SectionState<T> {
  data: T[] | null;
  updatedAt: number | null;
  loading: boolean;
  error: string | null;
}

const EMPTY_STATE: SectionState<never> = {
  data: null,
  updatedAt: null,
  loading: false,
  error: null,
};

/**
 * @param code 统一格式股票代码（SH600000 / SZ000001）
 * @param enabled 是否启用（通常为抽屉是否打开）
 * @param adapter 区块适配器，必须是模块级常量以保持引用稳定
 */
export function useF10Section<T>(
  code: string,
  enabled: boolean,
  adapter: F10SectionAdapter<T>
): UseF10SectionResult<T> {
  const [state, setState] = useState<SectionState<T>>(EMPTY_STATE);

  /** 请求序号：股票切换 / 组件卸载后到达的旧响应一律丢弃 */
  const requestIdRef = useRef(0);

  // 打开抽屉或切换股票：清空状态并只读缓存（绝不自动发请求）
  useEffect(() => {
    requestIdRef.current += 1;
    setState(EMPTY_STATE);

    if (!enabled || !code) {
      return;
    }

    let cancelled = false;
    void (async () => {
      const record = await getF10Cache(code);
      if (cancelled) {
        return;
      }
      const cached = record ? adapter.read(record) : null;
      // 空数组也视为「无可用缓存」：避免一次空结果把区块永久锁死在空态
      if (!cached || cached.data.length === 0) {
        return;
      }
      setState({
        data: cached.data,
        updatedAt: cached.updatedAt,
        loading: false,
        error: null,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [code, enabled, adapter]);

  const load = useCallback(() => {
    if (!code) {
      return;
    }
    const requestId = (requestIdRef.current += 1);
    setState((prev) => ({ ...prev, loading: true, error: null }));

    void (async () => {
      try {
        const data = await adapter.fetchData(code);
        if (requestId !== requestIdRef.current) {
          return;
        }
        const updatedAt = Date.now();
        // 只缓存有内容的响应：空结果不写缓存，下次仍可由用户手动重试
        if (data.length > 0) {
          await adapter.write(code, data, updatedAt);
        }
        if (requestId !== requestIdRef.current) {
          return;
        }
        setState({ data, updatedAt, loading: false, error: null });
      } catch (error) {
        if (requestId !== requestIdRef.current) {
          return;
        }
        logger.error(`[useF10Section] ${code} 加载失败:`, error);
        setState({
          data: null,
          updatedAt: null,
          loading: false,
          error: error instanceof Error ? error.message : 'F10 数据加载失败',
        });
      }
    })();
  }, [code, adapter]);

  return { ...state, load };
}
