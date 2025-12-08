/**
 * 主题管理Hook
 */

import { useEffect } from 'react';
import { useThemeStore } from '@/stores/themeStore';

/**
 * 主题管理Hook
 */
export function useTheme() {
  const { theme, setTheme, toggleTheme, loadTheme } = useThemeStore();

  // 初始化主题
  useEffect(() => {
    loadTheme();
  }, [loadTheme]);

  return {
    theme,
    setTheme,
    toggleTheme,
  };
}

