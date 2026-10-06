import { useCallback, useEffect, useState } from "react";
import { loadAdminOperations } from "@shared-supabase/adminOperationsClient";

export function useAdminOperations(kind, params = {}) {
  const key = JSON.stringify(params);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({ data: null, loading: true, error: "" });
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    let active = true;
    setState({ data: null, loading: true, error: "" });
    loadAdminOperations(kind, JSON.parse(key)).then((data) => {
      if (active) setState({ data, loading: false, error: "" });
    }).catch((error) => { if (active) setState({ data: null, loading: false, error: error.message }); });
    return () => { active = false; };
  }, [kind, key, revision]);
  return { ...state, refresh };
}
