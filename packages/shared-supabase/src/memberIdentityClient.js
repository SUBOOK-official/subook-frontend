import { supabase } from "./publicSupabaseClient";

export const normalizeMemberPhone = (value) => String(value || "").replace(/\D/g, "").replace(/^820?10/, "010");
export const safeMemberNext = (value) => typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") ? value : "/";
export async function memberIdentityRpc(name, params) {
  if (!supabase) throw new Error("서비스에 연결할 수 없습니다.");
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw error;
  if (data?.success === false) throw new Error(data.error || "인증을 완료하지 못했습니다.");
  return data;
}
export async function getMemberIdentityPolicy() {
  if (!supabase) return { enabled: false, phone_signup_enabled: false };
  const { data, error } = await supabase.rpc("get_member_identity_policy");
  if (error?.code === "PGRST202") return { enabled: false, phone_signup_enabled: false };
  if (error) throw error;
  if (!data) throw new Error("인증 정책을 확인하지 못했습니다.");
  return data;
}
export async function sendMemberLoginOtp(phone) {
  const normalized = normalizeMemberPhone(phone);
  if (!/^010\d{8}$/.test(normalized)) throw new Error("010으로 시작하는 휴대폰 번호를 입력해 주세요.");
  const { error } = await supabase.auth.signInWithOtp({ phone: `+82${normalized.slice(1)}`, options: { shouldCreateUser: false } });
  if (error) throw new Error("인증번호를 보내지 못했어요. 번호를 확인하고 잠시 후 다시 시도해 주세요.");
}
export async function signupPhoneRequest(body) {
  const response = await fetch("/api/auth/signup-phone", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000),
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.error || "휴대폰 인증을 완료하지 못했습니다.");
  return result;
}
export async function verifyKakaoMemberPhone(session) {
  if (!session?.provider_token || !session.user?.identities?.some((item) => item.provider === "kakao")) return null;
  const response = await fetch("/api/auth/kakao-phone", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ providerToken: session.provider_token }), signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error("카카오 번호를 확인하지 못했습니다.");
  return response.json();
}
export async function verifyMemberLoginOtp(phone, code) {
  const { data, error } = await supabase.auth.verifyOtp({ phone: `+82${normalizeMemberPhone(phone).slice(1)}`, token: code, type: "sms" });
  if (error) throw new Error("인증번호가 일치하지 않거나 만료되었어요. 다시 확인해 주세요.");
  return data;
}
export async function bindMemberPhone(action = "bind", request = {}) {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error("다시 로그인해 주세요.");
  const response = await fetch("/api/auth/member-identity", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
    body: JSON.stringify({ action, ...request }), signal: AbortSignal.timeout(20000),
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.error || "계정 연결을 완료하지 못했습니다.");
  return result;
}
