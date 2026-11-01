/** 首屏：DOM 更新后的下一帧打 `list-rendered`，startTime 从导航起算。 */
export function markListRenderedOnNextFrame() {
  requestAnimationFrame(() => {
    performance.mark('list-rendered')
  })
}

/** 单次操作：`op-start` 到下一帧的 `op-end`，measure 名为 `op`。 */
export function markOperationStart() {
  performance.clearMarks('op-start')
  performance.clearMarks('op-end')
  performance.mark('op-start')
}

export function markOperationEndOnNextFrame() {
  requestAnimationFrame(() => {
    if (performance.getEntriesByName('op-start').length === 0) return
    performance.mark('op-end')
    performance.measure('op', 'op-start', 'op-end')
  })
}
