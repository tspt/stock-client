/**
 * 通知导航监听
 * 仅处理托盘/桌面通知点击后的页面跳转。
 */
export function initNotificationNavigation(onNavigate: (code: string) => void): () => void {
  if (!window.electronAPI) {
    return () => {};
  }

  window.electronAPI.onNavigateToStock(onNavigate);

  return () => {
    if (window.electronAPI) {
      window.electronAPI.removeNavigateToStockListener();
    }
  };
}
