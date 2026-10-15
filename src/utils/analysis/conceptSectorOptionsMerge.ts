/**
 * 「概念分组」下拉选项合并。
 *
 * 概念板块选项来自东方财富接口（动态、可能阶段性缺项），而啤酒概念 / 酿酒概念 / 白酒
 * 是筛选时常用的固定板块，这里把固定板块置顶并去重合并进接口选项，保证：
 * 1. 接口缺项时这些板块依然可选；
 * 2. 选中后 Select 能显示中文名而不是裸代码（如 BK0477）。
 *
 * 边界：固定项与接口项按 code 去重，接口项的原有顺序保持不变。
 */

/** 合并「固定概念板块」与接口返回的概念板块选项 */
export function mergeConceptGroupSectorOptions(
  apiOptions: { label: string; value: string }[],
  fixedSectors: readonly { label: string; code: string }[]
): { label: string; value: string }[] {
  const merged: { label: string; value: string }[] = [];
  const seen = new Set<string>();

  fixedSectors.forEach((sector) => {
    if (!sector.code || seen.has(sector.code)) return;
    seen.add(sector.code);
    merged.push({ label: sector.label, value: sector.code });
  });

  apiOptions.forEach((option) => {
    if (!option.value || seen.has(option.value)) return;
    seen.add(option.value);
    merged.push(option);
  });

  return merged;
}
