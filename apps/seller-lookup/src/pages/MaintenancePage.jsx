import subookLogoUrl from "../assets/subook-logo.png";

const maintenanceEndDateText = "2026년 4월 7일";

function MaintenancePage() {
  return (
    <main className="maintenance-shell">
      <section className="maintenance-card animate-rise">
        <img alt="수북" className="maintenance-logo" src={subookLogoUrl} />
        <div className="maintenance-copy">
          <p className="maintenance-eyebrow">판매조회 서비스 점검 안내</p>
          <h1 className="maintenance-title">현재 사이트 점검 중입니다.</h1>
          <p className="maintenance-description">
            더 안정적인 서비스를 제공하기 위해 판매자 조회 서비스를 일시적으로 점검하고
            있습니다.
          </p>
          <div className="maintenance-panel">
            <p className="maintenance-panel-label">점검 종료 예정</p>
            <p className="maintenance-panel-date">{maintenanceEndDateText}까지</p>
          </div>
        </div>
      </section>
    </main>
  );
}

export default MaintenancePage;
