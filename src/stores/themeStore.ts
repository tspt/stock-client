/**
 * 主题状态管理
 */

import { create } from 'zustand';
import { getStorage, setStorage } from '@/utils/storage';
import { STORAGE_KEYS } from '@/utils/constants';

export type Theme = 'light' | 'dark';

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  loadTheme: () => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: 'light',

  setTheme: (theme) => {
    set({ theme });
    setStorage(STORAGE_KEYS.THEME, theme);
    // 更新HTML类名
    document.documentElement.setAttribute('data-theme', theme);
  },

  toggleTheme: () => {
    const { theme } = get();
    const newTheme = theme === 'light' ? 'dark' : 'light';
    get().setTheme(newTheme);
  },

  loadTheme: () => {
    const saved = getStorage<Theme>(STORAGE_KEYS.THEME, 'light');
    get().setTheme(saved);
  },
}));

