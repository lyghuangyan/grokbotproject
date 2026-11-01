import type { Todo } from './model.ts'

/**
 * 统计文案只改这个文件。
 *
 * - 列表为空：不显示
 * - 还有未完成：桌面端「剩余 N 项 · 共 M 项」，宽度 ≤480px 只显示「剩余 N 项」
 * - 全部完成：桌面端和移动端都只显示「全部完成」，替换计数，不拼接
 */
export const allDoneLabel = '全部完成'

export type StatsText =
  | { visible: false }
  | { visible: true; wide: string; narrow: string }

export function formatStats(items: readonly Todo[]): StatsText {
  if (items.length === 0) return { visible: false }

  const remaining = items.reduce((count, item) => count + (item.completed ? 0 : 1), 0)
  if (remaining === 0) {
    return { visible: true, wide: allDoneLabel, narrow: allDoneLabel }
  }

  const total = items.length
  return {
    visible: true,
    wide: `剩余 ${remaining} 项 · 共 ${total} 项`,
    narrow: `剩余 ${remaining} 项`,
  }
}
