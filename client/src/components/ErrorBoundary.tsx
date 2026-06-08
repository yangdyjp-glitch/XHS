import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/**
 * 页面级错误边界：捕获子树渲染异常或懒加载 chunk 失败，
 * 显示可恢复的提示（而不是整个应用白屏），并打印真实错误便于排查。
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    // 保留控制台日志，方便下次复现时直接看到真实堆栈
    console.error("页面渲染出错:", error, info);
  }

  render() {
    const { error } = this.state;
    if (error) {
      // 懒加载 chunk 失败（网络波动 / 刚部署新版本导致旧文件名 404）
      const isChunkError = /Loading chunk|dynamically imported module|Failed to fetch|importing a module script failed/i.test(
        error.message || ""
      );
      return (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="eyebrow mb-2 text-[#991B1B]">页面出错</p>
          <h2 className="font-serif font-bold text-lg text-ink mb-2">
            {isChunkError ? "页面资源加载失败" : "页面渲染出错"}
          </h2>
          <p className="text-sm text-muted max-w-md mb-5">
            {isChunkError
              ? "可能是网络波动，或刚刚发布了新版本。点击下方按钮刷新即可恢复。"
              : "已捕获错误，可点击下方按钮刷新恢复。若反复出现请把下面的错误信息发给开发。"}
          </p>
          <pre className="text-[11px] text-muted bg-paper-alt border border-hairline px-3 py-2 rounded max-w-lg overflow-auto mb-5 text-left whitespace-pre-wrap">
            {error.message || "未知错误"}
          </pre>
          <button
            onClick={() => window.location.reload()}
            className="bg-ink text-card px-5 py-2 text-sm rounded-full hover:bg-ink-soft transition-colors"
          >
            刷新页面
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
