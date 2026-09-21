// Figma: CB7HZDmXA213GYEDgL450v / Product · Sold out (4:18, 4:35)
// 목록과 기획전에서 같은 품절 표시를 사용한다. 클릭 처리는 부모 상품 링크가 맡는다.
export default function ProductSoldOutLabel() {
  return (
    <div className="public-sold-out-label">
      <strong className="public-sold-out-label__title" aria-hidden="true">SOLD OUT</strong>
      <small className="public-sold-out-label__caption">품절</small>
    </div>
  );
}
