import assert from "node:assert/strict";
import test from "node:test";
import {
  createMemberGateRedirectState,
  normalizeMemberGateRedirectTarget,
} from "./publicMemberGateUtils.js";

test("normalizeMemberGateRedirectTarget uses the current location by default", () => {
  const target = normalizeMemberGateRedirectTarget(
    {
      pathname: "/store",
      search: "?subject=수학",
      hash: "#filters",
    },
    null,
  );

  assert.deepEqual(target, {
    pathname: "/store",
    search: "?subject=수학",
    hash: "#filters",
  });
});

test("normalizeMemberGateRedirectTarget parses string redirects with query and hash", () => {
  const target = normalizeMemberGateRedirectTarget(null, "/pickup/new?step=1#top");

  assert.deepEqual(target, {
    pathname: "/pickup/new",
    search: "?step=1",
    hash: "#top",
  });
});

test("createMemberGateRedirectState keeps the requested action and target path", () => {
  const state = createMemberGateRedirectState({
    actionType: "pickupRequest",
    location: {
      pathname: "/",
      search: "",
      hash: "",
    },
    redirectTo: "/pickup/new",
  });

  assert.deepEqual(state, {
    from: {
      pathname: "/pickup/new",
      search: "",
      hash: "",
    },
    memberGateAction: "pickupRequest",
  });
});
