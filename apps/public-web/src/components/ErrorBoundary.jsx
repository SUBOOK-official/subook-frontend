import { Component } from "react";
import { isChunkLoadError, isChunkReloadPending } from "../lib/chunkReloadGuard";
import { trackContactClick, trackEvent, trackException, trackSelectContent } from "../lib/analytics";
import { Sentry } from "../lib/sentryInit";

/**
 * Production 흰화면 사고 방지.
 * 자식 컴포넌트의 렌더링 에러를 잡아서 사용자에게 폴백 화면을 보여주고
 * 콘솔 + Sentry(DSN 설정 시)에 에러를 전송한다.
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
      // GA4 — 배포 직후 스테일 청크 자동 새로고침 발생 빈도(사용자에겐 보이지 않는 복구)
      trackEvent("stale_chunk_auto_reload", { errorMessage: error?.message });
      return; // 스테일 청크 자동 새로고침 직전의 잔여 에러 — 리포트 불필요
    }
    console.error("[ErrorBoundary] 렌더링 에러 발생:", error, errorInfo);
    let eventId = null;
    try {
      eventId = Sentry?.captureException?.(error, {
        contexts: { react: { componentStack: errorInfo?.componentStack } },
      });
      if (eventId) {
        this.setState({ eventId: String(eventId).slice(0, 8) });
      }
    } catch {
      /* noop */
    }
    // GA4 exception(fatal) — 흰화면 사고. Sentry와 별개로 GA4 세션 지표와 엮어 본다.
    trackException("render_crash", {
      fatal: true,
      errorMessage: error?.message,
      isChunkError: isChunkLoadError(error),
      ...(eventId ? { errorId: String(eventId).slice(0, 8) } : {}),
    });
  }

  handleReload = () => {
    trackSelectContent("error_recovery", "home");
    window.location.assign("/");
  };

  handleRefresh = () => {
    trackSelectContent("error_recovery", "refresh");
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    if (isChunkReloadPending()) {
      return null; // 곧 자동 새로고침 — 에러 화면 깜빡임 방지
    }

    // 스테일 청크 실패인데 자동 새로고침이 막힌 경우(직전 재시도 실패 등):
    // 홈 이동 대신 현재 페이지 새로고침을 안내해 가려던 화면을 유지한다.
    if (isChunkLoadError(this.state.error)) {
      return (
        <div className="error-boundary">
          <div className="error-boundary__card">
            <h1>페이지를 불러오지 못했어요</h1>
            <p>네트워크 상태를 확인한 뒤 새로고침해 주세요.</p>
            <button
              type="button"
              onClick={this.handleRefresh}
              className="error-boundary__btn"
            >
              새로고침
            </button>
            <p className="error-boundary__hint">
              문제가 계속되면 <a
                href="mailto:subook2025@gmail.com"
                onClick={() => trackContactClick("email", "error_boundary")}
              >subook2025@gmail.com</a>으로 문의해 주세요.
              {this.state.eventId ? (
                <> (오류 ID: <code>{this.state.eventId}</code>)</>
              ) : null}
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="error-boundary">
        <div className="error-boundary__card">
          <h1>일시적인 문제가 발생했어요</h1>
          <p>
            페이지를 불러오는 중 오류가 발생했습니다.<br />
            잠시 후 다시 시도해 주세요.
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            className="error-boundary__btn"
          >
            홈으로 돌아가기
          </button>
          <p className="error-boundary__hint">
            문제가 계속되면 <a
                href="mailto:subook2025@gmail.com"
                onClick={() => trackContactClick("email", "error_boundary")}
              >subook2025@gmail.com</a>으로 문의해 주세요.
            {this.state.eventId ? (
              <> (오류 ID: <code>{this.state.eventId}</code>)</>
            ) : null}
          </p>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
