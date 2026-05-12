import { Component } from "react";

/**
 * Production 흰화면 사고 방지.
 * 자식 컴포넌트의 렌더링 에러를 잡아서 사용자에게 폴백 화면을 보여주고
 * 콘솔에 에러 로그를 남긴다 (외부 Sentry 등 도입 전 임시).
 */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("[ErrorBoundary] 렌더링 에러 발생:", error, errorInfo);
  }

  handleReload = () => {
    window.location.assign("/");
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
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
            문제가 계속되면 <a href="mailto:subook2025@gmail.com">subook2025@gmail.com</a>으로 문의해 주세요.
          </p>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
