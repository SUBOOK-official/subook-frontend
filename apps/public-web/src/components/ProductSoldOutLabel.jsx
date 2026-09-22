// 상품 목록의 품절 표시. 클릭 처리는 부모 상품 링크가 맡는다.
export default function ProductSoldOutLabel() {
  return (
    <div className="public-sold-out-label">
      <strong className="public-sold-out-label__title">SOLD OUT</strong>
    </div>
  );
}
