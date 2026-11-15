function buildPageItems(currentPage, totalPages) {
  const items = [];

  for (let page = 1; page <= totalPages; page += 1) {
    const isBoundary = page === 1 || page === totalPages;
    const isNearCurrent = Math.abs(page - currentPage) <= 1;

    if (isBoundary || isNearCurrent) {
      items.push(page);
      continue;
    }

    if (items[items.length - 1] !== "...") {
      items.push("...");
    }
  }

  return items;
}

function AdminPagination({ currentPage, totalCount, pageSize, isLoading = false, onPageChange }) {
  const totalPages = Math.max(1, Math.ceil((totalCount || 0) / pageSize));

  if (totalPages <= 1) {
    return null;
  }

  const items = buildPageItems(currentPage, totalPages);

  const goTo = (page) => {
    if (!Number.isFinite(page)) return;
    const next = Math.min(totalPages, Math.max(1, page));
    if (next !== currentPage) {
      onPageChange(next);
      document.querySelector("[data-admin-content]")?.scrollIntoView({ block: "start" });
    }
  };

  return (
    <nav aria-label="페이지 이동" className="flex flex-wrap items-center justify-center gap-1 pt-2">
      <button
        aria-label="첫 페이지로"
        className="btn-secondary !w-auto !rounded-lg !px-2.5 !py-2 text-xs"
        disabled={currentPage === 1 || isLoading}
        onClick={() => goTo(1)}
        type="button"
      >
        «
      </button>
      <button
        className="btn-secondary !w-auto !rounded-lg !px-3 !py-2 text-xs"
        disabled={currentPage === 1 || isLoading}
        onClick={() => goTo(currentPage - 1)}
        type="button"
      >
        이전
      </button>

      {items.map((item, index) =>
        item === "..." ? (
          <span className="px-1 text-sm font-semibold text-slate-400" key={`ellipsis-${index}`}>
            ...
          </span>
        ) : (
          <button
            aria-current={item === currentPage ? "page" : undefined}
            className={`h-9 min-w-9 rounded-lg px-2 text-sm font-semibold tabular-nums transition-colors ${
              item === currentPage
                ? "bg-blue-50 text-blue-600"
                : "text-slate-600 hover:bg-slate-200"
            }`}
            disabled={isLoading}
            key={item}
            onClick={() => goTo(item)}
            type="button"
          >
            {item}
          </button>
        ),
      )}

      <button
        className="btn-secondary !w-auto !rounded-lg !px-3 !py-2 text-xs"
        disabled={currentPage === totalPages || isLoading}
        onClick={() => goTo(currentPage + 1)}
        type="button"
      >
        다음
      </button>
      <button
        aria-label="마지막 페이지로"
        className="btn-secondary !w-auto !rounded-lg !px-2.5 !py-2 text-xs"
        disabled={currentPage === totalPages || isLoading}
        onClick={() => goTo(totalPages)}
        type="button"
      >
        »
      </button>
    </nav>
  );
}

export default AdminPagination;
