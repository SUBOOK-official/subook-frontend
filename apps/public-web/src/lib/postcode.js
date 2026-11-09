import { isSubookApp } from "./appBridge";

// 우편번호(주소) 검색 열기. 스크립트(window.daum.Postcode)는 호출하는 쪽에서 먼저 불러온다.
//  - 일반 브라우저: 기존처럼 새 창
//  - 수북 앱 안 웹 화면: 새 창을 띄울 수 없어 화면 위 레이어로 연다.
//    (우편번호 서비스 가이드가 WebView 기반 서비스에 권장하는 embed 방식
//     https://postcode.map.kakao.com/guide)
export function openPostcodeSearch(options = {}) {
  const Postcode = window.daum?.Postcode;
  if (!Postcode) throw new Error("POSTCODE_UNAVAILABLE");

  if (!isSubookApp()) {
    new Postcode(options).open();
    return;
  }

  const layer = document.createElement("div");
  layer.className = "public-postcode-layer";
  layer.setAttribute("role", "dialog");
  layer.setAttribute("aria-modal", "true");
  layer.setAttribute("aria-label", "주소 검색");
  // 가이드 권고: iOS WebView는 position:fixed 안쪽 스크롤에서 입력이 어긋날 수 있어 absolute로 띄운다.
  layer.style.top = `${window.scrollY}px`;
  layer.style.height = `${window.innerHeight}px`;

  const bar = document.createElement("div");
  bar.className = "public-postcode-layer__bar";
  const title = document.createElement("strong");
  title.textContent = "주소 검색";
  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.textContent = "닫기";
  bar.append(title, closeButton);

  const body = document.createElement("div");
  body.className = "public-postcode-layer__body";
  layer.append(bar, body);

  const previousOverflow = document.body.style.overflow;
  const close = () => {
    layer.remove();
    document.body.style.overflow = previousOverflow;
  };
  closeButton.addEventListener("click", close);
  document.body.style.overflow = "hidden";
  document.body.appendChild(layer);

  new Postcode({
    ...options,
    width: "100%",
    height: "100%",
    oncomplete: (data) => {
      close();
      options.oncomplete?.(data);
    },
  }).embed(body, { autoClose: false });
}
