function createLocationSnapshot(location = {}) {
  return {
    pathname: location.pathname || "/",
    search: location.search || "",
    hash: location.hash || "",
  };
}

function parseRedirectPath(redirectPath) {
  if (!redirectPath || typeof redirectPath !== "string") {
    return createLocationSnapshot();
  }

  const [pathWithSearch, rawHash = ""] = redirectPath.split("#");
  const [pathname = "/", rawSearch = ""] = pathWithSearch.split("?");

  return {
    pathname: pathname || "/",
    search: rawSearch ? `?${rawSearch}` : "",
    hash: rawHash ? `#${rawHash}` : "",
  };
}

function normalizeMemberGateRedirectTarget(location, redirectTo = null) {
  if (!redirectTo) {
    return createLocationSnapshot(location);
  }

  if (typeof redirectTo === "string") {
    return parseRedirectPath(redirectTo);
  }

  return createLocationSnapshot(redirectTo);
}

function createMemberGateRedirectState({ actionType = "", location, redirectTo = null }) {
  return {
    from: normalizeMemberGateRedirectTarget(location, redirectTo),
    memberGateAction: actionType,
  };
}

export { createMemberGateRedirectState, normalizeMemberGateRedirectTarget };
