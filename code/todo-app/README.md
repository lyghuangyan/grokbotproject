# 待办清单

Vite + React + TypeScript 单页应用。数据只存在浏览器 `localStorage`。`code/index.html` 是早期单文件原型，仍然保留。

## 环境

- Node.js 20 及以上（本机用 22 验证）
- npm 10 及以上

## 命令

在 `code/todo-app/` 下：

```bash
npm install
npm run dev      # 开发服务器
npm run build    # 类型检查并构建
npm run lint     # ESLint
npm test         # Vitest，一次跑完
```

## 目录

- `src/model.ts` — 长度、trim、零宽字符、emoji 截断
- `src/statsCopy.ts` — 统计文案（空列表隐藏、窄屏、全部完成）
- `src/storage/todoStorage.ts` — `todo-list:items` 读写、`.bak` 备份、`todo-list:probe` 探测
- `src/hooks/useTodos.ts` — 增删改；写入失败后本次会话停止再写
- `src/components/TodoApp.tsx` — 页面
- `src/perf.ts` — `performance.mark` / `measure`，终点是 DOM 更新后的下一帧
- `SELF-TEST.md` — 自测记录和 AC 覆盖

## 存储

| 键 | 用途 |
| --- | --- |
| `todo-list:items` | 待办数组 |
| `todo-list:items.bak` | 修复前的原始字符串，只留最近一次 |
| `todo-list:probe` | 加载时探测，写完立刻删除 |

加载时不可用、备份失败或任意写入失败后进入仅内存模式：提示条文案为「当前无法保存到本地，本次的修改不会被保存，关闭或刷新页面后将丢失。」本次会话不再写入，刷新后重新尝试。数据损坏修复成功不提示。多余字段和首尾空格不触发备份或写回。
