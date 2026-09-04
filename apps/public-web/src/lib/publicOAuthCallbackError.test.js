import assert from "node:assert/strict";
import test from "node:test";
import {
  buildOAuthCallbackErrorNotice,
  classifyOAuthCallbackError,
  parseOAuthCallbackError,
} from "./publicOAuthCallbackError.js";

test("parseOAuthCallbackError returns null when no error params", () => {
  assert.equal(parseOAuthCallbackError("", ""), null);
  assert.equal(parseOAuthCallbackError("?next=%2Fmypage", "#access_token=abc"), null);
});

test("parseOAuthCallbackError reads query-style params (PKCE)", () => {
  const parsed = parseOAuthCallbackError(
    "?next=%2F&error=server_error&error_code=email_exists&error_description=Email+address+already+registered",
    "",
  );
  assert.deepEqual(parsed, {
    error: "server_error",
    errorCode: "email_exists",
    errorDescription: "Email address already registered",
  });
});

test("parseOAuthCallbackError reads hash-style params (implicit)", () => {
  const parsed = parseOAuthCallbackError(
    "?next=%2F",
    "#error=access_denied&error_description=User+denied+access",
  );
  assert.equal(parsed.error, "access_denied");
  assert.equal(parsed.errorDescription, "User denied access");
});

test("buildOAuthCallbackErrorNotice maps already-registered cases", () => {
  const notice = buildOAuthCallbackErrorNotice({
    error: "server_error",
    errorCode: "email_exists",
    errorDescription: "",
  });
  assert.match(notice, /이미 가입된 이메일/);

  const byDescription = buildOAuthCallbackErrorNotice({
    error: "server_error",
    errorCode: "",
    errorDescription: "A user with this email address has already been registered",
  });
  assert.match(byDescription, /이미 가입된 이메일/);
});

test("buildOAuthCallbackErrorNotice maps missing-email consent case", () => {
  const notice = buildOAuthCallbackErrorNotice({
    error: "server_error",
    errorCode: "",
    errorDescription: "Error getting user email from external provider",
  });
  assert.match(notice, /이메일 정보를 받지 못해/);
  assert.match(notice, /동의/);
});

test("buildOAuthCallbackErrorNotice maps user cancellation", () => {
  const notice = buildOAuthCallbackErrorNotice({
    error: "access_denied",
    errorCode: "",
    errorDescription: "",
  });
  assert.match(notice, /취소/);
});

test("buildOAuthCallbackErrorNotice falls back to generic notice", () => {
  const withDescription = buildOAuthCallbackErrorNotice({
    error: "server_error",
    errorCode: "",
    errorDescription: "Unexpected failure",
  });
  assert.match(withDescription, /Unexpected failure/);

  const bare = buildOAuthCallbackErrorNotice({
    error: "server_error",
    errorCode: "",
    errorDescription: "",
  });
  assert.match(bare, /소셜 로그인에 실패했어요/);

  assert.equal(buildOAuthCallbackErrorNotice(null), "");
});

test("classifyOAuthCallbackError mirrors the notice branches", () => {
  assert.equal(
    classifyOAuthCallbackError({
      error: "server_error",
      errorCode: "email_exists",
      errorDescription: "",
    }),
    "already_registered",
  );
  assert.equal(
    classifyOAuthCallbackError({
      error: "server_error",
      errorCode: "",
      errorDescription: "A user with this email address has already been registered",
    }),
    "already_registered",
  );
  assert.equal(
    classifyOAuthCallbackError({
      error: "server_error",
      errorCode: "",
      errorDescription: "Error getting user email from external provider",
    }),
    "email_not_provided",
  );
  assert.equal(
    classifyOAuthCallbackError({
      error: "access_denied",
      errorCode: "",
      errorDescription: "",
    }),
    "user_cancelled",
  );
  assert.equal(
    classifyOAuthCallbackError({
      error: "server_error",
      errorCode: "",
      errorDescription: "Unexpected failure",
    }),
    "other",
  );
  assert.equal(classifyOAuthCallbackError(null), "");
});
