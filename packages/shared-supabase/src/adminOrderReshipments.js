import { supabase } from './adminSupabaseClient.js';

export async function requestOrderReshipment(orderId, reshipmentAction, payload = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('인증이 만료되었습니다. 다시 로그인해 주세요.');
  let response;
  try {
    response = await fetch('/api/admin/cj-delivery', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ ...payload, orderId, reshipmentAction }), signal: AbortSignal.timeout(120_000),
    });
  } catch {
    // 발급 응답 유실 시 같은 requestKey를 유지. 새 발급 요청으로 재시도하지 않는다.
    throw new Error('서버 응답을 확인하지 못했습니다. 이력을 새로고침해 발급 여부를 확인해 주세요.');
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.detail || result.error || '재발송 정보를 확인하지 못했습니다.');
  if (reshipmentAction === 'list') {
    if (!Array.isArray(result.reshipments)) throw new Error('재발송 이력을 불러오지 못했습니다.');
    return result.reshipments;
  }
  const row = result.results?.[0];
  if (!row?.success) throw new Error(row?.error || '재발송 송장 처리에 실패했습니다.');
  return row;
}
