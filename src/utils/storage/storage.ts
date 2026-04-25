/**
 * LocalStorage工具函数
 */

import { logger } from '../business/logger';

/**
 * 获取存储的数据
 */
export function getStorage<T>(key: string, defaultValue: T): T {
  try {
    const item = localStorage.getItem(key);
    if (item === null) {
      return defaultValue;
    }
    return JSON.parse(item) as T;
  } catch (error) {
    logger.error(`Error reading from localStorage key "${key}":`, error);
    return defaultValue;
  }
}

/**
 * 设置存储的数据
 */
export function setStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    logger.error(`Error writing to localStorage key "${key}":`, error);
  }
}

/**
 * 删除存储的数据
 */
export function removeStorage(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    logger.error(`Error removing from localStorage key "${key}":`, error);
  }
}
