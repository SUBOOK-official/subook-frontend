export const AUTH_LOADING_TIMEOUT_MS = 30000;
export const AUTH_LOADING_ERROR_NOTICE = "로그인 정보를 확인하지 못했어요. 잠시 후 다시 로그인해 주세요.";

// getSession의 내부 잠금 대기도 제한한다. fetch의 abort만으로는 이 대기를 끝낼 수 없다.
export async function runAuthTask(task, timeoutMs = AUTH_LOADING_TIMEOUT_MS) {
  const controller = new AbortController();
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      const error = new Error(AUTH_LOADING_ERROR_NOTICE);
      error.code = "auth_loading_timeout";
      reject(error);
      controller.abort();
    }, timeoutMs);
  });
  try {
    return await Promise.race([Promise.resolve().then(() => task(controller.signal)), timeout]);
  } finally {
    clearTimeout(timeoutId);
  }
}
