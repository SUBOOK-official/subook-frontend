import { Component } from "react";
import { isChunkLoadError, isChunkReloadPending } from "../lib/chunkReloadGuard";
import { Sentry } from "../lib/sentryInit";

/**
 * 어드민 Production 흰화면 사고 방지.
 * 자식 컴포넌트의 렌더링 에러를 잡아 폴백 화면을 보여주고
 * console + Sentry(DSN 설정 시)에 에러 전송.
 */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, eventId: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    if (isChunkReloadPending()) {
      return; // 스테일 청크 자동 새로고침 직전의 잔여 에러 — 리포트 불필요
    }
    console.error("[Admin ErrorBoundary] 렌더링 에러:", error, errorInfo);
    try {
      const eventId = Sentry?.captureException?.(error, {
        contexts: { react: { componentStack: errorInfo?.componentStack } },
        tags: { surface: "admin-web" },
      });
      if (eventId) {
        this.setState({ eventId: String(eventId).slice(0, 8) });
      }
    } catch {
      /* noop */
    }
  }

  handleReload = () => {
    window.location.assign("/admin");
  };

  handleRefresh = () => {
    window.location.reload();
  };

  handleCopyEventId = async () => {
    if (!this.state.eventId) return;
    try {
      await navigator.clipboard.writeText(this.state.eventId);
    } catch {
      /* noop */
    }
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    if (isChunkReloadPending()) {
      return null; // 곧 자동 새로고침 — 에러 화면 깜빡임 방지
    }

    // 스테일 청크 실패인데 자동 새로고침이 막힌 경우: 현재 화면 새로고침을 안내
    if (isChunkLoadError(this.state.error)) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8 text-center space-y-4">
            <h1 className="text-xl font-black text-slate-900">화면을 불러오지 못했습니다</h1>
            <p className="text-sm text-slate-600">
              네트워크 상태를 확인한 뒤 새로고침해 주세요.
            </p>
            <button
              type="button"
              onClick={this.handleRefresh}
              className="btn-primary !w-auto !px-6 !py-2 text-sm"
            >
              새로고침
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8 text-center space-y-4">
          <h1 className="text-xl font-black text-slate-900">일시적인 오류가 발생했습니다</h1>
          <p className="text-sm text-slate-600">
            어드민 화면을 불러오는 중 문제가 발생했습니다.<br />
            잠시 후 다시 시도하거나 개발팀에 문의해 주세요.
          </p>
          {this.state.eventId ? (
            <div className="text-xs text-slate-500 space-y-1">
              <p>
                오류 ID: <code className="font-mono font-bold text-slate-700">{this.state.eventId}</code>
              </p>
              <button
                type="button"
                onClick={this.handleCopyEventId}
                className="text-xs font-semibold text-blue-600 hover:underline"
              >
                오류 ID 복사 (슬랙 신고 시 첨부)
              </button>
            </div>
          ) : null}
          <button
            type="button"
            onClick={this.handleReload}
            className="btn-primary !w-auto !px-6 !py-2 text-sm"
          >
            어드민 메인으로
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
