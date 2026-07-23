import { KAKAO_CHANNEL_URL } from "../lib/supportChannels";
import "./KakaoChatButton.css";

// 오른쪽 하단 고정 카카오톡 문의 버튼 (전역).
function KakaoChatButton() {
  return (
    <a
      aria-label="카카오톡으로 문의하기"
      className="kakao-chat-fab"
      href={KAKAO_CHANNEL_URL}
      rel="noopener noreferrer"
      target="_blank"
    >
      <svg
        aria-hidden="true"
        fill="currentColor"
        height="24"
        viewBox="0 0 24 24"
        width="24"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M7.29117 20.8242L2 22L3.17581 16.7088C2.42544 15.3056 2 13.7025 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C10.2975 22 8.6944 21.5746 7.29117 20.8242Z" />
      </svg>
    </a>
  );
}

export default KakaoChatButton;
