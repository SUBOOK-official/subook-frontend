import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { formatCurrency } from "@shared-domain/format";
import { couponScopeLabel } from "@shared-domain/coupons";
import PublicSiteHeader from "../components/PublicSiteHeader";
import ContentContainer from "../components/ContentContainer";
import ProductCard, { ProductCardSkeleton } from "../components/ProductCard";
import PublicFooter from "../components/PublicFooter";
import RefundItemPicker from "../components/RefundItemPicker";
import {
  CANCEL_REASON_CATEGORIES,
  ConfirmDialog,
  MypageEmptyState,
  MypageSectionHeader,
  ResponsiveSheet,
} from "../components/PublicMypageUi.jsx";
// 탈퇴 사유 선택지는 admin 통계 화면과 공유하므로 shared-domain이 원본.
import { WITHDRAWAL_REASON_CATEGORIES } from "@shared-domain/withdrawalReasons";
import PublicPageFrame from "../components/PublicPageFrame";
import PublicToastMessage from "../components/PublicToastMessage";
import {
  ArrowRightIcon,
  BellIcon,
  ChevronRightIcon,
  CoinIcon,
  HeartIcon,
  LockIcon,
  MapPinIcon,
  UserIcon,
} from "../components/icons";
import { supabase as publicSupabase } from "@shared-supabase/publicSupabaseClient";
import ReviewComposerSheet from "../components/ReviewComposerSheet";
import MypageReviews from "../components/MypageReviews";
import MypageRestockKeywords from "../components/MypageRestockKeywords";
import { PointsHistorySheet } from "../components/MypagePoints";
import { fetchMyReviews } from "../lib/publicReviews";
import { fetchMyPoints } from "../lib/publicPoints";
import { formatPoints, normalizeMyPoints } from "../lib/publicPointsUtils";
import { usePublicAuth } from "../contexts/PublicAuthContext";
import { usePublicWishlist } from "../contexts/PublicWishlistContext";
import usePublicMemberGate from "../lib/publicMemberGate";
import { usePageMeta } from "../lib/usePageMeta";
import { createDemoCoupons, resolvePortalIdentity } from "../lib/publicMypageDemo";
import {
  resetDemoPortalState,
  cancelMemberOrder,
  cancelMemberPickupRequest,
  checkMemberNicknameAvailability,
  confirmMemberPurchase,
  requestMemberRefund,
  createDisplayName,
  deleteMemberSettlementAccount,
  deleteMemberShippingAddress,
  loadMemberPortalSnapshot,
  requestMemberWithdrawal,
  saveMemberProfile,
  saveMemberSettlementAccount,
  saveMemberShippingAddress,
  setDefaultMemberSettlementAccount,
  setDefaultMemberShippingAddress,
} from "../lib/memberPortal";
import {
  BANK_OPTIONS,
  MAX_SAVED_ITEMS,
  SIDEBAR_GROUPS,
  buildAccountForm,
  buildAddressForm,
  buildCjTrackingUrl,
  buildProfileForm,
  findSidebarItem,
  getPortalHistoryIssue,
  formatCompactDate,
  getDefaultTabForMember,
  getTabKeyFromHash,
  initialAccountErrors,
  initialAccountForm,
  initialAddressErrors,
  initialAddressForm,
  initialNicknameStatus,
  initialProfileErrors,
  initialProfileForm,
  maskAccountNumber,
  sanitizeAccountNumberInput,
} from "../lib/publicMypageUtils";
import {
  makeOnceGuard,
  trackDeliveryTrackClick,
  trackDialogClose,
  trackEmptyState,
  trackEvent,
  trackException,
  trackFormAbandon,
  trackListFilterChange,
  trackPickupCtaClick,
  trackSelectContent,
  trackTabChange,
  trackViewItemList,
} from "../lib/analytics";
import { useInViewOnce } from "../lib/useInViewOnce";
import { formatPhoneNumber, hasValidPhoneNumber } from "../lib/publicAuthFormUtils";
import { fetchWishlistProducts } from "../lib/publicWishlist";
import {
  fetchMyRestockSubscribedProductIds,
  subscribeRestock,
  unsubscribeRestock,
} from "../lib/publicRestock";
import { PurchasesView, SalesTab, SettlementsTab } from "../components/MypageHistory";
import "./PublicMypagePage.css";
import "../components/MypageHistory.css";
import heartPlusIcon from "../assets/icons/heart-plus.png";
import couponIcon from "../assets/icons/coupon.png";
import accountIcon from "../assets/icons/account.png";

// 마이페이지 빈 상태(empty state)용 png 아이콘 렌더 헬퍼
function MypageEmptyIcon({ src }) {
  return <img src={src} alt="" aria-hidden="true" style={{ width: 48, height: 48, objectFit: "contain" }} />;
}

// 모바일 메뉴: 주요 거래 내역을 앞에 배치한 가로 탐색.
const MYPAGE_GRID_ITEMS = [
  { key: "purchases", label: "구매 내역" },
  { key: "sales", label: "판매 내역" },
  { key: "settlements", label: "정산 내역" },
  { key: "wishlist", label: "찜한 교재" },
  { key: "coupons", label: "쿠폰" },
  { key: "reviews", label: "내 리뷰" },
];

const WISHLIST_LIST_NAME = "마이페이지 찜한 교재";

const initialLoadedTabs = {
  sales: false,
  purchases: false,
  settlements: false,
  settings: false,
  wishlist: false,
  coupons: false,
};

const initialTabPhases = {
  sales: "idle",
  purchases: "idle",
  settlements: "idle",
  settings: "idle",
  wishlist: "idle",
  coupons: "idle",
};

// 사이드바 키(profile/addresses/settlement-account)를 데이터 로딩 키로 매핑.
// SettingsTab을 공유하는 키들은 모두 settings 데이터 슬롯을 쓴다.
function resolveDataKey(activeTabKey) {
  if (activeTabKey === "reviews") return "purchases";
  if (
    activeTabKey === "profile" ||
    activeTabKey === "addresses" ||
    activeTabKey === "settlement-account"
  ) {
    return "settings";
  }
  return activeTabKey;
}

const initialPortalState = {
  profile: null,
  dashboardSummary: null,
  shipments: [],
  recentShipments: [],
  orders: [],
  settlementSummary: null,
  completedSettlements: [],
  scheduledSettlements: [],
  shippingAddresses: [],
  settlementAccounts: [],
  sources: {},
};

const initialToastState = {
  message: "",
  tone: "info",
};

const initialConfirmState = {
  open: false,
  type: "",
  itemId: null,
  title: "",
  body: "",
  confirmLabel: "",
  confirmTone: "danger",
  reasonInput: false,
  reasonPlaceholder: "",
  reasonMinLength: 4,
};

