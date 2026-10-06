import { beginAdminJob, updateAdminJob } from "@shared-supabase/adminOperationsClient";

// 기록 실패 때문에 이미 성공한 물류/사진 작업을 재실행하지 않는다.
export async function createAdminJobRecorder(options, onWarning) {
  const id = await beginAdminJob(options);
  let warned = false;
  const save = async (values) => {
    try { await updateAdminJob(id, values); }
    catch { if (!warned) onWarning?.("실제 처리와 별개로 작업 이력 갱신에 실패했습니다. 처리 화면에서 결과를 확인해 주세요.", "error"); warned = true; }
  };
  return {
    advance: (done, failures = []) => save({ done, failures }),
    finish: (done, failures = []) => save({ done, failures, status: done < options.total ? "interrupted" : failures.length ? (failures.length >= options.total ? "failed" : "partial") : "completed" }),
  };
}
