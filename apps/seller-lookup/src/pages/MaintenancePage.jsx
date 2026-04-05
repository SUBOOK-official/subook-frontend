import subookLogoUrl from "../assets/수북 로고.png";

const maintenanceEndDateText = "2026년 4월 8일";

function MaintenancePage() {
  return (
    <main className="maintenance-shell">
      <section className="maintenance-card animate-rise">
        <div className="maintenance-badge">Seller Lookup Maintenance</div>
        <img alt="수북" className="maintenance-logo" src={subookLogoUrl} />
        <div className="maintenance-copy">
          <p className="maintenance-eyebrow">판매조회 서비스 점검 안내</p>
          <h1 className="maintenance-title">
            현재 사이트 점검 중입니다.
            <br />
            판매 조회가 잠시 중단되었습니다.
          </h1>
          <p className="maintenance-description">
            더 안정적인 판매 도서 재등록을 위해 seller.subook.kr 조회 서비스를 일시적으로
            점검하고 있습니다.
          </p>
          <div className="maintenance-panel">
            <p className="maintenance-panel-label">점검 종료 예정</p>
            <p className="maintenance-panel-date">{maintenanceEndDateText}까지</p>
          </div>
          <p className="maintenance-footnote">
            점검이 완료되면 기존 판매 조회 화면이 자동으로 다시 열립니다.
          </p>
        </div>
      </section>
    </main>
  );
}

export default MaintenancePage;
