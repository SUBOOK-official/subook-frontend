import { Navigate } from "react-router-dom";

// 예전 주소(/admin/ilseong-app)로 들어오면 일성월심 앱 관리 화면의 학습지 보기로 보낸다.
// (판매 상품 만들기·판매 시작은 학습지의 3·4단계, 주문 확인은 학생·문의에 있다.)
export default function AdminIlseongAppPage() {
  return <Navigate replace to="/admin/ilseong?view=books" />;
}