function PublicMypagePage() {
  usePageMeta({ title: "마이페이지", noindex: true });

  const location = useLocation();
  const navigate = useNavigate();
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const isDemoPreview = searchParams.get("demo") === "1";
  const {
    accountRole,
    isAdminAccount,
    isAuthenticated,
    isConfigured,
    isLoading,
    profile,
    refreshProfile,
    signOut,
    user,
  } = usePublicAuth();
  const { favoriteIds, isWishlistLoading, toggleFavorite } = usePublicWishlist();
  const { requireMember, memberGateDialog } = usePublicMemberGate();

  const { user: effectiveUser, profile: effectiveProfile } = resolvePortalIdentity({ user, profile, demoMode: isDemoPreview });

  const [activeTabKey, setActiveTabKey] = useState(() => getTabKeyFromHash(location.hash));
  const [loadedTabs, setLoadedTabs] = useState(initialLoadedTabs);
  const [tabPhases, setTabPhases] = useState(initialTabPhases);
  const [portalLoadErrors, setPortalLoadErrors] = useState({});
  const [portalState, setPortalState] = useState(initialPortalState);
  const [toastState, setToastState] = useState(initialToastState);
  const [profileForm, setProfileForm] = useState(initialProfileForm);
  const [profileErrors, setProfileErrors] = useState(initialProfileErrors);
  const [isProfileEditing, setIsProfileEditing] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [nicknameStatus, setNicknameStatus] = useState(initialNicknameStatus);
  const [addressForm, setAddressForm] = useState(initialAddressForm);
  const [addressErrors, setAddressErrors] = useState(initialAddressErrors);
  const [isAddressSheetOpen, setIsAddressSheetOpen] = useState(false);
  const [isSavingAddress, setIsSavingAddress] = useState(false);
  const [isSearchingAddress, setIsSearchingAddress] = useState(false);
  const [accountForm, setAccountForm] = useState(initialAccountForm);
  const [accountErrors, setAccountErrors] = useState(initialAccountErrors);
  const [isAccountSheetOpen, setIsAccountSheetOpen] = useState(false);
  const [isSavingAccount, setIsSavingAccount] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [busyAddressId, setBusyAddressId] = useState(null);
  const [busyAccountId, setBusyAccountId] = useState(null);
  const [busyOrderId, setBusyOrderId] = useState(null);
  // 후기는 주문당 1개. 모든 탭에서 첫 리뷰 여부를 먼저 확인한다.
  const [myReviewsByOrderId, setMyReviewsByOrderId] = useState({});
  const [reviewsLoadState, setReviewsLoadState] = useState({ userId: null, phase: "loading", error: "" });
  const reviewsRequestRef = useRef(0);
  const demoReviewsRef = useRef({});
  const reviewsReady = reviewsLoadState.userId === effectiveUser?.id && reviewsLoadState.phase === "ready";
  const isFirstReview = reviewsReady && Object.keys(myReviewsByOrderId).length === 0;
  const [reviewComposer, setReviewComposer] = useState(null); // { order, review }
  // 포인트 (2026-09-02) — 후기 목록과 같은 타이밍에 로드
  const [myPoints, setMyPoints] = useState(() => normalizeMyPoints(null));
  const [isPointsSheetOpen, setIsPointsSheetOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [confirmState, setConfirmState] = useState(initialConfirmState);
  const [confirmReason, setConfirmReason] = useState("");
  const [confirmReasonCategory, setConfirmReasonCategory] = useState("");
  const [refundItemIds, setRefundItemIds] = useState([]);
  const [isConfirmBusy, setIsConfirmBusy] = useState(false);
  const [wishlistProducts, setWishlistProducts] = useState([]);
  const [wishlistError, setWishlistError] = useState("");
  const [isWishlistProductsLoading, setIsWishlistProductsLoading] = useState(false);
  // 찜 목록의 품절 카드에서 재입고 알림을 바로 신청/해제하기 위한 구독 상태.
  const [restockSubscribedIds, setRestockSubscribedIds] = useState(() => new Set());
  const [restockBusyProductId, setRestockBusyProductId] = useState(null);
  const [expandedShipmentId, setExpandedShipmentId] = useState(null);
  const tabPanelRef = useRef(null);
  const addressDetailInputRef = useRef(null);
  // GA4 탭 전환 계측용 — hash→tab 효과는 deps에 portalState가 있어 재실행되므로
  // 그쪽에서 발화하면 중복된다. activeTabKey만 보는 별도 효과에서 1회씩 남긴다.
  const lastTrackedTabRef = useRef(null);
  const tabEntryRef = useRef({ entry: "hash", uiSurface: null });
  // 데이터 로드·빈 상태 1회 발화 가드
  const mypageLoadGuardRef = useRef(makeOnceGuard());
  // 상단 프로필 '>' 메뉴 (회원정보 수정 / 주소록)
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef(null);

  const profileSnapshot = portalState.profile ?? effectiveProfile;
  const displayName = createDisplayName(profileSnapshot);
  const joinDateText = formatCompactDate(effectiveUser?.created_at ?? profileSnapshot?.created_at);
  const dataKey = resolveDataKey(activeTabKey);
  const portalLoadError = portalLoadErrors[dataKey] ?? "";
  const isPortalPending = tabPhases[dataKey] === "loading" && !portalState.profile;
  const currentNickname = (profileSnapshot?.nickname ?? profileSnapshot?.name ?? "").trim();
  const activeSidebarItem = findSidebarItem(activeTabKey);

  // 프로필 '>' 메뉴 바깥 클릭 시 닫기
  useEffect(() => {
    if (!isProfileMenuOpen) return undefined;
    const handleClick = (event) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target)) {
        setIsProfileMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isProfileMenuOpen]);

  useEffect(() => {
    // P1-4: hash가 비어있고 데이터가 로드되었으면 판매/구매 이력에 맞춰 기본 탭 결정.
    if (!location.hash || location.hash === "#") {
      if (portalState.profile) {
        setActiveTabKey(getDefaultTabForMember(portalState));
        return;
      }
    }
    setActiveTabKey(getTabKeyFromHash(location.hash));
  }, [location.hash, portalState]);

  // GA4 탭 전환 — 위 효과(portalState 의존)에서 발화하면 재실행마다 중복되므로 여기서만.
  // entry는 moveToTab 클릭이 채워두고(없으면 해시/기본 탭), 첫 진입은 initial로 남긴다.
  useEffect(() => {
    if (!activeTabKey || lastTrackedTabRef.current === activeTabKey) {
      return;
    }
    const previousTab = lastTrackedTabRef.current;
    lastTrackedTabRef.current = activeTabKey;
    const { entry, uiSurface } = tabEntryRef.current;
    trackTabChange("mypage", activeTabKey, {
      ...(previousTab ? { fromTab: previousTab } : {}),
      entry: previousTab ? entry : "initial",
      ...(uiSurface ? { uiSurface } : {}),
    });
    tabEntryRef.current = { entry: "hash", uiSurface: null };
  }, [activeTabKey]);

  // GA4 접근 거부 — 운영자/차단/탈퇴 계정이 마이페이지에서 튕기는 비율
  const accessDeniedTrackedRef = useRef(false);
  useEffect(() => {
    if (isLoading || isDemoPreview || isAuthenticated || accessDeniedTrackedRef.current) {
      return;
    }
    accessDeniedTrackedRef.current = true;
    trackEvent("mypage_access_denied", {
      accountRole: accountRole || "anonymous",
      isAdminAccount: Boolean(isAdminAccount),
    });
  }, [accountRole, isAdminAccount, isAuthenticated, isDemoPreview, isLoading]);

  useEffect(() => {
    if (!effectiveUser || loadedTabs[dataKey]) {
      return undefined;
    }

    let isCancelled = false;

    setTabPhases((currentValue) => ({
      ...currentValue,
      [dataKey]: "loading",
    }));

    setPortalLoadErrors((current) => ({ ...current, [dataKey]: "" }));
    const timerId = window.setTimeout(async () => {
      try {
        const snapshot = await loadMemberPortalSnapshot({
          user: effectiveUser,
          profile: effectiveProfile,
          demoMode: isDemoPreview,
        });

        if (isCancelled) {
          return;
        }

        setPortalState(snapshot);
        setProfileForm(buildProfileForm(snapshot.profile, effectiveUser));

        // GA4 데이터 로드 — 어느 소스에서 왔는지(local/empty면 조용한 폴백 상태)
        if (mypageLoadGuardRef.current(dataKey)) {
          const sources = snapshot.sources ?? {};
          trackEvent("mypage_load", {
            dataKey,
            profileSource: sources.profile,
            ordersSource: sources.orders,
            settlementsSource: sources.settlements,
            shipmentsSource: sources.recentShipments,
          });
          // supabase가 설정돼 있는데도 로컬 폴백/빈 소스로 떨어졌으면 조용한 장애다.
          const isDegraded = ["orders", "settlements", "recentShipments"].some(
            (key) => sources[key] === "local" || sources[key] === "fallback",
          );
          if (isDegraded && isConfigured && !isDemoPreview) {
            trackException("mypage_data_degraded", {
              dataKey,
              ordersSource: sources.orders,
              settlementsSource: sources.settlements,
              shipmentsSource: sources.recentShipments,
            });
          }
        }

        setLoadedTabs((currentValue) => ({
          ...currentValue,
          [dataKey]: true,
        }));
        setTabPhases((currentValue) => ({
          ...currentValue,
          [dataKey]: "ready",
        }));
        setExpandedShipmentId(null);
      } catch (error) {
        if (isCancelled) return;
        setPortalLoadErrors((current) => ({ ...current, [dataKey]: "내역을 불러오지 못했어요. 다시 시도해주세요." }));
        setLoadedTabs((current) => ({ ...current, [dataKey]: true }));
        setTabPhases((current) => ({ ...current, [dataKey]: "error" }));
        trackException("mypage_load_failed", { dataKey, errorMessage: error?.message ?? "" });
      }
    }, portalState.profile ? 120 : 0);

    return () => {
      isCancelled = true;
      window.clearTimeout(timerId);
    };
  }, [
    dataKey,
    effectiveProfile,
    effectiveUser,
    isConfigured,
    isDemoPreview,
    loadedTabs,
    portalState.profile,
  ]);

  useEffect(() => {
    let isCancelled = false;

    const wishlistRelevantKeys = new Set([
      "wishlist",
      "settings",
      "profile",
      "addresses",
      "settlement-account",
    ]);
    if (!wishlistRelevantKeys.has(activeTabKey)) {
      return undefined;
    }

    if (!effectiveUser) {
      setWishlistProducts([]);
      setWishlistError("");
      setIsWishlistProductsLoading(false);
      return undefined;
    }

    if (isDemoPreview || favoriteIds.length === 0) {
      setWishlistProducts([]);
      setWishlistError("");
      setIsWishlistProductsLoading(false);
      return undefined;
    }

    const loadWishlist = async () => {
      setIsWishlistProductsLoading(true);

      // 품절 카드의 "재입고 알림" 버튼 상태용 구독 목록도 함께 로드.
      // (데모 프리뷰는 실제 RPC가 없으므로 빈 집합 유지 → 버튼 미노출)
      const [result, restockResult] = await Promise.all([
        fetchWishlistProducts({
          user: effectiveUser,
          wishlistIds: favoriteIds,
          limit: favoriteIds.length,
          offset: 0,
        }),
        isDemoPreview
          ? Promise.resolve({ productIds: new Set(), error: null })
          : fetchMyRestockSubscribedProductIds(),
      ]);

      if (isCancelled) {
        return;
      }

      setWishlistProducts(result.products);
      setWishlistError(
        result.error ? "찜한 교재를 불러오지 못했어요. 잠시 후 다시 시도해 주세요." : "",
      );
      if (result.error) {
        // GA4 찜 목록 로드 실패
        trackException("wishlist_load_failed", {
          errorMessage: result.error.message ?? "",
          itemCount: favoriteIds.length,
        });
      }
      // 구독 목록 로드 실패는 치명적이지 않음 — 버튼이 "신청" 기본 상태로 보일 뿐.
      setRestockSubscribedIds(restockResult.productIds);
      setIsWishlistProductsLoading(false);
    };

    void loadWishlist();

    return () => {
      isCancelled = true;
    };
  }, [activeTabKey, effectiveUser, favoriteIds, isDemoPreview]);

  // 내 후기 목록 — 마이페이지 진입·탭 이동·작성 후 재조회. 실패를 '첫 리뷰'로 취급하지 않는다.
  const reloadMyReviews = useCallback(async () => {
    const requestId = ++reviewsRequestRef.current;
    setReviewsLoadState({ userId: effectiveUser?.id, phase: "loading", error: "" });
    if (!effectiveUser || isDemoPreview) {
      const demoReviews = isDemoPreview ? demoReviewsRef.current : {};
      setMyReviewsByOrderId({ ...demoReviews });
      const reviewRows = Object.values(demoReviews);
      setMyPoints(normalizeMyPoints({
        balance: reviewRows.reduce((sum, review) => sum + (review.earnedPoints || 0), 0),
        transactions: reviewRows.filter((review) => review.earnedPoints > 0).map((review, index) => ({
          id: index + 1, amount: review.earnedPoints, kind: "review_earn",
          order_number: review.orderNumber, created_at: review.createdAt,
        })),
      }));
      setReviewsLoadState({ userId: effectiveUser?.id, phase: "ready", error: "" });
      return;
    }
    const [result, pointsResult] = await Promise.all([
      fetchMyReviews().catch(() => ({ error: new Error("내 리뷰를 불러오지 못했어요.") })),
      fetchMyPoints().catch(() => ({ error: new Error("포인트를 불러오지 못했어요.") })),
    ]);
    if (requestId !== reviewsRequestRef.current) return;
    if (!pointsResult.error) {
      setMyPoints(pointsResult.points);
    }
    if (result.error) {
      setReviewsLoadState({ userId: effectiveUser.id, phase: "error", error: result.error.message });
      return;
    }
    const next = {};
    for (const review of result.reviews) {
      if (review.orderId != null) {
        next[review.orderId] = review;
      }
    }
    setMyReviewsByOrderId(next);
    setReviewsLoadState({ userId: effectiveUser.id, phase: "ready", error: "" });
  }, [effectiveUser, isDemoPreview]);

  useEffect(() => {
    void reloadMyReviews();
    return () => { reviewsRequestRef.current += 1; };
  }, [activeTabKey, reloadMyReviews]);

  // 찜 목록 품절 카드의 재입고 알림 신청/해제 토글.
  const handleToggleRestockAlert = async (productId) => {
    const productKey = String(productId);
    const isSubscribed = restockSubscribedIds.has(productKey);

    setRestockBusyProductId(productKey);
    // GA4 restock_subscribe/unsubscribe는 publicRestock 헬퍼가 발화한다(ui_surface만 전달).
    const result = isSubscribed
      ? await unsubscribeRestock(productId, { uiSurface: "wishlist_card" })
      : await subscribeRestock(productId, { uiSurface: "wishlist_card" });
    setRestockBusyProductId(null);

    if (result.error) {
      setToastState({
        message: "재입고 알림 처리에 실패했어요. 잠시 후 다시 시도해 주세요.",
        tone: "error",
      });
      trackException("restock_toggle_failed", {
        itemId: productKey,
        uiSurface: "wishlist_card",
        errorMessage: result.error.message ?? "",
      });
      return;
    }

    setRestockSubscribedIds((currentIds) => {
      const nextIds = new Set(currentIds);
      if (isSubscribed) {
        nextIds.delete(productKey);
      } else {
        nextIds.add(productKey);
      }
      return nextIds;
    });
    setToastState({
      message: isSubscribed
        ? "재입고 알림을 해제했어요."
        : "재입고 알림을 신청했어요. 다시 입고되면 알려드릴게요.",
      tone: "success",
    });
  };

  useEffect(() => {
    if (!isProfileEditing) {
      setNicknameStatus(initialNicknameStatus);
      return undefined;
    }

    const normalizedNickname = profileForm.nickname.trim();

    if (!normalizedNickname) {
      setNicknameStatus(initialNicknameStatus);
      return undefined;
    }

    if (normalizedNickname === currentNickname) {
      setNicknameStatus({
        state: "available",
        message: "현재 사용 중인 닉네임입니다.",
        tone: "info",
      });
      return undefined;
    }

    let isMounted = true;

    setNicknameStatus({
      state: "checking",
      message: "닉네임 사용 가능 여부를 확인하고 있어요.",
      tone: "info",
    });

    const timerId = window.setTimeout(async () => {
      const result = await checkMemberNicknameAvailability({
        user: effectiveUser,
        nickname: normalizedNickname,
      });

      if (!isMounted) {
        return;
      }

      if (!result.isAvailable) {
        setNicknameStatus({
          state: "duplicate",
          message: "이미 사용 중인 닉네임입니다.",
          tone: "error",
        });
        return;
      }

      setNicknameStatus({
        state: "available",
        message: result.verified ? "사용 가능한 닉네임입니다." : "저장 시 닉네임을 다시 확인합니다.",
        tone: result.verified ? "success" : "info",
      });
    }, 400);

    return () => {
      isMounted = false;
      window.clearTimeout(timerId);
    };
  }, [currentNickname, effectiveUser, isProfileEditing, profileForm.nickname]);

  const closeConfirmDialog = () => {
    setConfirmState(initialConfirmState);
    setConfirmReason("");
    setConfirmReasonCategory("");
    setRefundItemIds([]);
    setIsConfirmBusy(false);
  };

  const syncPortalState = async (nextToast = null) => {
    if (!effectiveUser) {
      return;
    }

    const snapshot = await loadMemberPortalSnapshot({
      user: effectiveUser,
      profile: profileSnapshot,
      demoMode: isDemoPreview,
    });

    setPortalState(snapshot);
    setProfileForm(buildProfileForm(snapshot.profile, effectiveUser));

    setExpandedShipmentId((current) => snapshot.shipments.some((shipment) => shipment.id === current) ? current : null);

    if (nextToast) {
      setToastState(nextToast);
    }
  };

  const moveToTab = (tabKey, options = {}) => {
    const { openProfileEdit = false, smoothScroll = true, uiSurface = null } = options;

    // GA4 — 실제 tab_change 발화는 activeTabKey 효과에서 1회. 여기서는 진입 경로만 남긴다.
    tabEntryRef.current = { entry: "click", uiSurface };

    setActiveTabKey(tabKey);
    navigate(
      {
        pathname: "/mypage",
        search: isDemoPreview ? "?demo=1" : "",
        hash: `#${tabKey}`,
      },
      { replace: false },
    );

    if (openProfileEdit) {
      setIsProfileEditing(true);
      setProfileErrors(initialProfileErrors);
    }

    if (!smoothScroll) {
      return;
    }

    window.setTimeout(() => {
      tabPanelRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 40);
  };

  const handleProfileChange = (key) => (event) => {
    const nextValue =
      key === "phone"
        ? formatPhoneNumber(event.target.value)
        : event.target.type === "checkbox"
          ? event.target.checked
          : event.target.value;

    setProfileForm((currentValue) => ({
      ...currentValue,
      [key]: nextValue,
    }));
    setProfileErrors((currentValue) => ({
      ...currentValue,
      [key]: "",
    }));
  };

  const handleAddressChange = (key) => (event) => {
    const nextValue =
      key === "recipient_phone"
        ? formatPhoneNumber(event.target.value)
        : event.target.type === "checkbox"
          ? event.target.checked
          : event.target.value;

    setAddressForm((currentValue) => ({
      ...currentValue,
      [key]: nextValue,
    }));
    setAddressErrors((currentValue) => ({
      ...currentValue,
      [key]: "",
    }));
  };

  const handleAccountChange = (key) => (event) => {
    const nextValue =
      key === "account_number"
        ? sanitizeAccountNumberInput(event.target.value)
        : event.target.type === "checkbox"
          ? event.target.checked
          : event.target.value;

    setAccountForm((currentValue) => ({
      ...currentValue,
      [key]: nextValue,
    }));
    setAccountErrors((currentValue) => ({
      ...currentValue,
      [key]: "",
    }));
  };

  const openAddressSheet = (address = null) => {
    if (!address && portalState.shippingAddresses.length >= MAX_SAVED_ITEMS) {
      setToastState({
        message: "최대 5개까지 등록할 수 있습니다.",
        tone: "error",
      });
      // GA4 등록 상한으로 막힘 — 5개 제한이 실제로 걸리는지
      trackEvent("address_limit_blocked", {
        savedCount: portalState.shippingAddresses.length,
      });
      return;
    }

    setAddressErrors(initialAddressErrors);
    setAddressForm(buildAddressForm(address, profileSnapshot));
    setIsAddressSheetOpen(true);
  };

  const closeAddressSheet = () => {
    setIsAddressSheetOpen(false);
    setAddressErrors(initialAddressErrors);
    setAddressForm(initialAddressForm);
    setIsSearchingAddress(false);
  };

  const openAccountSheet = (account = null) => {
    if (!account && portalState.settlementAccounts.length >= MAX_SAVED_ITEMS) {
      setToastState({
        message: "최대 5개까지 등록할 수 있습니다.",
        tone: "error",
      });
      // GA4 정산 계좌 등록 상한
      trackEvent("settlement_account_limit_blocked", {
        savedCount: portalState.settlementAccounts.length,
      });
      return;
    }

    setAccountErrors(initialAccountErrors);
    setAccountForm(buildAccountForm(account, profileSnapshot));
    setIsAccountSheetOpen(true);
  };

  const closeAccountSheet = () => {
    setIsAccountSheetOpen(false);
    setAccountErrors(initialAccountErrors);
    setAccountForm(initialAccountForm);
  };

  const validateProfile = async () => {
    const nextErrors = { ...initialProfileErrors };

    if (!profileForm.name.trim()) {
      nextErrors.name = "필수 항목입니다.";
    }

    if (!profileForm.phone.trim()) {
      nextErrors.phone = "필수 항목입니다.";
    } else if (!hasValidPhoneNumber(profileForm.phone)) {
      nextErrors.phone = "연락처 형식을 확인해 주세요.";
    }

    if (!profileForm.nickname.trim()) {
      nextErrors.nickname = "필수 항목입니다.";
    } else if (profileForm.nickname.trim() !== currentNickname) {
      const result = await checkMemberNicknameAvailability({
        user: effectiveUser,
        nickname: profileForm.nickname,
      });

      if (!result.isAvailable) {
        nextErrors.nickname = "이미 사용 중인 닉네임입니다.";
      }
    }

    setProfileErrors(nextErrors);
    // GA4에서 실패 필드를 남기기 위해 errors까지 함께 돌려준다.
    return {
      isValid: Object.values(nextErrors).every((value) => !value),
      errorField: Object.keys(nextErrors).find((key) => nextErrors[key]) ?? null,
    };
  };

  const validateAddress = () => {
    const nextErrors = { ...initialAddressErrors };

    if (!addressForm.label.trim()) {
      nextErrors.label = "필수 항목입니다.";
    }

    if (!addressForm.recipient_name.trim()) {
      nextErrors.recipient_name = "필수 항목입니다.";
    }

    if (!addressForm.recipient_phone.trim()) {
      nextErrors.recipient_phone = "필수 항목입니다.";
    } else if (!hasValidPhoneNumber(addressForm.recipient_phone)) {
      nextErrors.recipient_phone = "연락처 형식을 확인해 주세요.";
    }

    if (!addressForm.address_line1.trim()) {
      nextErrors.address_line1 = "주소 검색을 완료해 주세요.";
    }

    if (!addressForm.postal_code.trim()) {
      nextErrors.postal_code = "우편번호를 확인해 주세요.";
    }

    if (!addressForm.address_line2.trim()) {
      nextErrors.address_line2 = "상세 주소를 입력해 주세요.";
    }

    setAddressErrors(nextErrors);
    return {
      isValid: Object.values(nextErrors).every((value) => !value),
      errorField: Object.keys(nextErrors).find((key) => nextErrors[key]) ?? null,
    };
  };

  const validateAccount = () => {
    const nextErrors = { ...initialAccountErrors };

    if (!accountForm.bank_name.trim()) {
      nextErrors.bank_name = "필수 항목입니다.";
    }

    if (!accountForm.account_number.trim() && !accountForm.id) {
      nextErrors.account_number = "필수 항목입니다.";
    }

    if (!accountForm.account_holder.trim()) {
      nextErrors.account_holder = "필수 항목입니다.";
    }

    setAccountErrors(nextErrors);
    return {
      isValid: Object.values(nextErrors).every((value) => !value),
      errorField: Object.keys(nextErrors).find((key) => nextErrors[key]) ?? null,
    };
  };

  const handleSaveProfile = async (event) => {
    event.preventDefault();

    const validation = await validateProfile();
    if (!validation.isValid || !effectiveUser) {
      if (!validation.isValid) {
        // GA4 프로필 저장 검증 실패 — 값은 보내지 않고 실패 필드만
        trackEvent("profile_save", {
          result: "validation",
          errorField: validation.errorField,
        });
      }
      return;
    }

    setIsSavingProfile(true);
    const result = await saveMemberProfile({
      user: effectiveUser,
      values: profileForm,
    });
    setIsSavingProfile(false);

    if (result.error) {
      setToastState({
        message: result.error.message || "프로필을 저장하지 못했습니다.",
        tone: "error",
      });
      // GA4 프로필 저장 실패
      trackEvent("profile_save", {
        result: "fail",
        errorMessage: result.error.message ?? "",
      });
      return;
    }

    // GA4 프로필 저장 성공
    trackEvent("profile_save", { result: "ok", source: result.source });

    if (!isDemoPreview) {
      await refreshProfile();
    }

    await syncPortalState({
      message: result.source === "supabase" ? "프로필 정보가 저장되었습니다." : "프로필 정보가 임시 저장되었습니다.",
      tone: result.source === "supabase" ? "success" : "info",
    });
    setIsProfileEditing(false);
  };

  const handleSaveAddress = async (event) => {
    event.preventDefault();

    if (!effectiveUser) {
      return;
    }

    const addressUiAction = addressForm.id ? "edit" : "create";

    if (!addressForm.id && portalState.shippingAddresses.length >= MAX_SAVED_ITEMS) {
      setToastState({
        message: "최대 5개까지 등록할 수 있습니다.",
        tone: "error",
      });
      trackEvent("address_limit_blocked", {
        savedCount: portalState.shippingAddresses.length,
        uiSurface: "address_form",
      });
      return;
    }

    const addressValidation = validateAddress();
    if (!addressValidation.isValid) {
      // GA4 배송지 저장 검증 실패 (주소·연락처 값은 미전송)
      trackEvent("address_save", {
        uiAction: addressUiAction,
        result: "validation",
        errorField: addressValidation.errorField,
        uiSurface: "mypage",
      });
      return;
    }

    setIsSavingAddress(true);
    const result = await saveMemberShippingAddress({
      user: effectiveUser,
      values: addressForm,
      shouldMakeDefault: Boolean(addressForm.is_default) || portalState.shippingAddresses.length === 0,
    });
    setIsSavingAddress(false);

    if (result.error) {
      setToastState({
        message: result.error.message || "배송지를 저장하지 못했습니다.",
        tone: "error",
      });
      // GA4 배송지 저장 실패
      trackEvent("address_save", {
        uiAction: addressUiAction,
        result: "fail",
        errorMessage: result.error.message ?? "",
        uiSurface: "mypage",
      });
      return;
    }

    // GA4 배송지 저장 성공
    trackEvent("address_save", {
      uiAction: addressUiAction,
      result: "ok",
      setDefault: Boolean(addressForm.is_default) || portalState.shippingAddresses.length === 0,
      savedCount: portalState.shippingAddresses.length,
      uiSurface: "mypage",
    });

    closeAddressSheet();
    await syncPortalState({
      message: result.source === "supabase" ? "배송지가 저장되었습니다." : "배송지가 임시 저장되었습니다.",
      tone: result.source === "supabase" ? "success" : "info",
    });
  };

  const handleSaveAccount = async (event) => {
    event.preventDefault();

    if (!effectiveUser) {
      return;
    }

    const accountUiAction = accountForm.id ? "edit" : "create";

    if (!accountForm.id && portalState.settlementAccounts.length >= MAX_SAVED_ITEMS) {
      setToastState({
        message: "최대 5개까지 등록할 수 있습니다.",
        tone: "error",
      });
      trackEvent("settlement_account_limit_blocked", {
        savedCount: portalState.settlementAccounts.length,
        uiSurface: "settlement_account_form",
      });
      return;
    }

    const accountValidation = validateAccount();
    if (!accountValidation.isValid) {
      // GA4 정산 계좌 검증 실패 — 계좌번호·예금주 값은 절대 미전송(은행명만 허용)
      trackEvent("settlement_account_save", {
        uiAction: accountUiAction,
        result: "validation",
        errorField: accountValidation.errorField,
      });
      return;
    }

    setIsSavingAccount(true);
    const result = await saveMemberSettlementAccount({
      user: effectiveUser,
      values: accountForm,
      shouldMakeDefault: Boolean(accountForm.is_default) || portalState.settlementAccounts.length === 0,
    });
    setIsSavingAccount(false);

    if (result.error) {
      setToastState({
        message: result.error.message || "정산 계좌를 저장하지 못했습니다.",
        tone: "error",
      });
      // GA4 정산 계좌 저장 실패
      trackEvent("settlement_account_save", {
        uiAction: accountUiAction,
        result: "fail",
        errorMessage: result.error.message ?? "",
      });
      return;
    }

    // GA4 정산 계좌 저장 성공 (은행명은 PII가 아니라 남긴다)
    trackEvent("settlement_account_save", {
      uiAction: accountUiAction,
      result: "ok",
      bankName: accountForm.bank_name,
      setDefault: Boolean(accountForm.is_default) || portalState.settlementAccounts.length === 0,
      savedCount: portalState.settlementAccounts.length,
    });

    closeAccountSheet();
    await syncPortalState({
      message: result.source === "supabase" ? "정산 계좌가 저장되었습니다." : "정산 계좌가 임시 저장되었습니다.",
      tone: result.source === "supabase" ? "success" : "info",
    });
  };

  const requestDeleteAddress = (address) => {
    if (address.is_default && portalState.shippingAddresses.length === 1) {
      setToastState({
        message: "기본 주소는 삭제할 수 없습니다.",
        tone: "error",
      });
      // GA4 삭제 차단 — 기본 주소 1개뿐
      trackEvent("address_delete_blocked", { errorReason: "only_default" });
      return;
    }

    if (address.is_default) {
      setToastState({
        message: "다른 주소를 기본으로 설정한 뒤 삭제해 주세요.",
        tone: "error",
      });
      trackEvent("address_delete_blocked", { errorReason: "is_default" });
      return;
    }

    setConfirmState({
      open: true,
      type: "address",
      itemId: address.id,
      analytics: { savedCount: portalState.shippingAddresses.length },
      title: "이 주소를 삭제하시겠습니까?",
      body: `${address.label} 배송지를 삭제하면 주문서에서 다시 선택할 수 없습니다.`,
      confirmLabel: "삭제",
      confirmTone: "danger",
    });
  };

  const requestDeleteAccount = (account) => {
    if (account.is_default && portalState.settlementAccounts.length === 1) {
      setToastState({
        message: "기본 계좌는 삭제할 수 없습니다.",
        tone: "error",
      });
      // GA4 삭제 차단 — 기본 계좌 1개뿐
      trackEvent("settlement_account_delete_blocked", { errorReason: "only_default" });
      return;
    }

    if (account.is_default) {
      setToastState({
        message: "다른 계좌를 기본으로 설정한 뒤 삭제해 주세요.",
        tone: "error",
      });
      trackEvent("settlement_account_delete_blocked", { errorReason: "is_default" });
      return;
    }

    setConfirmState({
      open: true,
      type: "account",
      itemId: account.id,
      analytics: { savedCount: portalState.settlementAccounts.length, bankName: account.bank_name },
      title: "이 계좌를 삭제하시겠습니까?",
      body: `${account.bank_name} 계좌를 삭제하면 정산 시 다시 등록해야 합니다.`,
      confirmLabel: "삭제",
      confirmTone: "danger",
    });
  };

  const requestConfirmPurchase = (order) => {
    setConfirmState({
      open: true,
      type: "order",
      itemId: order.id,
      // GA4 — 다이얼로그 노출·확정 이벤트에 함께 실을 주문 맥락(금액·상태·자동확정 잔여일)
      analytics: {
        orderId: String(order.id),
        orderStatus: order.status,
        value: Number(order.totalAmount) || 0,
        autoConfirmDaysRemaining:
          order.autoConfirmDaysRemaining != null
            ? Number(order.autoConfirmDaysRemaining)
            : undefined,
      },
      title: "구매를 확정하시겠습니까?",
      body: "상품을 확인하셨나요? 구매확정하면 판매자 정산 절차가 시작됩니다. 문제가 있다면 먼저 환불을 신청해주세요. 확정 후에도 하자·오배송은 고객센터로 문의할 수 있습니다.",
      confirmLabel: "확정하기",
      confirmTone: "primary",
    });
  };

  const requestCancelOrder = (order) => {
    setConfirmReason("");
    setConfirmReasonCategory("");
    setConfirmState({
      open: true,
      type: "cancel_order",
      itemId: order.id,
      analytics: {
        orderId: String(order.id),
        orderStatus: order.status,
        value: Number(order.totalAmount) || 0,
        paymentType: order.paymentMethod,
      },
      title: "주문을 취소하시겠습니까?",
      body: "취소 후에는 되돌릴 수 없습니다. 취소 사유를 선택해 주세요.",
      confirmLabel: "주문 취소",
      confirmTone: "danger",
      reasonInput: true,
      reasonPlaceholder: "기타 사유는 여기에 직접 입력해 주세요.",
      // '기타' 선택 시에만 상세 사유를 필수(최소 4자)로 받는다.
      reasonMinLength: 4,
    });
  };

  const requestCancelPickup = (shipment) => {
    setConfirmReason("");
    setConfirmReasonCategory("");
    setConfirmState({
      open: true,
      type: "cancel_pickup",
      itemId: shipment.pickupRequestId,
      analytics: {
        pickupStatus: shipment.status,
        bookCount: Number(shipment.bookCount ?? shipment.items?.length ?? 0),
      },
      title: "수거 신청을 취소하시겠습니까?",
      body: `수거 ${shipment.reference ?? ""} 신청이 취소되며, 필요하면 새로 신청해야 합니다.`,
      confirmLabel: "신청 취소",
      confirmTone: "danger",
    });
  };

  const handleConfirmAction = async () => {
    if ((!confirmState.itemId && confirmState.type !== "withdrawal") || !effectiveUser) {
      closeConfirmDialog();
      return;
    }

    // GA4 — 회원 액션 RPC 실패를 한 곳에서 예외로 남긴다(토스트만 뜨고 사라지던 구간).
    const trackActionFailure = (error) => {
      trackException("member_action_failed", {
        actionType: confirmState.type,
        errorMessage: error?.message ?? "",
        ...(confirmState.analytics ?? {}),
      });
    };
    // 다이얼로그에서 고른 사유 분류 — 성공 이벤트(order_cancel 등)에 함께 싣는다.
    const confirmAnalytics = {
      ...(confirmState.analytics ?? {}),
      ...(confirmReasonCategory ? { reasonCategory: confirmReasonCategory } : {}),
    };

    if (confirmState.type === "withdrawal") {
      setIsWithdrawing(true);
      // 탈퇴 사유: 카테고리 키 + 선택 당시 문구 스냅샷 + (기타/부가) 상세 입력을 함께 보관.
      const withdrawalCategory = WITHDRAWAL_REASON_CATEGORIES.find(
        (opt) => opt.value === confirmReasonCategory,
      );
      const result = await requestMemberWithdrawal({
        user: effectiveUser,
        demoMode: isDemoPreview,
        reasonCategory: confirmReasonCategory || null,
        reasonLabel: withdrawalCategory?.label ?? null,
        reasonDetail: confirmReason.trim() || null,
        // GA4 member_withdraw에 얹을 부가 파라미터(사유 본문은 미전송, 작성 여부만)
        analytics: {
          ...(confirmState.analytics ?? {}),
          hasReasonDetail: Boolean(confirmReason.trim()),
        },
      });
      setIsWithdrawing(false);

      if (result.error) {
        trackActionFailure(result.error);
        setToastState({
          message: result.error.message || "회원탈퇴 신청에 실패했습니다.",
          tone: "error",
        });
        closeConfirmDialog();
        return;
      }

      closeConfirmDialog();
      if (!isDemoPreview) {
        await signOut();
      }
      navigate("/", { replace: true });
      return;
    }

    if (confirmState.type === "address") {
      setBusyAddressId(confirmState.itemId);
      const result = await deleteMemberShippingAddress({
        user: effectiveUser,
        addressId: confirmState.itemId,
      });
      setBusyAddressId(null);

      if (result.error) {
        trackActionFailure(result.error);
        setToastState({
          message: result.error.message || "배송지를 삭제하지 못했습니다.",
          tone: "error",
        });
      } else {
        // GA4 배송지 삭제 성공
        trackEvent("address_delete", { result: "ok", ...(confirmState.analytics ?? {}) });
        await syncPortalState({
          message: result.source === "supabase" ? "배송지가 삭제되었습니다." : "배송지가 임시 삭제되었습니다.",
          tone: result.source === "supabase" ? "success" : "info",
        });
      }

      closeConfirmDialog();
      return;
    }

    if (confirmState.type === "account") {
      setBusyAccountId(confirmState.itemId);
      const result = await deleteMemberSettlementAccount({
        user: effectiveUser,
        accountId: confirmState.itemId,
      });
      setBusyAccountId(null);

      if (result.error) {
        trackActionFailure(result.error);
        setToastState({
          message: result.error.message || "정산 계좌를 삭제하지 못했습니다.",
          tone: "error",
        });
      } else {
        // GA4 정산 계좌 삭제 성공 (은행명만, 계좌번호·예금주는 미전송)
        trackEvent("settlement_account_delete", {
          result: "ok",
          ...(confirmState.analytics ?? {}),
        });
        await syncPortalState({
          message: result.source === "supabase" ? "정산 계좌가 삭제되었습니다." : "정산 계좌가 임시 삭제되었습니다.",
          tone: result.source === "supabase" ? "success" : "info",
        });
      }

      closeConfirmDialog();
      return;
    }

    if (confirmState.type === "order") {
      setBusyOrderId(confirmState.itemId);
      const result = await confirmMemberPurchase({
        user: effectiveUser,
        orderId: confirmState.itemId,
        demoMode: isDemoPreview,
        // GA4 purchase_confirm에 주문 맥락을 실어 보낸다(memberPortal이 성공 시 발화).
        analytics: confirmAnalytics,
      });
      setBusyOrderId(null);

      if (result.error) {
        trackActionFailure(result.error);
        setToastState({
          message: result.error.message || "구매확정 처리에 실패했습니다.",
          tone: "error",
        });
      } else {
        await syncPortalState({
          message: "구매가 확정되었습니다!",
          tone: "success",
        });
      }

      closeConfirmDialog();
      return;
    }

    if (confirmState.type === "cancel_order") {
      setBusyOrderId(confirmState.itemId);
      // 취소 사유: 카테고리 라벨 + (있으면) 상세 사유를 한 문자열로 합쳐 전달.
      const cancelCategoryLabel =
        CANCEL_REASON_CATEGORIES.find((opt) => opt.value === confirmReasonCategory)?.label ?? "기타";
      const cancelDetail = confirmReason.trim();
      const cancelReason = cancelDetail
        ? `[${cancelCategoryLabel}] ${cancelDetail}`
        : `[${cancelCategoryLabel}]`;
      const result = await cancelMemberOrder({
        user: effectiveUser,
        orderId: confirmState.itemId,
        reason: cancelReason,
        demoMode: isDemoPreview,
        // GA4 order_cancel — 사유 분류·주문 상태·금액 (자유 입력 사유 본문은 미전송)
        analytics: confirmAnalytics,
      });
      setBusyOrderId(null);

      if (result.error) {
        trackActionFailure(result.error);
        setToastState({
          message: result.error.message || "주문 취소에 실패했습니다.",
          tone: "error",
        });
      } else {
        await syncPortalState({
          message: "주문이 취소되었습니다.",
          tone: "success",
        });
      }

      closeConfirmDialog();
      return;
    }

    if (confirmState.type === "cancel_pickup") {
      setIsConfirmBusy(true);
      const result = await cancelMemberPickupRequest({
        user: effectiveUser,
        requestId: confirmState.itemId,
        demoMode: isDemoPreview,
        // GA4 pickup_self_cancel — memberPortal이 성공·실패 모두 발화한다.
        analytics: confirmAnalytics,
      });
      setIsConfirmBusy(false);

      if (result.error) {
        trackActionFailure(result.error);
        setToastState({
          message: result.error.message || "수거 신청 취소에 실패했습니다.",
          tone: "error",
        });
        closeConfirmDialog();
        return;
      }

      await syncPortalState({
        message: "수거 신청이 취소되었습니다.",
        tone: "success",
      });
      closeConfirmDialog();
      return;
    }

    if (confirmState.type === "refund_order") {
      if (!refundItemIds.length || isConfirmBusy) return;
      setBusyOrderId(confirmState.itemId);
      setIsConfirmBusy(true);
      // P1-8: 카테고리 + 상세사유를 한 문자열로 합쳐서 RPC에 전달.
      const categoryLabel = (
        { defect: "상품 하자/등급 불일치", change_of_mind: "단순 변심", wrong_item: "다른 상품 도착", other: "기타" }
      )[confirmReasonCategory] ?? "기타";
      const combinedReason = `[${categoryLabel}] ${confirmReason}`.trim();
      const result = await requestMemberRefund({
        user: effectiveUser,
        orderId: confirmState.itemId,
        itemIds: refundItemIds,
        reason: combinedReason,
        demoMode: isDemoPreview,
        // GA4 refund_request — 사유 분류·주문 상태 (사유 본문은 미전송)
        analytics: confirmAnalytics,
      });
      setBusyOrderId(null);
      setIsConfirmBusy(false);

      if (result.error) {
        trackActionFailure(result.error);
        setToastState({
          message: result.error.message || "환불 신청에 실패했습니다.",
          tone: "error",
        });
        return;
      }

      await syncPortalState({
        message: "환불 신청이 접수되었습니다. 운영자 검토 후 처리됩니다.",
        tone: "success",
      });
      closeConfirmDialog();
    }
  };

  const handleSetDefaultAddress = async (addressId) => {
    if (!effectiveUser) {
      return;
    }

    setBusyAddressId(addressId);
    const result = await setDefaultMemberShippingAddress({ user: effectiveUser, addressId });
    setBusyAddressId(null);

    if (result.error) {
      setToastState({
        message: result.error.message || "기본 배송지를 변경하지 못했습니다.",
        tone: "error",
      });
      // GA4 기본 배송지 변경 실패
      trackEvent("address_set_default", {
        result: "fail",
        errorMessage: result.error.message ?? "",
      });
      return;
    }

    // GA4 기본 배송지 변경 성공
    trackEvent("address_set_default", { result: "ok" });

    await syncPortalState({
      message: "기본 배송지가 변경되었습니다.",
      tone: result.source === "supabase" ? "success" : "info",
    });
  };

  const handleSetDefaultAccount = async (accountId) => {
    if (!effectiveUser) {
      return;
    }

    setBusyAccountId(accountId);
    const result = await setDefaultMemberSettlementAccount({ user: effectiveUser, accountId });
    setBusyAccountId(null);

    if (result.error) {
      setToastState({
        message: result.error.message || "기본 정산 계좌를 변경하지 못했습니다.",
        tone: "error",
      });
      // GA4 기본 정산 계좌 변경 실패
      trackEvent("settlement_account_set_default", {
        result: "fail",
        errorMessage: result.error.message ?? "",
      });
      return;
    }

    // GA4 기본 정산 계좌 변경 성공
    trackEvent("settlement_account_set_default", { result: "ok" });

    await syncPortalState({
      message: "기본 정산 계좌가 변경되었습니다.",
      tone: result.source === "supabase" ? "success" : "info",
    });
  };

  // uiSurface: purchase_card / sales_card — 어디서 배송 조회를 눌렀는지 구분
  const handleTrackParcel = (trackingNumber, uiSurface = "purchase_card", extra = {}) => {
    if (isDemoPreview) {
      setToastState({ message: "예시 운송장입니다. 실제 배송 조회는 실행하지 않아요.", tone: "info" });
      return;
    }
    const trackingUrl = buildCjTrackingUrl(trackingNumber);

    if (!trackingUrl) {
      setToastState({
        message: "운송장 정보가 아직 없습니다.",
        tone: "error",
      });
      // GA4 운송장 없이 배송 조회를 누른 경우(죽은 버튼 노출량)
      trackEvent("delivery_track_unavailable", { uiSurface, ...extra });
      return;
    }

    // GA4 배송 조회 클릭
    trackDeliveryTrackClick(uiSurface, extra);
    window.open(trackingUrl, "_blank", "noopener,noreferrer");
  };

  // source: mypage_sales_empty / mypage_settlements_empty …
  const handlePickupRequest = (source = "mypage") => {
    if (isDemoPreview) {
      setToastState({ message: "데모에서는 새 수거를 접수하지 않아요. 판매 내역에서 상태별 예시를 확인해 주세요.", tone: "info" });
      return;
    }
    // GA4 수거 신청 CTA — 로그인 관문 앞에서 센다(관문 이탈도 분모에 포함)
    trackPickupCtaClick(typeof source === "string" ? source : "mypage");

    if (!requireMember("pickupRequest", "/pickup/new")) {
      return;
    }

    navigate("/pickup/new");
  };

  const handleReturnRequest = (order) => {
    if (!order?.id) {
      setToastState({
        message: "주문 정보를 찾을 수 없습니다.",
        tone: "error",
      });
      return;
    }
    const eligibleStatuses = ["delivered", "confirmed"];
    if (!eligibleStatuses.includes(order.status)) {
      setToastState({
        message: "배송완료 또는 구매확정 상태에서만 환불을 신청할 수 있어요.",
        tone: "info",
      });
      // GA4 환불 신청 차단 — 상태 미달
      trackEvent("refund_blocked", {
        orderId: String(order.id),
        errorReason: "status_ineligible",
        orderStatus: order.status,
      });
      return;
    }
    if (order.refund_requested_at || order.refundRequestedAt) {
      setToastState({
        message: "이미 환불 신청이 접수된 주문이에요.",
        tone: "info",
      });
      // GA4 환불 신청 차단 — 이미 접수됨
      trackEvent("refund_blocked", {
        orderId: String(order.id),
        errorReason: "already_requested",
        orderStatus: order.status,
      });
      return;
    }
    setConfirmReason("");
    setConfirmReasonCategory("");
    setConfirmState({
      open: true,
      type: "refund_order",
      itemId: order.id,
      refundItems: order.items ?? [],
      analytics: {
        orderId: String(order.id),
        orderStatus: order.status,
        value: Number(order.totalAmount) || 0,
      },
      title: "어떤 교재를 환불할까요?",
      body: "환불할 교재와 사유를 알려주세요. 운영자가 확인 후 안내해드릴게요.",
      confirmLabel: "환불 신청",
      confirmTone: "danger",
      reasonInput: true,
      reasonPlaceholder: "예: 받은 책 상태가 검수 등급과 다릅니다. 어디가 어떻게 다른지 자세히 적어주세요.",
      reasonMinLength: 20,
    });
  };

  const handleWithdrawal = () => {
    setConfirmReason("");
    setConfirmReasonCategory("");
    setConfirmState({
      open: true,
      type: "withdrawal",
      itemId: null,
      analytics: { uiSurface: "mypage_settings" },
      title: "회원탈퇴를 신청하시겠습니까?",
      body: "신청 후 30일 동안 계정이 유예 상태로 보관되고, 이후 개인정보가 파기됩니다. 유예 기간 중 복구가 필요하면 고객센터로 문의해 주세요. 떠나시는 이유를 알려주시면 서비스 개선에 큰 도움이 됩니다.",
      confirmLabel: "탈퇴 신청",
      confirmTone: "danger",
      reasonInput: true,
      reasonPlaceholder: "기타 사유는 여기에 직접 입력해 주세요. 남기고 싶은 이야기가 있다면 자유롭게 적어주세요.",
      // '기타 (직접 입력)' 선택 시에만 상세 사유 필수 — 렌더 쪽에서 카테고리별로 0/4자 전환.
      reasonMinLength: 4,
    });
  };

  const handleOpenAddressSearch = async () => {
    if (typeof window === "undefined") {
      return;
    }

    const loadScript = () =>
      new Promise((resolve, reject) => {
        if (window.daum?.Postcode) {
          resolve();
          return;
        }

        const existingScript = document.getElementById("subook-daum-postcode-script");
        if (existingScript) {
          existingScript.addEventListener("load", resolve, { once: true });
          existingScript.addEventListener("error", reject, { once: true });
          return;
        }

        const script = document.createElement("script");
        script.id = "subook-daum-postcode-script";
        script.src = "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";
        script.async = true;
        script.onload = resolve;
        script.onerror = reject;
        document.body.appendChild(script);
      });

    try {
      // GA4 주소 검색 열기 (주소 값 자체는 보내지 않는다)
      trackEvent("address_search_open", { uiSurface: "mypage" });
      setIsSearchingAddress(true);
      await loadScript();
      setIsSearchingAddress(false);

      new window.daum.Postcode({
        oncomplete: (data) => {
          setAddressForm((currentValue) => ({
            ...currentValue,
            postal_code: data.zonecode ?? "",
            address_line1: data.roadAddress || data.jibunAddress || "",
          }));
          setAddressErrors((currentValue) => ({
            ...currentValue,
            postal_code: "",
            address_line1: "",
          }));
          // GA4 주소 선택 완료
          trackEvent("address_search_complete", { uiSurface: "mypage" });

          window.setTimeout(() => {
            addressDetailInputRef.current?.focus();
          }, 50);
        },
      }).open();
    } catch (error) {
      setIsSearchingAddress(false);
      setToastState({
        message: "주소 검색을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
        tone: "error",
      });
      // GA4 우편번호 스크립트 로드 실패
      trackException("address_script_failed", {
        uiSurface: "mypage",
        errorMessage: error?.message ?? "",
      });
    }
  };

  const handleSignOut = async () => {
    if (isDemoPreview) {
      navigate("/", { replace: true });
      return;
    }

    setIsSigningOut(true);
    // GA4 logout은 AuthContext.signOut(source)이 발화한다 — 여기서 중복 발화하지 않는다.
    const result = await signOut("mypage_settings");
    setIsSigningOut(false);

    if (result.error) {
      setToastState({
        message: result.error.message || "로그아웃하지 못했습니다.",
        tone: "error",
      });
      return;
    }

    navigate("/", { replace: true });
  };

  const handleToggleWishlistProduct = async (productId) => {
    if (isDemoPreview) return;
    const result = await toggleFavorite(productId);

    if (result.error) {
      setToastState({
        message: result.error.message || "찜 상태를 변경하지 못했어요.",
        tone: "error",
      });
      // GA4 찜 토글 실패 (add/remove 이벤트는 WishlistContext가 성공 시에만 발화)
      trackException("wishlist_toggle_failed", {
        itemId: String(productId),
        uiSurface: "mypage_wishlist",
        errorMessage: result.error.message ?? "",
      });
      return;
    }

    if (!result.isFavorite) {
      setWishlistProducts((currentValue) =>
        currentValue.filter((product) => String(product.id) !== String(productId)),
      );
    }

    setToastState({
      message: result.isFavorite ? "찜 목록에 추가했어요." : "찜을 해제했어요.",
      tone: result.isFavorite ? "success" : "info",
    });
  };

  if (isLoading && !isDemoPreview) {
    return (
      <PublicPageFrame>
        <div className="public-auth-page public-mypage-page">
          <div className="public-auth-page__body">
            <PublicSiteHeader hideSearch />
            <main className="public-mypage-route">
              <ContentContainer className="public-mypage-shell">
                <div className="public-mypage-skeleton public-mypage-skeleton--hero" />
                <div className="public-mypage-skeleton-grid">
                  <div className="public-mypage-skeleton" />
                  <div className="public-mypage-skeleton" />
                  <div className="public-mypage-skeleton" />
                </div>
                <div className="public-mypage-skeleton public-mypage-skeleton--tabs" />
                <div className="public-mypage-skeleton public-mypage-skeleton--panel" />
              </ContentContainer>
            </main>
          </div>
          <PublicFooter />
        </div>
      </PublicPageFrame>
    );
  }

  if (!isAuthenticated && !isDemoPreview) {
    const withdrawalNotice =
      accountRole === "withdrawal_pending"
        ? "탈퇴 처리 중인 계정입니다. 30일 유예 기간 동안 로그인할 수 있도록 고객센터(subook2025@gmail.com)로 문의해 주세요."
        : accountRole === "withdrawn"
          ? "탈퇴 완료된 계정입니다. 동일 이메일로 재가입은 불가능합니다."
          : accountRole === "blocked"
            ? "이용이 제한된 계정입니다. 문의가 필요하시면 subook2025@gmail.com 으로 연락해 주세요."
            : "";
    return (
      <Navigate
        replace
        state={{
          from: location,
          notice: isAdminAccount
            ? "운영자 계정은 공개 마이페이지를 사용할 수 없습니다. 관리자 페이지에서 로그인해 주세요."
            : withdrawalNotice,
        }}
        to="/login"
      />
    );
  }

  const renderSettingsTab = (section) => (
    <SettingsTab
      accountErrors={accountErrors}
      accountForm={accountForm}
      addressDetailInputRef={addressDetailInputRef}
      addressErrors={addressErrors}
      addressForm={addressForm}
      busyAccountId={busyAccountId}
      busyAddressId={busyAddressId}
      currentNickname={currentNickname}
      handleAccountChange={handleAccountChange}
      handleAddressChange={handleAddressChange}
      handleOpenAddressSearch={handleOpenAddressSearch}
      handleProfileChange={handleProfileChange}
      handleSaveProfile={handleSaveProfile}
      handleSetDefaultAccount={handleSetDefaultAccount}
      handleSetDefaultAddress={handleSetDefaultAddress}
      handleSignOut={handleSignOut}
      handleWithdrawal={handleWithdrawal}
      isDemoPreview={isDemoPreview}
      isProfileEditing={isProfileEditing}
      isSavingProfile={isSavingProfile}
      isSigningOut={isSigningOut}
      isWishlistLoading={isWishlistLoading}
      isWishlistProductsLoading={isWishlistProductsLoading}
      isWithdrawing={isWithdrawing}
      joinDateText={joinDateText}
      nicknameStatus={nicknameStatus}
      onToggleRestockAlert={isDemoPreview ? null : handleToggleRestockAlert}
      onToggleWishlistProduct={handleToggleWishlistProduct}
      openAccountSheet={openAccountSheet}
      openAddressSheet={openAddressSheet}
      portalState={portalState}
      profileErrors={profileErrors}
      profileForm={profileForm}
      profileSnapshot={profileSnapshot}
      requestDeleteAccount={requestDeleteAccount}
      requestDeleteAddress={requestDeleteAddress}
      restockBusyProductId={restockBusyProductId}
      restockSubscribedIds={restockSubscribedIds}
      section={section}
      setIsProfileEditing={setIsProfileEditing}
      setProfileErrors={setProfileErrors}
      setProfileForm={setProfileForm}
      user={effectiveUser}
      wishlistError={wishlistError}
      wishlistProducts={wishlistProducts}
    />
  );

  const showLoadingSkeleton = (
    <div className="public-mypage-stack">
      <div className="public-mypage-skeleton public-mypage-skeleton--panel" />
      <div className="public-mypage-skeleton public-mypage-skeleton--panel" />
    </div>
  );

  const activeTabContent = (() => {
    if (activeTabKey === "sales") {
      if (tabPhases.sales === "loading" && !loadedTabs.sales) {
        return showLoadingSkeleton;
      }
      return (
        <SalesTab
          expandedShipmentId={expandedShipmentId}
          onCancelPickup={requestCancelPickup}
          onRequestPickup={handlePickupRequest}
          onToggleShipment={setExpandedShipmentId}
          onTrackParcel={handleTrackParcel}
          settlementSummary={portalState.settlementSummary}
          shipments={portalState.shipments}
        />
      );
    }

    if (activeTabKey === "purchases") {
      if (tabPhases.purchases === "loading" && !loadedTabs.purchases) {
        return <div className="public-mypage-skeleton public-mypage-skeleton--panel" />;
      }
      return (
        <PurchasesView
          isDemoPreview={isDemoPreview}
          busyOrderId={busyOrderId}
          onCancelOrder={requestCancelOrder}
          onConfirmOrder={requestConfirmPurchase}
          onRequestReturn={handleReturnRequest}
          onTrackParcel={handleTrackParcel}
          onOpenPoints={() => setIsPointsSheetOpen(true)}
          onOpenReviews={() => moveToTab("reviews", { uiSurface: "review_invite" })}
          onWriteReview={(order) =>
            setReviewComposer({ order, review: myReviewsByOrderId[order.id] ?? null })
          }
          orders={portalState.orders}
          points={myPoints}
          reviewsByOrderId={myReviewsByOrderId}
          reviewsReady={reviewsReady}
          isFirstReview={isFirstReview}
        />
      );
    }

    if (activeTabKey === "reviews") {
      return <MypageReviews
        orders={portalState.orders}
        reviewsByOrderId={myReviewsByOrderId}
        isFirstReview={isFirstReview}
        isReady={reviewsReady && loadedTabs.purchases}
        error={reviewsLoadState.error}
        onRetry={reloadMyReviews}
        onWrite={(order) => setReviewComposer({ order, review: null })}
        onRead={(review) => setReviewComposer({
          order: portalState.orders.find((order) => order.id === review.orderId) ?? null,
          review,
        })}
      />;
    }

    if (activeTabKey === "wishlist") {
      return (
        <div className="public-mypage-stack">
          <section className="public-mypage-section">
            <MypageSectionHeader title="기다리는 교재가 있나요?" description="교재명·강사명으로 신청한 입고 알림을 확인하고 관리하세요."
              action={<button className="public-auth-button public-auth-button--secondary" type="button" onClick={() => moveToTab("restock")}>키워드 입고 알림 관리</button>} />
          </section>
          <WishlistTab
            isLoading={isWishlistLoading || isWishlistProductsLoading}
            onToggleFavorite={handleToggleWishlistProduct}
            onToggleRestockAlert={isDemoPreview ? null : handleToggleRestockAlert}
            restockBusyProductId={restockBusyProductId}
            restockSubscribedIds={restockSubscribedIds}
            wishlistError={wishlistError}
            wishlistProducts={wishlistProducts}
          />
        </div>
      );
    }

    if (activeTabKey === "restock") {
      return <MypageRestockKeywords key={isDemoPreview ? "demo" : effectiveUser?.id} isDemoPreview={isDemoPreview} />;
    }

    if (activeTabKey === "coupons") {
      return <CouponsView key={isDemoPreview ? "demo" : effectiveUser?.id} isDemoPreview={isDemoPreview} />;
    }

    if (activeTabKey === "settlements") {
      if (tabPhases.settlements === "loading" && !loadedTabs.settlements) {
        return <div className="public-mypage-skeleton public-mypage-skeleton--panel" />;
      }
      return (
        <SettlementsTab
          completedSettlements={portalState.completedSettlements}
          onRequestPickup={handlePickupRequest}
          scheduledSettlements={portalState.scheduledSettlements}
          settlementSummary={portalState.settlementSummary}
          onManageAccount={() => moveToTab("settlement-account")}
        />
      );
    }

    if (isPortalPending) {
      return showLoadingSkeleton;
    }

    if (activeTabKey === "profile") return renderSettingsTab("profile");
    if (activeTabKey === "addresses") return renderSettingsTab("addresses");
    if (activeTabKey === "settlement-account") return renderSettingsTab("settlement-account");

    return renderSettingsTab(null);
  })();

  return (
    <>
      <PublicToastMessage
        message={toastState.message}
        onClose={() => setToastState(initialToastState)}
        tone={toastState.tone}
      />

      <PublicPageFrame>
        <div className="public-auth-page public-mypage-page">
          <div className="public-auth-page__body">
            <PublicSiteHeader hideSearch />

            <main className="public-mypage-route">
              <ContentContainer className="public-mypage-shell">
                {isDemoPreview ? (
                  <div className="public-mypage-demo-banner">
                    <span><strong>체험 모드</strong> 예시 데이터로 둘러보는 마이페이지</span>
                    <button className="public-auth-button public-auth-button--secondary" type="button" onClick={() => { resetDemoPortalState(); window.location.reload(); }}>샘플 초기화</button>
                  </div>
                ) : null}

                {!isConfigured && !isDemoPreview ? (
                  <div className="public-auth-alert public-auth-alert--info">
                    Supabase 환경 변수가 없어 브라우저 기준 임시 상태로 표시됩니다.
                  </div>
                ) : null}

                {/* 데스크톱: 기존 breadcrumb (모바일 숨김) */}
                <header className="public-mypage-breadcrumb public-mypage-desktop-only">
                  <h1 className="public-mypage-breadcrumb__title">
                    마이페이지
                  </h1>
                  {activeSidebarItem ? (
                    <>
                      <span className="public-mypage-breadcrumb__sep" aria-hidden="true"><ChevronRightIcon size={12} /></span>
                      <span className="public-mypage-breadcrumb__leaf">{displayName}님</span>
                    </>
                  ) : null}
                </header>

                {/* 모바일: 프로필 헤더 — 이름 왼쪽, '>' 오른쪽(회원정보 수정 / 주소록 진입) */}
                <header className="public-mypage-profile public-mypage-mobile-only">
                  <span className="public-mypage-profile__name">{displayName}님</span>
                  <div className="public-mypage-profile__more-wrap" ref={profileMenuRef}>
                    <button
                      aria-label="회원정보 메뉴 열기"
                      aria-expanded={isProfileMenuOpen}
                      aria-haspopup="menu"
                      className="public-mypage-profile__more"
                      onClick={() => setIsProfileMenuOpen((open) => !open)}
                      type="button"
                    >
                      <ChevronRightIcon size={22} />
                    </button>
                    {isProfileMenuOpen ? (
                      <div className="public-mypage-profile__menu" role="menu">
                        <button
                          className="public-mypage-profile__menu-item"
                          onClick={() => { setIsProfileMenuOpen(false); moveToTab("profile", { smoothScroll: false, uiSurface: "profile_menu" }); }}
                          role="menuitem"
                          type="button"
                        >
                          회원정보 수정
                        </button>
                        <button
                          className="public-mypage-profile__menu-item"
                          onClick={() => { setIsProfileMenuOpen(false); moveToTab("addresses", { smoothScroll: false, uiSurface: "profile_menu" }); }}
                          role="menuitem"
                          type="button"
                        >
                          주소록
                        </button>
                      </div>
                    ) : null}
                  </div>
                </header>

                {/* 모바일: 3x2 네브 그리드 (라인 구분) */}
                <nav className="public-mypage-navgrid public-mypage-mobile-only" aria-label="마이페이지 메뉴">
                  {MYPAGE_GRID_ITEMS.map((item) => (
                    <button
                      aria-current={activeTabKey === item.key ? "page" : undefined}
                      className={`public-mypage-navgrid__item ${activeTabKey === item.key ? "is-active" : ""}`}
                      key={item.key}
                      onClick={() => moveToTab(item.key, { smoothScroll: false, uiSurface: "grid_mobile" })}
                      type="button"
                    >

                      <span>{item.label}</span>
                    </button>
                  ))}
                </nav>

                <div className="public-mypage-shell-grid">
                  {/* 데스크톱: 좌측 사이드바 (모바일 숨김) */}
                  <aside className="public-mypage-sidebar public-mypage-desktop-only" aria-label="마이페이지 메뉴">
                    {SIDEBAR_GROUPS.map((group) => (
                      <div className="public-mypage-sidebar__group" key={group.title}>
                        <p className="public-mypage-sidebar__title">{group.title}</p>
                        <ul className="public-mypage-sidebar__list">
                          {group.items.map((item) => (
                            <li key={item.key}>
                              {item.isCta ? (
                                <Link className="public-mypage-sidebar__cta" to={item.to ?? "/"}>
                                  {item.label}
                                </Link>
                              ) : (
                                <button
                                  aria-current={activeTabKey === item.key ? "page" : undefined}
                                  className={`public-mypage-sidebar__link ${activeTabKey === item.key ? "is-active" : ""}`}
                                  onClick={() => moveToTab(item.key, { smoothScroll: false, uiSurface: "sidebar" })}
                                  type="button"
                                >
                                  {item.label}
                                </button>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </aside>

                  <section
                    className="public-mypage-content"
                    key={activeTabKey}
                    ref={tabPanelRef}
                  >
                    {(portalLoadError || (isConfigured && !isDemoPreview && loadedTabs[dataKey] && getPortalHistoryIssue(portalState, activeTabKey))) ? (
                      <div className="mypage-load-error" role="alert">
                        <p>{portalLoadError || getPortalHistoryIssue(portalState, activeTabKey)}</p>
                        <button className="public-auth-button public-auth-button--secondary" type="button" onClick={() => { setPortalLoadErrors((current) => ({ ...current, [dataKey]: "" })); setLoadedTabs((current) => ({ ...current, [dataKey]: false })); }}>다시 불러오기</button>
                      </div>
                    ) : activeTabContent}
                  </section>
                </div>
              </ContentContainer>
            </main>
          </div>

          <PublicFooter />
        </div>
      </PublicPageFrame>

      <AddressSheet
        addressDetailInputRef={addressDetailInputRef}
        addressErrors={addressErrors}
        addressForm={addressForm}
        closeAddressSheet={closeAddressSheet}
        handleAddressChange={handleAddressChange}
        handleOpenAddressSearch={handleOpenAddressSearch}
        handleSaveAddress={handleSaveAddress}
        isAddressSheetOpen={isAddressSheetOpen}
        isSavingAddress={isSavingAddress}
        isSearchingAddress={isSearchingAddress}
      />

      <AccountSheet
        accountErrors={accountErrors}
        accountForm={accountForm}
        closeAccountSheet={closeAccountSheet}
        handleAccountChange={handleAccountChange}
        handleSaveAccount={handleSaveAccount}
        isAccountSheetOpen={isAccountSheetOpen}
        isSavingAccount={isSavingAccount}
      />

      <ConfirmDialog
        analyticsCloseExtra={() => ({
          hadReasonCategory: Boolean(confirmReasonCategory),
          reasonLength: confirmReason.trim().length,
          ...(confirmState.analytics ?? {}),
        })}
        analyticsExtra={confirmState.analytics}
        // dialog_open/close는 ConfirmDialog가 1회씩 발화한다(confirm_<type>).
        analyticsName={confirmState.type ? `confirm_${confirmState.type}` : undefined}
        body={confirmState.body}
        busy={isConfirmBusy}
        confirmLabel={confirmState.confirmLabel}
        confirmTone={confirmState.confirmTone}
        confirmDisabled={confirmState.type === "refund_order" && refundItemIds.length === 0}
        onClose={closeConfirmDialog}
        onConfirm={() => {
          void handleConfirmAction();
        }}
        onReasonCategoryChange={
          confirmState.type === "refund_order" ||
          confirmState.type === "cancel_order" ||
          confirmState.type === "withdrawal"
            ? setConfirmReasonCategory
            : undefined
        }
        onReasonChange={setConfirmReason}
        open={confirmState.open}
        reasonCategories={
          confirmState.type === "cancel_order"
            ? CANCEL_REASON_CATEGORIES
            : confirmState.type === "withdrawal"
              ? WITHDRAWAL_REASON_CATEGORIES
              : undefined
        }
        reasonCategoryLegend={
          confirmState.type === "cancel_order"
            ? "취소 사유"
            : confirmState.type === "withdrawal"
              ? "떠나시는 이유가 궁금해요"
              : undefined
        }
        changeOfMindHint={
          confirmState.type === "cancel_order" || confirmState.type === "withdrawal"
            ? null
            : undefined
        }
        reasonCategoryValue={confirmReasonCategory}
        reasonInput={confirmState.reasonInput}
        reasonMinLength={
          // 취소·탈퇴는 '기타'일 때만 상세 사유 필수, 그 외 카테고리는 상세 사유 선택.
          (confirmState.type === "cancel_order" || confirmState.type === "withdrawal") &&
          confirmReasonCategory !== "other"
            ? 0
            : confirmState.reasonMinLength
        }
        reasonPlaceholder={confirmState.reasonPlaceholder}
        reasonValue={confirmReason}
        title={confirmState.title}
      >
        {confirmState.type === "refund_order" ? <RefundItemPicker items={confirmState.refundItems} selectedIds={refundItemIds} onChange={setRefundItemIds} disabled={isConfirmBusy} /> : null}
      </ConfirmDialog>
      {memberGateDialog}

      <ReviewComposerSheet
        demoMode={isDemoPreview}
        isFirstReview={isFirstReview}
        onClose={() => setReviewComposer(null)}
        onSaved={(review) => {
          if (isDemoPreview && review) demoReviewsRef.current[review.orderId] = review;
          setReviewComposer(null);
          void reloadMyReviews();
          setToastState({
            message:
              review?.earnedPoints > 0
                ? `후기가 등록되었어요. ${formatPoints(review.earnedPoints)} 적립!`
                : "후기가 등록되었어요. 감사합니다!",
            tone: "success",
          });
        }}
        open={Boolean(reviewComposer)}
        order={reviewComposer?.order ?? null}
        review={reviewComposer?.review ?? null}
        user={effectiveUser}
      />
      <PointsHistorySheet
        onClose={() => setIsPointsSheetOpen(false)}
        open={isPointsSheetOpen}
        points={myPoints}
      />
    </>
  );
}

// 쿠폰함: 보유/사용/만료 탭 + 코드 입력 + 다운로드 가능 쿠폰 목록.
// PR 3에서 주문 페이지의 쿠폰 적용 UI가 추가됨.
function CouponsView({ isDemoPreview = false }) {
  const [coupons, setCoupons] = useState([]);
  const [downloadable, setDownloadable] = useState([]);
  const [statusFilter, setStatusFilter] = useState("available");
  const [codeInput, setCodeInput] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [isClaiming, setIsClaiming] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, tone = "info") => {
    setToast({ message, tone });
    window.setTimeout(() => setToast(null), 3000);
  }, []);

  // GA4 쿠폰함 노출 1회 가드 (재로드마다 다시 세지 않는다)
  const couponWalletViewedRef = useRef(false);

  const loadAll = useCallback(async () => {
    if (isDemoPreview) {
      setCoupons(createDemoCoupons());
      setDownloadable([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const [walletRes, downloadRes] = await Promise.all([
      publicSupabase.rpc("get_member_coupons", { p_status_filter: "all" }),
      publicSupabase.rpc("get_downloadable_coupons"),
    ]);
    if (!walletRes.error) setCoupons(Array.isArray(walletRes.data) ? walletRes.data : []);
    if (!downloadRes.error) setDownloadable(Array.isArray(downloadRes.data) ? downloadRes.data : []);
    // GA4 로드 실패 — 지금까지 조용히 삼키던 구간
    if (walletRes.error || downloadRes.error) {
      trackException("coupon_wallet_load_failed", {
        errorMessage: (walletRes.error ?? downloadRes.error)?.message ?? "",
        errorReason: walletRes.error ? "wallet" : "downloadable",
      });
    }
    if (!walletRes.error && !couponWalletViewedRef.current) {
      couponWalletViewedRef.current = true;
      const rows = Array.isArray(walletRes.data) ? walletRes.data : [];
      const downloadRows = Array.isArray(downloadRes.data) ? downloadRes.data : [];
      // GA4 쿠폰함 노출 — 보유/사용/만료/받을 수 있는 쿠폰 수
      trackEvent("coupon_wallet_view", {
        availableCount: rows.filter((row) => row.effective_status === "available").length,
        usedCount: rows.filter((row) => row.effective_status === "used").length,
        expiredCount: rows.filter((row) => row.effective_status === "expired").length,
        downloadableCount: downloadRows.length,
      });
    }
    setIsLoading(false);
  }, [isDemoPreview]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const filteredCoupons = useMemo(
    () => coupons.filter((c) => c.effective_status === statusFilter),
    [coupons, statusFilter],
  );

  // GA4 쿠폰 빈 상태 — 탭별 1회
  const couponEmptyGuardRef = useRef(makeOnceGuard());
  useEffect(() => {
    if (isLoading) return;
    if (filteredCoupons.length === 0 && couponEmptyGuardRef.current(statusFilter)) {
      trackEmptyState("mypage_coupons", { filterValue: statusFilter });
    }
  }, [filteredCoupons.length, isLoading, statusFilter]);

  const handleClaimCode = async (e) => {
    e.preventDefault();
    if (isDemoPreview) { showToast("데모에서는 쿠폰을 실제로 발급하지 않아요."); return; }
    if (!codeInput.trim()) return;
    setIsClaiming(true);
    const { error } = await publicSupabase.rpc("claim_coupon_by_code", {
      p_code: codeInput.trim(),
    });
    setIsClaiming(false);
    if (error) {
      showToast(error.message || "쿠폰 등록에 실패했습니다.", "error");
      // GA4 쿠폰 코드 등록 실패 — 코드 값은 절대 보내지 않는다.
      trackEvent("coupon_code_claim", {
        result: "fail",
        errorMessage: error.message ?? "",
      });
      return;
    }
    // GA4 쿠폰 코드 등록 성공
    trackEvent("coupon_code_claim", { result: "ok" });
    showToast("쿠폰이 등록되었습니다.", "success");
    setCodeInput("");
    await loadAll();
  };

  const handleDownload = async (coupon) => {
    if (isDemoPreview) { showToast("데모에서는 쿠폰을 실제로 발급하지 않아요."); return; }
    setBusyId(coupon.id);
    const { error } = await publicSupabase.rpc("claim_coupon_for_download", {
      p_coupon_id: coupon.id,
    });
    setBusyId(null);
    if (error) {
      showToast(error.message || "쿠폰 받기에 실패했습니다.", "error");
      // GA4 쿠폰 다운로드 실패
      trackEvent("coupon_download", {
        result: "fail",
        couponId: String(coupon.id),
        errorMessage: error.message ?? "",
      });
      return;
    }
    // GA4 쿠폰 다운로드 성공 — 어떤 쿠폰이 실제로 발급되는지
    trackEvent("coupon_download", {
      result: "ok",
      couponId: String(coupon.id),
      couponName: coupon.title,
      discountType: coupon.discount_type,
    });
    showToast("쿠폰이 발급되었습니다.", "success");
    await loadAll();
  };

  const counts = useMemo(() => {
    const result = { available: 0, used: 0, expired: 0 };
    coupons.forEach((c) => {
      if (c.effective_status in result) result[c.effective_status] += 1;
    });
    return result;
  }, [coupons]);

  return (
    <div className="public-mypage-stack">
      {/* 쿠폰 상태 탭 — 입력 칸보다 위, 상단 sticky 고정 */}
      <Link className="public-mypage-coupon-download-title" to="/event/invite">친구 초대하고 함께 4,000원 쿠폰 받기 →</Link>
      <div className="public-mypage-coupon-tabs public-mypage-coupon-tabs--sticky">
        {[
          { key: "available", label: "보유" },
          { key: "used", label: "사용 완료" },
          { key: "expired", label: "만료" },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`public-mypage-coupon-tab ${statusFilter === tab.key ? "is-active" : ""}`}
            onClick={() => {
              // GA4 쿠폰함 탭 전환
              trackListFilterChange("coupons", tab.key, {
                resultCount: counts[tab.key] ?? 0,
                fromFilter: statusFilter,
              });
              setStatusFilter(tab.key);
            }}
          >
            {tab.label} ({counts[tab.key] ?? 0})
          </button>
        ))}
      </div>

      <section className="public-mypage-section">
        <form onSubmit={handleClaimCode} className="public-mypage-coupon-code-form">
          <input
            className="public-mypage-coupon-code-input"
            type="text"
            placeholder="쿠폰 코드를 입력하세요"
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value)}
            disabled={isClaiming}
          />
          <button
            type="submit"
            className="public-mypage-coupon-code-submit"
            disabled={isClaiming || !codeInput.trim()}
          >
            {isClaiming ? "등록 중..." : "등록"}
          </button>
        </form>

        {downloadable.length > 0 ? (
          <div className="public-mypage-coupon-download-list">
            <h3 className="public-mypage-coupon-download-title">받을 수 있는 쿠폰</h3>
            <ul>
              {downloadable.map((coupon) => (
                <li key={coupon.id} className="public-mypage-coupon-download-item">
                  <div>
                    <strong>{coupon.title}</strong>
                    <p>
                      {describeCouponDiscount(coupon)}
                      {couponScopeLabel(coupon) ? ` · ${couponScopeLabel(coupon)} 교재 전용` : ""}
                      {coupon.min_order_amount > 0 ? ` · 최소 ${formatCurrency(coupon.min_order_amount)}` : ""}
                      {coupon.valid_days != null ? ` · 받은 날부터 ${coupon.valid_days}일` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busyId === coupon.id}
                    onClick={() => handleDownload(coupon)}
                    className="public-mypage-coupon-download-button"
                  >
                    {busyId === coupon.id ? "받는 중..." : "받기"}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="public-mypage-section">
        {isLoading ? (
          <div className="public-mypage-skeleton public-mypage-skeleton--panel" />
        ) : filteredCoupons.length === 0 ? (
          <MypageEmptyState
            description={
              statusFilter === "available"
                ? "보유한 쿠폰이 없습니다. 코드 입력 또는 다운로드로 받아보세요."
                : statusFilter === "used"
                  ? "사용한 쿠폰이 없습니다."
                  : "만료된 쿠폰이 없습니다."
            }
            icon={<MypageEmptyIcon src={couponIcon} />}
            title={statusFilter === "available" ? "보유 쿠폰 없음" : statusFilter === "used" ? "사용 이력 없음" : "만료 이력 없음"}
          />
        ) : (
          <ul className="public-mypage-coupon-list">
            {filteredCoupons.map((mc) => (
              <li
                key={mc.id}
                className={`public-mypage-coupon-card public-mypage-coupon-card--${mc.effective_status}`}
              >
                <div className="public-mypage-coupon-card__amount">
                  {describeCouponDiscount(mc)}
                </div>
                <div className="public-mypage-coupon-card__body">
                  <strong className="public-mypage-coupon-card__title">{mc.title}</strong>
                  {couponScopeLabel(mc) || mc.min_order_amount > 0 ? (
                    <p className="public-mypage-coupon-card__hint">
                      {couponScopeLabel(mc) ? `${couponScopeLabel(mc)} 교재 ` : ""}
                      {mc.min_order_amount > 0 ? `${formatCurrency(mc.min_order_amount)} 이상 주문 시` : "전용"}
                    </p>
                  ) : null}
                  <p className="public-mypage-coupon-card__expiry">
                    {mc.expires_at
                      ? `${formatCompactDate(mc.expires_at)}까지`
                      : "무기한"}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {toast ? (
        <div className={`public-mypage-coupon-toast public-mypage-coupon-toast--${toast.tone}`}>
          {toast.message}
        </div>
      ) : null}
    </div>
  );
}

function describeCouponDiscount(coupon) {
  if (coupon.discount_type === "free_shipping") return "무료배송";
  if (coupon.discount_type === "percentage") {
    return `${coupon.discount_value}% 할인${
      coupon.max_discount_amount ? ` (최대 ${formatCurrency(coupon.max_discount_amount)})` : ""
    }`;
  }
  return `${formatCurrency(coupon.discount_value)} 할인`;
}

// 새 구매 내역 화면. 상단 통계 카드 5개 + 날짜별로 묶인 주문 카드 리스트.
// 한 주문(order) 안의 각 item을 별개의 카드로 보여주고, 액션은 배송 조회 / 재구매로 단순화.
// 배송 전(canCancel) 상태에서는 "주문 취소"가 추가로 노출되고, 반품은 주문 상세 흐름으로 위임.
// 주문내역 상세보기 팝업 — 결제일시/결제방법/금액 내역(상품·쿠폰·배송비·합산)을 노출.
// 찜 목록 품절 카드 전용 — 상세 페이지까지 가지 않고 카드에서 바로 재입고 알림 신청/해제.
// 노출 조건(품절 + 핸들러 존재)은 호출부에서 판단한다.
function WishlistRestockButton({ busyProductId, onToggle, product, subscribedIds }) {
  const productKey = String(product.id);
  const isSubscribed = Boolean(subscribedIds?.has(productKey));
  const isBusy = busyProductId === productKey;

  return (
    <button
      className={`public-product-card__restock-btn${isSubscribed ? " is-subscribed" : ""}`}
      disabled={isBusy}
      onClick={(event) => {
        // 카드 전체를 덮는 상세 링크로 클릭이 전파되지 않도록 차단.
        event.preventDefault();
        event.stopPropagation();
        onToggle(product.id);
      }}
      type="button"
    >
      {isBusy ? (
        "처리 중..."
      ) : isSubscribed ? (
        <><BellIcon size={14} /> 재입고 알림 받는 중 · 해제</>
      ) : (
        <><BellIcon size={14} /> 재입고 알림 신청</>
      )}
    </button>
  );
}

function WishlistTab({
  isLoading,
  onToggleFavorite,
  onToggleRestockAlert,
  restockBusyProductId,
  restockSubscribedIds,
  wishlistError,
  wishlistProducts,
}) {
  const gridRef = useRef(null);
  const emptyTrackedRef = useRef(false);

  // GA4 찜 목록 노출 — 그리드가 실제로 화면에 들어왔을 때 1회(view_item_list + 요약)
  useInViewOnce(
    gridRef,
    () => {
      const lines = wishlistProducts.map((product, index) => ({
        productId: product.id,
        title: product.title,
        brand: product.brand,
        subject: product.subject,
        price: product.price,
        quantity: 1,
        index,
      }));
      trackViewItemList(WISHLIST_LIST_NAME, lines);
      trackEvent("view_wishlist", {
        itemCount: wishlistProducts.length,
        soldoutCount: wishlistProducts.filter((product) => product.isSoldOut).length,
      });
    },
    { enabled: !isLoading && wishlistProducts.length > 0 },
  );

  // GA4 찜 빈 상태
  useEffect(() => {
    if (isLoading || wishlistProducts.length > 0 || emptyTrackedRef.current) return;
    emptyTrackedRef.current = true;
    trackEmptyState("mypage_wishlist");
  }, [isLoading, wishlistProducts.length]);

  return (
    <div className="public-mypage-stack">
      <section className="public-mypage-section">
        {wishlistError ? (
          <p className="public-auth-inline-message public-auth-inline-message--error">
            {wishlistError}
          </p>
        ) : null}

        {isLoading ? (
          <div className="public-mypage-wishlist-grid" role="status" aria-live="polite">
            {Array.from({ length: 4 }, (_, index) => (
              <ProductCardSkeleton key={`mypage-wishlist-skeleton-${index}`} />
            ))}
          </div>
        ) : wishlistProducts.length ? (
          <div className="public-mypage-wishlist-grid" ref={gridRef}>
            {wishlistProducts.map((product, index) => (
              <ProductCard
                analyticsIndex={index}
                analyticsListName={WISHLIST_LIST_NAME}
                footer={
                  product.isSoldOut && typeof onToggleRestockAlert === "function" ? (
                    <WishlistRestockButton
                      busyProductId={restockBusyProductId}
                      onToggle={onToggleRestockAlert}
                      product={product}
                      subscribedIds={restockSubscribedIds}
                    />
                  ) : null
                }
                isFavorite
                key={product.id}
                onToggleFavorite={onToggleFavorite}
                product={product}
              />
            ))}
          </div>
        ) : (
          <MypageEmptyState
            actionLabel="스토어 둘러보기"
            actionTo="/"
            icon={<MypageEmptyIcon src={heartPlusIcon} />}
            title="아직 찜한 교재가 없어요"
          />
        )}
      </section>
    </div>
  );
}

function SettingsTab({
  busyAccountId,
  busyAddressId,
  currentNickname,
  handleProfileChange,
  handleSaveProfile,
  handleSetDefaultAccount,
  handleSetDefaultAddress,
  handleSignOut,
  handleWithdrawal,
  isDemoPreview,
  isProfileEditing,
  isSavingProfile,
  isSigningOut,
  isWishlistLoading,
  isWishlistProductsLoading,
  isWithdrawing,
  joinDateText,
  nicknameStatus,
  onToggleRestockAlert,
  onToggleWishlistProduct,
  openAccountSheet,
  openAddressSheet,
  portalState,
  profileErrors,
  profileForm,
  profileSnapshot,
  requestDeleteAccount,
  requestDeleteAddress,
  restockBusyProductId,
  restockSubscribedIds,
  section,
  setIsProfileEditing,
  setProfileErrors,
  setProfileForm,
  user,
  wishlistError,
  wishlistProducts,
}) {
  const { identity, isPhoneUser } = usePublicAuth();
  // 사이드바에서 들어왔을 때 해당 섹션만 노출. section이 비면(null) 기존처럼 전체 노출(레거시 호환).
  const showProfile = !section || section === "profile";
  const showAddresses = !section || section === "addresses";
  const showSettlementAccount = !section || section === "settlement-account";
  const showWishlist = !section; // 새 사이드바에서는 wishlist를 별도 메뉴로 빼냈음
  const showAccount = !section || section === "profile";

  // GA4 빈 상태 — 배송지/정산계좌 각각 1회
  const settingsEmptyGuardRef = useRef(makeOnceGuard());
  useEffect(() => {
    if (
      showAddresses &&
      portalState.shippingAddresses.length === 0 &&
      settingsEmptyGuardRef.current("addresses")
    ) {
      trackEmptyState("mypage_addresses");
    }
    if (
      showSettlementAccount &&
      portalState.settlementAccounts.length === 0 &&
      settingsEmptyGuardRef.current("settlement_accounts")
    ) {
      trackEmptyState("mypage_settlement_accounts");
    }
  }, [
    portalState.settlementAccounts.length,
    portalState.shippingAddresses.length,
    showAddresses,
    showSettlementAccount,
  ]);

  return (
    <div className="public-mypage-stack">
      {showProfile ? (
      <section className="public-mypage-section">
        <MypageSectionHeader
          action={
            isProfileEditing ? (
              <div className="public-mypage-inline-actions">
                <button
                  className="public-mypage-inline-button"
                  onClick={() => {
                    // GA4 프로필 수정 이탈 (저장하지 않고 취소)
                    trackFormAbandon("profile_edit", { uiSurface: "mypage_profile" });
                    setIsProfileEditing(false);
                    setProfileForm(buildProfileForm(profileSnapshot, user));
                    setProfileErrors(initialProfileErrors);
                  }}
                  type="button"
                >
                  취소
                </button>
                <button
                  className="public-mypage-inline-button public-mypage-inline-button--primary"
                  disabled={isSavingProfile}
                  onClick={(event) => {
                    void handleSaveProfile(event);
                  }}
                  type="button"
                >
                  {isSavingProfile ? "처리 중..." : "저장"}
                </button>
              </div>
            ) : (
              <button
                className="public-mypage-inline-button"
                onClick={() => {
                  // GA4 프로필 수정 진입 (저장까지의 이탈률 분모)
                  trackEvent("profile_edit_open", { uiSurface: "mypage_profile" });
                  setIsProfileEditing(true);
                }}
                type="button"
              >
                수정
              </button>
            )
          }
          description="기본 정보는 수거 요청과 주문 수령 정보에 함께 사용됩니다."
          icon={<UserIcon size={18} />}
          title="프로필 정보"
        />

        {isProfileEditing ? (
          <ProfileEditor
            currentNickname={currentNickname}
            handleProfileChange={handleProfileChange}
            handleSaveProfile={handleSaveProfile}
            nicknameStatus={nicknameStatus}
            profileErrors={profileErrors}
            profileForm={profileForm}
          />
        ) : (
          <dl className="public-mypage-profile-list">
            <div className="public-mypage-profile-list__item">
              <dt>이름</dt>
              <dd>{profileSnapshot?.name || "-"}</dd>
            </div>
            <div className="public-mypage-profile-list__item">
              <dt>이메일</dt>
              <dd>
                {(() => {
                  const rawEmail = profileSnapshot?.email || user?.email || "";
                  if (!rawEmail) return "-";
                  if (/@oauth\.subook\.local$/i.test(rawEmail)) {
                    return isPhoneUser ? "휴대폰 계정 (이메일 미연동)" : "카카오 계정 (이메일 미연동)";
                  }
                  return rawEmail;
                })()}{" "}
                <em>(변경불가)</em>
              </dd>
            </div>
            <div className="public-mypage-profile-list__item">
              <dt>연락처</dt>
              <dd>{identity?.phone || profileSnapshot?.phone || "-"}</dd>
            </div>
            <div className="public-mypage-profile-list__item">
              <dt>닉네임</dt>
              <dd>{profileSnapshot?.nickname || profileSnapshot?.name || "-"}</dd>
            </div>
            <div className="public-mypage-profile-list__item">
              <dt>가입일</dt>
              <dd>{joinDateText}</dd>
            </div>
          </dl>
        )}
      </section>
      ) : null}

      {showAddresses ? (
      <section className="public-mypage-section">
        <MypageSectionHeader
          action={
            <button className="public-mypage-inline-button public-mypage-inline-button--primary" onClick={() => openAddressSheet()} type="button">
              + 새 주소
            </button>
          }
          description="주문 때 자주 쓰는 배송지를 최대 5개까지 등록할 수 있습니다."
          icon={<MapPinIcon size={18} />}
          title="배송지 관리"
        />

        {portalState.shippingAddresses.length ? (
          <div className="public-mypage-card-list">
            {portalState.shippingAddresses.map((address) => (
              <article className="public-mypage-item-card" key={address.id}>
                <div className="public-mypage-item-card__head">
                  <div>
                    <div className="public-mypage-item-card__title-row">
                      <strong className="public-mypage-item-card__title">{address.label}</strong>
                      {address.is_default ? <span className="public-mypage-badge">기본 배송지</span> : null}
                    </div>
                    <p className="public-mypage-item-card__meta">
                      {address.recipient_name} · {address.recipient_phone}
                    </p>
                  </div>
                  <div className="public-mypage-item-card__actions">
                    {!address.is_default ? (
                      <button
                        className="public-mypage-text-button"
                        disabled={busyAddressId === address.id}
                        onClick={() => handleSetDefaultAddress(address.id)}
                        type="button"
                      >
                        기본으로 설정
                      </button>
                    ) : null}
                    <button className="public-mypage-text-button" onClick={() => openAddressSheet(address)} type="button">
                      수정
                    </button>
                    <button
                      className="public-mypage-text-button public-mypage-text-button--danger"
                      disabled={busyAddressId === address.id}
                      onClick={() => requestDeleteAddress(address)}
                      type="button"
                    >
                      삭제
                    </button>
                  </div>
                </div>
                <p className="public-mypage-item-card__body">
                  {address.address_line1}
                  {address.address_line2 ? `, ${address.address_line2}` : ""}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <MypageEmptyState description="주문 전에 기본 배송지를 미리 등록해 두면 더 편하게 이용할 수 있어요." icon={<MapPinIcon size={40} />} title="등록한 배송지가 없어요" />
        )}
      </section>
      ) : null}

      {showSettlementAccount ? (
      <section className="public-mypage-section">
        <MypageSectionHeader
          action={
            <button className="public-mypage-inline-button public-mypage-inline-button--primary" onClick={() => openAccountSheet()} type="button">
              + 새 계좌
            </button>
          }
          description="판매 정산을 받기 위해선 기본 계좌가 등록되어야 합니다. 계좌 정보는 정산 시에만 사용되며, 암호화되어 안전하게 보관됩니다."
          icon={<CoinIcon size={18} />}
          title="정산 계좌 관리"
        />

        {portalState.settlementAccounts.length ? (
          <div className="public-mypage-card-list">
            {portalState.settlementAccounts.map((account) => (
              <article className="public-mypage-item-card" key={account.id}>
                <div className="public-mypage-item-card__head">
                  <div>
                    <div className="public-mypage-item-card__title-row">
                      <strong className="public-mypage-item-card__title">{account.bank_name}</strong>
                      {account.is_default ? <span className="public-mypage-badge">기본 계좌</span> : null}
                    </div>
                    <p className="public-mypage-item-card__meta">
                      {maskAccountNumber(account.account_number, account.account_last4 ?? account.account_number_last4)} · {account.account_holder}
                    </p>
                  </div>
                  <div className="public-mypage-item-card__actions">
                    {!account.is_default ? (
                      <button
                        className="public-mypage-text-button"
                        disabled={busyAccountId === account.id}
                        onClick={() => handleSetDefaultAccount(account.id)}
                        type="button"
                      >
                        기본으로 설정
                      </button>
                    ) : null}
                    <button className="public-mypage-icon-button" onClick={() => openAccountSheet(account)} type="button" aria-label="수정">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7.24264 17.9967H3V13.754L14.435 2.319C14.8256 1.92848 15.4587 1.92848 15.8492 2.319L18.6777 5.14743C19.0682 5.53795 19.0682 6.17112 18.6777 6.56164L7.24264 17.9967ZM3 19.9967H21V21.9967H3V19.9967Z" /></svg>
                    </button>
                    <button
                      className="public-mypage-icon-button public-mypage-icon-button--danger"
                      disabled={busyAccountId === account.id}
                      onClick={() => requestDeleteAccount(account)}
                      type="button"
                      aria-label="삭제"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 6V3C7 2.44772 7.44772 2 8 2H16C16.5523 2 17 2.44772 17 3V6H22V8H20V21C20 21.5523 19.5523 22 19 22H5C4.44772 22 4 21.5523 4 21V8H2V6H7ZM13.4142 13.9997L15.182 12.232L13.7678 10.8178L12 12.5855L10.2322 10.8178L8.81802 12.232L10.5858 13.9997L8.81802 15.7675L10.2322 17.1817L12 15.4139L13.7678 17.1817L15.182 15.7675L13.4142 13.9997ZM9 4V6H15V4H9Z" /></svg>
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <MypageEmptyState icon={<MypageEmptyIcon src={accountIcon} />} title="등록한 정산 계좌가 없어요" />
        )}
      </section>
      ) : null}

      {showWishlist ? (
      <section className="public-mypage-section">
        <MypageSectionHeader
          action={
            <Link className="public-mypage-inline-button" to="/">
              스토어 보기
            </Link>
          }
          description="찜해 둔 교재를 모아보고 품절 여부까지 한 번에 확인할 수 있어요."
          icon={<HeartIcon size={18} />}
          title="찜한 교재"
        />

        {wishlistError ? (
          <p className="public-auth-inline-message public-auth-inline-message--error">
            {wishlistError}
          </p>
        ) : null}

        {isWishlistLoading || isWishlistProductsLoading ? (
          <div className="public-mypage-wishlist-grid" role="status" aria-live="polite">
            {Array.from({ length: 2 }, (_, index) => (
              <ProductCardSkeleton key={`mypage-wishlist-skeleton-${index}`} />
            ))}
          </div>
        ) : wishlistProducts.length ? (
          <div className="public-mypage-wishlist-grid">
            {wishlistProducts.map((product, index) => (
              <ProductCard
                analyticsIndex={index}
                analyticsListName={WISHLIST_LIST_NAME}
                footer={
                  product.isSoldOut && typeof onToggleRestockAlert === "function" ? (
                    <WishlistRestockButton
                      busyProductId={restockBusyProductId}
                      onToggle={onToggleRestockAlert}
                      product={product}
                      subscribedIds={restockSubscribedIds}
                    />
                  ) : null
                }
                isFavorite
                key={product.id}
                onToggleFavorite={onToggleWishlistProduct}
                product={product}
              />
            ))}
          </div>
        ) : (
          <MypageEmptyState
            actionLabel="스토어 둘러보기"
            actionTo="/"
            description="마음에 드는 교재를 찜해두면 설정 탭에서 다시 빠르게 확인할 수 있어요."
            icon={<HeartIcon size={40} />}
            title="아직 찜한 교재가 없어요"
          />
        )}
      </section>
      ) : null}

      {showAccount ? (
      <section className="public-mypage-section public-mypage-section--compact">
        <MypageSectionHeader
          description={isDemoPreview ? "데모에서는 로그아웃 대신 홈으로 돌아갑니다." : "로그아웃과 회원탈퇴 관련 작업을 여기서 관리합니다."}
          icon={<LockIcon size={18} />}
          title="계정"
        />
        <div className="public-mypage-account-actions">
          <button className="public-auth-button public-auth-button--secondary" disabled={isSigningOut} onClick={handleSignOut} type="button">
            {isDemoPreview ? "데모 종료" : isSigningOut ? "로그아웃 중..." : "로그아웃"}
          </button>
        </div>
        {/* 회원탈퇴는 큰 버튼 대신 하단의 작은 텍스트 링크로만 노출 (2026-07-13 피드백) */}
        <p className="public-mypage-withdrawal-line">
          더 이상 수북을 이용하지 않으시나요?{" "}
          <button
            className="public-mypage-withdrawal-link"
            disabled={isWithdrawing}
            onClick={handleWithdrawal}
            type="button"
          >
            {isWithdrawing ? "처리 중..." : "회원탈퇴"}
          </button>
        </p>
      </section>
      ) : null}
    </div>
  );
}

function ProfileEditor({
  currentNickname,
  handleProfileChange,
  handleSaveProfile,
  nicknameStatus,
  profileErrors,
  profileForm,
}) {
  const { identity, isPhoneUser } = usePublicAuth();
  return (
    <form className="public-mypage-form" noValidate onSubmit={handleSaveProfile}>
      <div className="public-mypage-form-grid">
        <div className={`public-auth-field-row ${profileErrors.name ? "is-error" : ""}`}>
          <label className="public-auth-field-row__label" htmlFor="public-mypage-name">
            이름
          </label>
          <div className="public-auth-field-row__control">
            <input className="public-auth-field-row__input" id="public-mypage-name" onChange={handleProfileChange("name")} placeholder="홍길동" type="text" value={profileForm.name} />
          </div>
          {profileErrors.name ? <p className="public-auth-inline-message public-auth-inline-message--error">{profileErrors.name}</p> : null}
        </div>
        <div className="public-mypage-static-field">
          <span className="public-mypage-static-field__label">이메일</span>
          <span className="public-mypage-static-field__value">
            {/@oauth\.subook\.local$/i.test(profileForm.email || "")
              ? (isPhoneUser ? "휴대폰 계정 (이메일 미연동)" : "카카오 계정 (이메일 미연동)")
              : profileForm.email}{" "}
            <em>(변경불가)</em>
          </span>
        </div>
        <div className={`public-auth-field-row ${profileErrors.phone ? "is-error" : ""}`}>
          <label className="public-auth-field-row__label" htmlFor="public-mypage-phone">
            연락처
          </label>
          <div className="public-auth-field-row__control">
            <input className="public-auth-field-row__input" id="public-mypage-phone" inputMode="numeric" onChange={handleProfileChange("phone")} placeholder="010-1234-5678" type="tel" value={identity?.enabled ? identity.phone || profileForm.phone : profileForm.phone} readOnly={Boolean(identity?.enabled)} />
          </div>
          {identity?.enabled && <p className="public-auth-inline-message">인증된 번호입니다. 번호 변경은 고객센터로 문의해 주세요.</p>}
          {profileErrors.phone ? <p className="public-auth-inline-message public-auth-inline-message--error">{profileErrors.phone}</p> : null}
        </div>
        <div className={`public-auth-field-row ${profileErrors.nickname ? "is-error" : ""}`}>
          <label className="public-auth-field-row__label" htmlFor="public-mypage-nickname">
            닉네임
          </label>
          <div className="public-auth-field-row__control">
            <input className="public-auth-field-row__input" id="public-mypage-nickname" onChange={handleProfileChange("nickname")} placeholder="수능킹" type="text" value={profileForm.nickname} />
          </div>
          {profileErrors.nickname ? (
            <p className="public-auth-inline-message public-auth-inline-message--error">{profileErrors.nickname}</p>
          ) : nicknameStatus.message ? (
            <p className={`public-auth-inline-message public-auth-inline-message--${nicknameStatus.tone}`}>{nicknameStatus.message}</p>
          ) : currentNickname ? (
            <p className="public-auth-inline-message public-auth-inline-message--info">현재 닉네임: {currentNickname}</p>
          ) : null}
        </div>
      </div>
      <Link
        className="public-auth-ghost-link"
        onClick={() =>
          // GA4 비밀번호 변경 진입 (마이페이지 → 재설정 메일 흐름)
          trackSelectContent("auth_entry", "forgot_password", { uiSurface: "mypage_profile" })
        }
        to="/forgot-password"
      >
        비밀번호 변경 <ArrowRightIcon size={13} />
      </Link>
    </form>
  );
}

function AddressSheet({
  addressDetailInputRef,
  addressErrors,
  addressForm,
  closeAddressSheet,
  handleAddressChange,
  handleOpenAddressSearch,
  handleSaveAddress,
  isAddressSheetOpen,
  isSavingAddress,
  isSearchingAddress,
}) {
  return (
    <ResponsiveSheet
      actions={
        <>
          <button
            className="public-auth-button public-auth-button--secondary"
            onClick={() => {
              // GA4 — 푸터 취소는 시트가 못 잡으므로 여기서 close_method를 남긴다.
              trackDialogClose("address_form", "cancel_button", {
                uiAction: addressForm.id ? "edit" : "create",
              });
              closeAddressSheet();
            }}
            type="button"
          >
            취소
          </button>
          <button
            className="public-auth-button public-auth-button--primary"
            disabled={isSavingAddress}
            onClick={(event) => {
              void handleSaveAddress(event);
            }}
            type="button"
          >
            {isSavingAddress ? "처리 중..." : "저장"}
          </button>
        </>
      }
      analyticsExtra={{ uiAction: addressForm.id ? "edit" : "create" }}
      analyticsName="address_form"
      eyebrow="배송지"
      onClose={closeAddressSheet}
      open={isAddressSheetOpen}
      title={addressForm.id ? "배송지 수정" : "배송지 추가"}
    >
      <form className="public-mypage-form" noValidate onSubmit={handleSaveAddress}>
        <div className={`public-auth-field-row ${addressErrors.label ? "is-error" : ""}`}>
          <label className="public-auth-field-row__label" htmlFor="public-mypage-address-label">
            배송지명
          </label>
          <div className="public-auth-field-row__control">
            <input className="public-auth-field-row__input" id="public-mypage-address-label" onChange={handleAddressChange("label")} placeholder="예: 집, 학원, 기숙사" type="text" value={addressForm.label} />
          </div>
          {addressErrors.label ? <p className="public-auth-inline-message public-auth-inline-message--error">{addressErrors.label}</p> : null}
        </div>
        <div className={`public-auth-field-row ${addressErrors.recipient_name ? "is-error" : ""}`}>
          <label className="public-auth-field-row__label" htmlFor="public-mypage-address-recipient">
            수령인
          </label>
          <div className="public-auth-field-row__control">
            <input className="public-auth-field-row__input" id="public-mypage-address-recipient" onChange={handleAddressChange("recipient_name")} placeholder="홍길동" type="text" value={addressForm.recipient_name} />
          </div>
          {addressErrors.recipient_name ? <p className="public-auth-inline-message public-auth-inline-message--error">{addressErrors.recipient_name}</p> : null}
        </div>
        <div className={`public-auth-field-row ${addressErrors.recipient_phone ? "is-error" : ""}`}>
          <label className="public-auth-field-row__label" htmlFor="public-mypage-address-phone">
            연락처
          </label>
          <div className="public-auth-field-row__control">
            <input className="public-auth-field-row__input" id="public-mypage-address-phone" inputMode="numeric" onChange={handleAddressChange("recipient_phone")} placeholder="010-1234-5678" type="tel" value={addressForm.recipient_phone} />
          </div>
          {addressErrors.recipient_phone ? <p className="public-auth-inline-message public-auth-inline-message--error">{addressErrors.recipient_phone}</p> : null}
        </div>
        <div className={`public-auth-field-row ${addressErrors.address_line1 ? "is-error" : ""}`}>
          <span className="public-auth-field-row__label">주소</span>
          <button className="public-auth-button public-auth-button--secondary public-mypage-sheet__search-button" onClick={handleOpenAddressSearch} type="button">
            {isSearchingAddress ? (
              <>
                <span aria-hidden="true" className="public-auth-spinner public-auth-spinner--button" />
                <span>검색 준비 중...</span>
              </>
            ) : (
              "[주소 검색]"
            )}
          </button>
          <div className="public-auth-field-row__control">
            <input className="public-auth-field-row__input" placeholder="주소 검색 후 자동으로 채워집니다." readOnly type="text" value={addressForm.address_line1} />
          </div>
          {addressForm.postal_code ? <p className="public-auth-inline-message public-auth-inline-message--info">우편번호 {addressForm.postal_code}</p> : null}
          {addressErrors.address_line1 ? <p className="public-auth-inline-message public-auth-inline-message--error">{addressErrors.address_line1}</p> : null}
        </div>
        <div className={`public-auth-field-row ${addressErrors.address_line2 ? "is-error" : ""}`}>
          <label className="public-auth-field-row__label" htmlFor="public-mypage-address-detail">
            상세 주소
          </label>
          <div className="public-auth-field-row__control">
            <input className="public-auth-field-row__input" id="public-mypage-address-detail" onChange={handleAddressChange("address_line2")} placeholder="101동 1201호" ref={addressDetailInputRef} type="text" value={addressForm.address_line2} />
          </div>
          {addressErrors.address_line2 ? <p className="public-auth-inline-message public-auth-inline-message--error">{addressErrors.address_line2}</p> : null}
        </div>
        <label className="public-auth-check">
          <input checked={addressForm.is_default} onChange={handleAddressChange("is_default")} type="checkbox" />
          <span>기본 배송지로 설정</span>
        </label>
      </form>
    </ResponsiveSheet>
  );
}

function AccountSheet({
  accountErrors,
  accountForm,
  closeAccountSheet,
  handleAccountChange,
  handleSaveAccount,
  isAccountSheetOpen,
  isSavingAccount,
}) {
  return (
    <ResponsiveSheet
      actions={
        <>
          <button
            className="public-auth-button public-auth-button--secondary"
            onClick={() => {
              trackDialogClose("settlement_account_form", "cancel_button", {
                uiAction: accountForm.id ? "edit" : "create",
              });
              closeAccountSheet();
            }}
            type="button"
          >
            취소
          </button>
          <button
            className="public-auth-button public-auth-button--primary"
            disabled={isSavingAccount}
            onClick={(event) => {
              void handleSaveAccount(event);
            }}
            type="button"
          >
            {isSavingAccount ? "처리 중..." : "저장"}
          </button>
        </>
      }
      analyticsExtra={{ uiAction: accountForm.id ? "edit" : "create" }}
      analyticsName="settlement_account_form"
      onClose={closeAccountSheet}
      open={isAccountSheetOpen}
      title={accountForm.id ? "정산 계좌 수정" : "정산 계좌 추가"}
    >
      <form className="public-mypage-form" noValidate onSubmit={handleSaveAccount}>
        <div className={`public-auth-field-row ${accountErrors.bank_name ? "is-error" : ""}`}>
          <label className="public-auth-field-row__label" htmlFor="public-mypage-account-bank">
            은행
          </label>
          <div className="public-auth-field-row__control">
            <select
              className="public-mypage-select"
              id="public-mypage-account-bank"
              onChange={(event) => {
                handleAccountChange("bank_name")(event);
                // GA4 은행 선택 — 은행명은 PII가 아니라 그대로 남긴다.
                if (event.target.value) {
                  trackEvent("settlement_account_bank_select", {
                    bankName: event.target.value,
                    uiSurface: "mypage",
                  });
                }
              }}
              value={accountForm.bank_name}
            >
              <option value="">은행 선택</option>
              {BANK_OPTIONS.map((bankName) => (
                <option key={bankName} value={bankName}>
                  {bankName}
                </option>
              ))}
            </select>
          </div>
          {accountErrors.bank_name ? <p className="public-auth-inline-message public-auth-inline-message--error">{accountErrors.bank_name}</p> : null}
        </div>
        <div className={`public-auth-field-row ${accountErrors.account_number ? "is-error" : ""}`}>
          <label className="public-auth-field-row__label" htmlFor="public-mypage-account-number">
            계좌번호
          </label>
          <div className="public-auth-field-row__control">
            <input className="public-auth-field-row__input" id="public-mypage-account-number" onChange={handleAccountChange("account_number")} placeholder={accountForm.id ? "변경할 때만 입력" : "110-123-456789"} type="text" value={accountForm.account_number} />
          </div>
          {accountErrors.account_number ? (
            <p className="public-auth-inline-message public-auth-inline-message--error">{accountErrors.account_number}</p>
          ) : accountForm.id ? (
            <p className="public-auth-inline-message public-auth-inline-message--info">기존 계좌번호는 저장 후에도 마지막 4자리만 표시됩니다.</p>
          ) : null}
        </div>
        <div className={`public-auth-field-row ${accountErrors.account_holder ? "is-error" : ""}`}>
          <label className="public-auth-field-row__label" htmlFor="public-mypage-account-holder">
            예금주
          </label>
          <div className="public-auth-field-row__control">
            <input className="public-auth-field-row__input" id="public-mypage-account-holder" onChange={handleAccountChange("account_holder")} placeholder="홍길동" type="text" value={accountForm.account_holder} />
          </div>
          {accountErrors.account_holder ? <p className="public-auth-inline-message public-auth-inline-message--error">{accountErrors.account_holder}</p> : null}
        </div>
        <label className="public-auth-check">
          <input checked={accountForm.is_default} onChange={handleAccountChange("is_default")} type="checkbox" />
          <span>기본 계좌로 설정</span>
        </label>
      </form>
    </ResponsiveSheet>
  );
}

export default PublicMypagePage;
