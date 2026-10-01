async function referralRpc(client, name, args = {}) {
  if (!client) throw new Error("서비스에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.");
  let lastError;
  // 연결/발급 모두 서버에서 멱등 처리하므로 응답 유실 시에도 안전하게 재시도한다.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const { data, error } = await client.rpc(name, args).abortSignal(controller.signal);
      if (error) throw error;
      return data;
    } catch (error) {
      lastError = error;
      if (/^(P0001|42501|23|PGRST20)/.test(error.code ?? "")) break;
    } finally { clearTimeout(timer); }
  }
  throw Object.assign(new Error(lastError?.code === "P0001" ? lastError.message : "초대 정보를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요."), { code: lastError?.code });
}

export const getSignupReferralOffer = (client, code = "") => referralRpc(client, "get_signup_referral_offer", { p_code: code || null });
export const getMySignupReferral = (client) => referralRpc(client, "get_my_signup_referral");
export const attachSignupReferral = (client, code) => referralRpc(client, "attach_signup_referral", { p_code: code });
export const completeSignupReferral = (client) => referralRpc(client, "complete_signup_referral");
