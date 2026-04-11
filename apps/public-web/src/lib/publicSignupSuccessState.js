const signupSuccessStateStorageKey = "subook.public.signup-success";

export function saveSignupSuccessState(value) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(signupSuccessStateStorageKey, JSON.stringify(value));
}

export function loadSignupSuccessState() {
  if (typeof window === "undefined") {
    return null;
  }

  const rawValue = window.sessionStorage.getItem(signupSuccessStateStorageKey);

  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue);
  } catch (_error) {
    return null;
  }
}

export function clearSignupSuccessState() {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(signupSuccessStateStorageKey);
}
