// 이전에는 1280px 이상 viewport에서 1920px 고정 프레임을 transform: scale로 축소했다.
// 하지만 1280–1440px 노트북에서 글꼴이 67~75%로 축소돼 가독성/접근성이 크게 저하되고,
// transform: scale 부모 안에서는 CSS sticky가 깨져 JS로 우회해야 하는 부채가 생겼다.
// 이제는 디자인이 자연스럽게 반응형으로 흐르도록 단일 layout 경로만 사용한다.
//
// 또한 로그인 상태에서 "/"에서만 다른 헤더를 띄우던 utility-replacement 분기도 제거.
// PublicSiteHeader가 인증 상태로 단일 경로 렌더링하므로 PageFrame은 순수한 main wrapper.
function PublicPageFrame({ children }) {
  return <main className="public-home">{children}</main>;
}

export default PublicPageFrame;
