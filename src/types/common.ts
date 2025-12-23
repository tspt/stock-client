/**
 * 通用类型定义
 */

export interface ColumnConfig {
  /** 列key */
  key: string;
  /** 显示名称 */
  title: string;
  /** 是否可见 */
  visible: boolean;
  /** 顺序 */
  order: number;
  /** 宽度（可选） */
  width?: number;
}

export interface ColumnSettingsProps {
  visible: boolean;
  columns: ColumnConfig[];
  onOk: (columns: ColumnConfig[]) => void;
  onCancel: () => void;
  onReset: () => void;
  title?: string; // 可自定义标题
}
