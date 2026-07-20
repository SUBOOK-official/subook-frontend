// 사이트 점검(도메인 전환) 안내 — VITE_MAINTENANCE=1 빌드에서만 노출.
// 라우터·컨텍스트 없이 단독 렌더되는 정적 화면 (전환 작업 중 어떤 경로로 들어와도 이것만 보임).
export default function MaintenancePage() {
  return (
    <div className="min-h-screen bg-public-secondary flex items-center justify-center px-6">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-sm border border-public-primary/10 px-8 py-12 text-center">
        <img
          src="/apple-touch-icon.png"
          alt="수북 SUBOOK"
          className="mx-auto mb-6 h-14 w-14 rounded-xl"
        />
        <h1 className="text-xl font-bold text-public-primary">
          사이트 리뉴얼 점검 중입니다
        </h1>
        <p className="mt-4 text-sm leading-6 text-public-primary/70">
          더 나은 수북으로 새단장하는 중이에요.
          <br />
          잠시 후 다시 방문해 주세요.
        </p>
        <p className="mt-8 text-xs text-public-primary/40">
          문의: subook2025@gmail.com
        </p>
      </div>
    </div>
  );
}
