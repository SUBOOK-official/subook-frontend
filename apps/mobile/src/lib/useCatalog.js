import { useEffect, useRef, useState } from "react";
import { buildMobileCatalogArgs, normalizeMobileProduct } from "../../../../packages/shared-domain/src/mobileCatalog.js";
import { catalogClient } from "./catalog.js";

export function useCatalog({ search, subject, sort }) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({ products: [], total: 0, loading: true, error: null });
  const active = useRef(null);
  const key = JSON.stringify([search, subject, sort, revision]);

  useEffect(() => {
    const request = { key, offset: 0, busy: false, controller: null, disposed: false, products: [], total: 0 };
    active.current = request;

    request.load = async () => {
      if (request.busy || request.disposed) return;
      request.busy = true;
      request.controller = new AbortController();
      setState({ products: request.products, total: request.total, loading: true, error: null });
      try {
        if (!catalogClient) throw new Error("교재 서비스 연결을 준비하고 있어요. 잠시 후 다시 방문해 주세요.");
        const rows = await catalogClient.list(buildMobileCatalogArgs({ search, subject, sort, offset: request.offset }), request.controller.signal);
        if (request.disposed) return;
        const incoming = rows.map(normalizeMobileProduct).filter(Boolean);
        request.products = [...new Map([...request.products, ...incoming].map((product) => [product.id, product])).values()];
        request.offset += rows.length;
        request.total = rows.length ? Number(rows[0].total_count) || request.offset : request.offset;
        setState({ products: request.products, total: request.total, loading: false, error: null });
      } catch (error) {
        if (!request.disposed) setState({ products: request.products, total: request.total, loading: false, error: error.message });
      } finally {
        request.busy = false;
      }
    };
    void request.load();
    return () => {
      request.disposed = true;
      request.controller?.abort();
    };
  }, [key, search, subject, sort]);

  return {
    ...state,
    refresh: () => setRevision((value) => value + 1),
    retry: () => active.current?.load(),
    loadMore: () => {
      const request = active.current;
      if (request?.key === key && request.offset < request.total) void request.load();
    },
  };
}
