import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { formatCurrency } from "@shared-domain/format";
import PublicSiteHeader from "../components/PublicSiteHeader";
import ContentContainer from "../components/ContentContainer";
import ProductCard, { ProductCardSkeleton } from "../components/ProductCard";
import PublicFooter from "../components/PublicFooter";
import {
  CANCEL_REASON_CATEGORIES,
  ConfirmDialog,
  MypageEmptyState,
  MypageSectionHeader,
  ResponsiveSheet,
} from "../components/PublicMypageUi.jsx";
import PublicPageFrame from "../components/PublicPageFrame";
import PublicToastMessage from "../components/PublicToastMessage";
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  BellIcon,
  BookIcon,
  BoxIcon,
  CardIcon,
  CartIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  CoinIcon,
  HeartIcon,
  LockIcon,
  MapPinIcon,
  TicketIcon,
  UserIcon,
} from "../components/icons";
import { supabase as publicSupabase } from "@shared-supabase/publicSupabaseClient";
import { usePublicAuth } from "../contexts/PublicAuthContext";
import { usePublicWishlist } from "../contexts/PublicWishlistContext";
import usePublicMemberGate from "../lib/publicMemberGate";
import { usePageMeta } from "../lib/usePageMeta";
import { DEMO_MEMBER_PROFILE, DEMO_MEMBER_USER } from "../lib/publicMypageDemo";
import {
  cancelMemberOrder,
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
  PURCHASE_SUMMARY_CARDS,
  SALES_STATUS_FILTERS,
  SHIPMENT_PROGRESS_STEPS,
  SIDEBAR_GROUPS,
  buildAccountForm,
  buildAddressForm,
  buildCjTrackingUrl,
  buildProfileForm,
  countOrdersByStatuses,
  deriveSettlementMetrics,
  deriveShipmentMetrics,
  filterShipmentsByStatus,
  findSidebarItem,
  formatCompactDate,
  formatDateTime,
  formatShipmentReference,
  getDefaultTabForMember,
  getOrderStatusLabel,
  getOrderStatusTone,
  getPaymentMethodLabel,
  getShipmentProgressIndex,
  getShipmentStatusLabel,
  getShipmentStatusTone,
  getTabKeyFromHash,
  groupOrdersByDate,
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
import { formatPhoneNumber, hasValidPhoneNumber } from "../lib/publicAuthFormUtils";
import { fetchWishlistProducts } from "../lib/publicWishlist";
import {
  fetchMyRestockSubscribedProductIds,
  subscribeRestock,
  unsubscribeRestock,
} from "../lib/publicRestock";
import { getThumbnailImageUrl } from "../lib/storageImage";
import {
  BANK_ACCOUNT,
  BANK_HOLDER,
  BANK_NAME,
  PAYMENT_DEADLINE_HOURS,
  buildDepositorName,
} from "../lib/paymentBankInfo";
import "./PublicMypagePage.css";

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

  const effectiveUser = user ?? (isDemoPreview ? DEMO_MEMBER_USER : null);
  const effectiveProfile = profile ?? (isDemoPreview ? DEMO_MEMBER_PROFILE : null);

  const [activeTabKey, setActiveTabKey] = useState(() => getTabKeyFromHash(location.hash));
  const [loadedTabs, setLoadedTabs] = useState(initialLoadedTabs);
  const [tabPhases, setTabPhases] = useState(initialTabPhases);
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
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [confirmState, setConfirmState] = useState(initialConfirmState);
  const [confirmReason, setConfirmReason] = useState("");
  const [confirmReasonCategory, setConfirmReasonCategory] = useState("");
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

  const profileSnapshot = portalState.profile ?? effectiveProfile;
  const displayName = createDisplayName(profileSnapshot);
  const joinDateText = formatCompactDate(effectiveUser?.created_at ?? profileSnapshot?.created_at);
  const dataKey = resolveDataKey(activeTabKey);
  const isPortalPending = tabPhases[dataKey] === "loading" && !portalState.profile;
  const currentNickname = (profileSnapshot?.nickname ?? profileSnapshot?.name ?? "").trim();
  const activeSidebarItem = findSidebarItem(activeTabKey);

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

  useEffect(() => {
    if (!effectiveUser || loadedTabs[dataKey]) {
      return undefined;
    }

    let isCancelled = false;

    setTabPhases((currentValue) => ({
      ...currentValue,
      [dataKey]: "loading",
    }));

    const timerId = window.setTimeout(async () => {
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
      setLoadedTabs((currentValue) => ({
        ...currentValue,
        [dataKey]: true,
      }));
      setTabPhases((currentValue) => ({
        ...currentValue,
        [dataKey]: "ready",
      }));
      setExpandedShipmentId(
        snapshot.shipments.find((shipment) => !shipment.compact)?.id ?? snapshot.shipments[0]?.id ?? null,
      );
    }, portalState.profile ? 120 : 0);

    return () => {
      isCancelled = true;
      window.clearTimeout(timerId);
    };
  }, [
    dataKey,
    effectiveProfile,
    effectiveUser,
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

    if (favoriteIds.length === 0) {
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
      // 구독 목록 로드 실패는 치명적이지 않음 — 버튼이 "신청" 기본 상태로 보일 뿐.
      setRestockSubscribedIds(restockResult.productIds);
      setIsWishlistProductsLoading(false);
    };

    void loadWishlist();

    return () => {
      isCancelled = true;
    };
  }, [activeTabKey, effectiveUser, favoriteIds, isDemoPreview]);

  // 찜 목록 품절 카드의 재입고 알림 신청/해제 토글.
  const handleToggleRestockAlert = async (productId) => {
    const productKey = String(productId);
    const isSubscribed = restockSubscribedIds.has(productKey);

    setRestockBusyProductId(productKey);
    const result = isSubscribed
      ? await unsubscribeRestock(productId)
      : await subscribeRestock(productId);
    setRestockBusyProductId(null);

    if (result.error) {
      setToastState({
        message: "재입고 알림 처리에 실패했어요. 잠시 후 다시 시도해 주세요.",
        tone: "error",
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

    if (!expandedShipmentId) {
      setExpandedShipmentId(
        snapshot.shipments.find((shipment) => !shipment.compact)?.id ?? snapshot.shipments[0]?.id ?? null,
      );
    }

    if (nextToast) {
      setToastState(nextToast);
    }
  };

  const moveToTab = (tabKey, options = {}) => {
    const { openProfileEdit = false, smoothScroll = true } = options;

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
    return Object.values(nextErrors).every((value) => !value);
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
    return Object.values(nextErrors).every((value) => !value);
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
    return Object.values(nextErrors).every((value) => !value);
  };

  const handleSaveProfile = async (event) => {
    event.preventDefault();

    const isValid = await validateProfile();
    if (!isValid || !effectiveUser) {
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
      return;
    }

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

    if (!addressForm.id && portalState.shippingAddresses.length >= MAX_SAVED_ITEMS) {
      setToastState({
        message: "최대 5개까지 등록할 수 있습니다.",
        tone: "error",
      });
      return;
    }

    if (!validateAddress()) {
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
      return;
    }

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

    if (!accountForm.id && portalState.settlementAccounts.length >= MAX_SAVED_ITEMS) {
      setToastState({
        message: "최대 5개까지 등록할 수 있습니다.",
        tone: "error",
      });
      return;
    }

    if (!validateAccount()) {
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
      return;
    }

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
      return;
    }

    if (address.is_default) {
      setToastState({
        message: "다른 주소를 기본으로 설정한 뒤 삭제해 주세요.",
        tone: "error",
      });
      return;
    }

    setConfirmState({
      open: true,
      type: "address",
      itemId: address.id,
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
      return;
    }

    if (account.is_default) {
      setToastState({
        message: "다른 계좌를 기본으로 설정한 뒤 삭제해 주세요.",
        tone: "error",
      });
      return;
    }

    setConfirmState({
      open: true,
      type: "account",
      itemId: account.id,
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
      title: "구매를 확정하시겠습니까?",
      body: "확정 후에는 반품이 불가합니다.",
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

  const handleConfirmAction = async () => {
    if ((!confirmState.itemId && confirmState.type !== "withdrawal") || !effectiveUser) {
      closeConfirmDialog();
      return;
    }

    if (confirmState.type === "withdrawal") {
      setIsWithdrawing(true);
      const result = await requestMemberWithdrawal({
        user: effectiveUser,
        demoMode: isDemoPreview,
      });
      setIsWithdrawing(false);

      if (result.error) {
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
        setToastState({
          message: result.error.message || "배송지를 삭제하지 못했습니다.",
          tone: "error",
        });
      } else {
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
        setToastState({
          message: result.error.message || "정산 계좌를 삭제하지 못했습니다.",
          tone: "error",
        });
      } else {
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
      });
      setBusyOrderId(null);

      if (result.error) {
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
      });
      setBusyOrderId(null);

      if (result.error) {
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

    if (confirmState.type === "refund_order") {
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
        reason: combinedReason,
        demoMode: isDemoPreview,
      });
      setBusyOrderId(null);
      setIsConfirmBusy(false);

      if (result.error) {
        setToastState({
          message: result.error.message || "환불 신청에 실패했습니다.",
          tone: "error",
        });
        closeConfirmDialog();
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
      return;
    }

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
      return;
    }

    await syncPortalState({
      message: "기본 정산 계좌가 변경되었습니다.",
      tone: result.source === "supabase" ? "success" : "info",
    });
  };

  const handleTrackParcel = (trackingNumber) => {
    const trackingUrl = buildCjTrackingUrl(trackingNumber);

    if (!trackingUrl) {
      setToastState({
        message: "운송장 정보가 아직 없습니다.",
        tone: "error",
      });
      return;
    }

    window.open(trackingUrl, "_blank", "noopener,noreferrer");
  };

  const handlePickupRequest = () => {
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
      return;
    }
    if (order.refund_requested_at || order.refundRequestedAt) {
      setToastState({
        message: "이미 환불 신청이 접수된 주문이에요.",
        tone: "info",
      });
      return;
    }
    setConfirmReason("");
    setConfirmReasonCategory("");
    setConfirmState({
      open: true,
      type: "refund_order",
      itemId: order.id,
      title: "환불을 신청하시겠습니까?",
      body: "환불 사유를 정확하게 알려주세요. 운영자 검토 후 환불이 진행됩니다.",
      confirmLabel: "환불 신청",
      confirmTone: "danger",
      reasonInput: true,
      reasonPlaceholder: "예: 받은 책 상태가 검수 등급과 다릅니다. 어디가 어떻게 다른지 자세히 적어주세요.",
      reasonMinLength: 20,
    });
  };

  const handleWithdrawal = () => {
    setConfirmState({
      open: true,
      type: "withdrawal",
      itemId: null,
      title: "회원탈퇴를 신청하시겠습니까?",
      body: "신청 후 30일 동안 계정이 유예 상태로 보관되고, 이후 개인정보가 파기됩니다. 유예 기간 중 복구가 필요하면 고객센터로 문의해 주세요.",
      confirmLabel: "탈퇴 신청",
      confirmTone: "danger",
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

          window.setTimeout(() => {
            addressDetailInputRef.current?.focus();
          }, 50);
        },
      }).open();
    } catch {
      setIsSearchingAddress(false);
      setToastState({
        message: "주소 검색을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
        tone: "error",
      });
    }
  };

  const handleSignOut = async () => {
    if (isDemoPreview) {
      navigate("/", { replace: true });
      return;
    }

    setIsSigningOut(true);
    const result = await signOut();
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
    const result = await toggleFavorite(productId);

    if (result.error) {
      setToastState({
        message: result.error.message || "찜 상태를 변경하지 못했어요.",
        tone: "error",
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
            <PublicSiteHeader />
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
          busyOrderId={busyOrderId}
          onCancelOrder={requestCancelOrder}
          onConfirmOrder={requestConfirmPurchase}
          onRequestReturn={handleReturnRequest}
          onTrackParcel={handleTrackParcel}
          orders={portalState.orders}
        />
      );
    }

    if (activeTabKey === "wishlist") {
      return (
        <WishlistTab
          isLoading={isWishlistLoading || isWishlistProductsLoading}
          onToggleFavorite={handleToggleWishlistProduct}
          onToggleRestockAlert={isDemoPreview ? null : handleToggleRestockAlert}
          restockBusyProductId={restockBusyProductId}
          restockSubscribedIds={restockSubscribedIds}
          wishlistError={wishlistError}
          wishlistProducts={wishlistProducts}
        />
      );
    }

    if (activeTabKey === "coupons") {
      return <CouponsView />;
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
            <PublicSiteHeader />

            <main className="public-mypage-route">
              <ContentContainer className="public-mypage-shell">
                {isDemoPreview ? (
                  <div className="public-mypage-demo-banner">
                    데모 데이터 미리보기입니다. 실제 로그인 흐름은 유지되고, 이 화면은 <strong>/mypage?demo=1</strong>에서만 열립니다.
                  </div>
                ) : null}

                {!isConfigured && !isDemoPreview ? (
                  <div className="public-auth-alert public-auth-alert--info">
                    Supabase 환경 변수가 없어 브라우저 기준 임시 상태로 표시됩니다.
                  </div>
                ) : null}

                <header className="public-mypage-breadcrumb">
                  <h1 className="public-mypage-breadcrumb__title">
                    <span className="public-mypage-breadcrumb__name">‘{displayName}’</span>
                    님 마이페이지
                  </h1>
                  {activeSidebarItem ? (
                    <>
                      <span className="public-mypage-breadcrumb__sep" aria-hidden="true"><ChevronRightIcon size={12} /></span>
                      <span className="public-mypage-breadcrumb__leaf">{activeSidebarItem.label}</span>
                    </>
                  ) : null}
                </header>

                <div className="public-mypage-shell-grid">
                  <aside className="public-mypage-sidebar" aria-label="마이페이지 메뉴">
                    {SIDEBAR_GROUPS.map((group) => (
                      <div className="public-mypage-sidebar__group" key={group.title}>
                        <p className="public-mypage-sidebar__title">{group.title}</p>
                        <ul className="public-mypage-sidebar__list">
                          {group.items.map((item) => (
                            <li key={item.key}>
                              {item.isCta ? (
                                <Link
                                  className="public-mypage-sidebar__cta"
                                  to={item.to ?? "/"}
                                >
                                  {item.label}
                                </Link>
                              ) : (
                                <button
                                  aria-current={activeTabKey === item.key ? "page" : undefined}
                                  className={`public-mypage-sidebar__link ${activeTabKey === item.key ? "is-active" : ""}`}
                                  onClick={() => moveToTab(item.key, { smoothScroll: false })}
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
                    {activeTabContent}
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
        body={confirmState.body}
        busy={isConfirmBusy}
        confirmLabel={confirmState.confirmLabel}
        confirmTone={confirmState.confirmTone}
        onClose={closeConfirmDialog}
        onConfirm={() => {
          void handleConfirmAction();
        }}
        onReasonCategoryChange={
          confirmState.type === "refund_order" || confirmState.type === "cancel_order"
            ? setConfirmReasonCategory
            : undefined
        }
        onReasonChange={setConfirmReason}
        open={confirmState.open}
        reasonCategories={
          confirmState.type === "cancel_order" ? CANCEL_REASON_CATEGORIES : undefined
        }
        reasonCategoryLegend={
          confirmState.type === "cancel_order" ? "취소 사유" : undefined
        }
        changeOfMindHint={confirmState.type === "cancel_order" ? null : undefined}
        reasonCategoryValue={confirmReasonCategory}
        reasonInput={confirmState.reasonInput}
        reasonMinLength={
          // 취소는 '기타'일 때만 상세 사유 필수, 그 외 카테고리는 상세 사유 선택.
          confirmState.type === "cancel_order" && confirmReasonCategory !== "other"
            ? 0
            : confirmState.reasonMinLength
        }
        reasonPlaceholder={confirmState.reasonPlaceholder}
        reasonValue={confirmReason}
        title={confirmState.title}
      />
      {memberGateDialog}
    </>
  );
}

function MypageOverviewGrid({ items }) {
  return (
    <div className="public-mypage-overview-grid">
      {items.map((item) => (
        <div className="public-mypage-overview-card" key={item.label}>
          <span className="public-mypage-overview-card__label">{item.label}</span>
          <strong className="public-mypage-overview-card__value">{item.value}</strong>
        </div>
      ))}
    </div>
  );
}

// P0-5: 폐기/판매불가 책의 사유·사진·검수메모를 노출하고 이의제기 mailto를 제공.
// rejection_detail/rejection_photo_urls/inspector_note는 백엔드 RPC에 아직 반영 안 됨 → 있으면 표시.
function RejectableBookRow({ item, requestNumber }) {
  const isRejected = Boolean(item.isRejected || item.rejectionReason);
  const photos = Array.isArray(item.rejectionPhotoUrls) ? item.rejectionPhotoUrls : [];
  const inspectedDate = item.inspectedAt ? formatCompactDate(item.inspectedAt) : null;

  const buildDisputeMailto = () => {
    const subject = `[검수 이의 신청] 요청번호 ${requestNumber} / 책 #${item.id}`;
    const lines = [
      "안녕하세요, 수북 운영팀에게 검수 결과에 대해 이의를 신청합니다.",
      "",
      `요청번호: ${requestNumber}`,
      `책 ID: ${item.id}`,
      `책 제목: ${item.title}`,
      `검수 결과: ${item.statusLabel ?? "-"}`,
      `검수 사유: ${item.rejectionReason ?? "-"}`,
      `검수일: ${inspectedDate ?? "-"}`,
      "",
      "이의 사유:",
      "(여기에 상세 내용을 적어주세요)",
    ];
    return `mailto:subook2025@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join("\n"))}`;
  };

  return (
    <div className="public-mypage-book-row" id={`public-mypage-book-${item.id}`} key={item.id}>
      <div className="public-mypage-book-row__copy">
        <strong>{item.title}</strong>
        {isRejected ? (
          <>
            <p>판매불가 · 사유: {item.rejectionReason || "사유 미입력"}</p>
            {item.rejectionDetail ? (
              <p className="public-mypage-book-row__detail">{item.rejectionDetail}</p>
            ) : null}
            {item.inspectorNote ? (
              <p className="public-mypage-book-row__detail">검수자 메모: {item.inspectorNote}</p>
            ) : null}
            {inspectedDate ? (
              <p className="public-mypage-book-row__detail">검수일: {inspectedDate}</p>
            ) : null}
            {photos.length > 0 ? (
              <div className="public-mypage-book-row__photos">
                {photos.map((url, idx) => (
                  <a
                    className="public-mypage-book-row__photo"
                    href={url}
                    key={url}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    <img alt={`검수 사진 ${idx + 1}`} src={getThumbnailImageUrl(url)} />
                  </a>
                ))}
              </div>
            ) : null}
            {/* P0-S2: mailto 단독은 모바일에서 메일앱 미설정 시 죽음. 카톡 채널을 1순위로 병기. */}
            <div className="public-mypage-book-row__dispute-actions">
              <a
                className="public-mypage-book-row__dispute public-mypage-book-row__dispute--primary"
                href="https://pf.kakao.com/_subook"
                rel="noopener noreferrer"
                target="_blank"
              >
                카카오톡으로 이의 신청하기 <ArrowRightIcon size={13} />
              </a>
              <a
                className="public-mypage-book-row__dispute public-mypage-book-row__dispute--secondary"
                href={buildDisputeMailto()}
                rel="noopener noreferrer"
              >
                메일로 문의
              </a>
            </div>
          </>
        ) : (
          <p>
            등급: {item.gradeLabel ?? "-"} | 판매가:{" "}
            {item.price ? formatCurrency(item.price) : "-"}
          </p>
        )}
      </div>
      <span className={`public-mypage-chip public-mypage-chip--${item.tone ?? "neutral"}`}>
        {item.statusLabel}
      </span>
    </div>
  );
}

// P2-7: 운송장 번호 + 복사 버튼.
function TrackingNumberRow({ company, trackingNumber }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(trackingNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };
  return (
    <div className="public-mypage-purchase-card__tracking">
      <span className="public-mypage-purchase-card__tracking-label">
        {company ?? "CJ대한통운"}
      </span>
      <code className="public-mypage-purchase-card__tracking-number">{trackingNumber}</code>
      <button
        aria-label="운송장 번호 복사"
        className="public-mypage-purchase-card__tracking-copy"
        onClick={handleCopy}
        type="button"
      >
        {copied ? "복사됨" : "복사"}
      </button>
    </div>
  );
}

// 입금 대기(pending) 주문의 계좌·입금자명·금액 재확인 안내.
// 결제 직후 주문완료 화면을 놓쳐도(탭 닫힘/세션 만료) 여기서 다시 입금할 수 있게 한다.
// 입금자명·계좌·마감 정의는 주문완료 페이지(PublicOrderCompletePage)와 동일 소스를 공유.
function OrderDepositRow({ label, value, copyLabel, highlight = false, hint = null }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    if (!value || typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };
  return (
    <div
      className={`public-mypage-deposit__row${
        highlight ? " public-mypage-deposit__row--highlight" : ""
      }`}
    >
      <div className="public-mypage-deposit__cell">
        <span className="public-mypage-deposit__label">{label}</span>
        <span className="public-mypage-deposit__value">{value}</span>
        {hint ? <span className="public-mypage-deposit__hint">{hint}</span> : null}
      </div>
      <button
        aria-label={copyLabel}
        className="public-mypage-deposit__copy"
        onClick={handleCopy}
        type="button"
      >
        {copied ? "복사됨" : "복사"}
      </button>
    </div>
  );
}

function OrderDepositInfo({ order }) {
  const depositorName = buildDepositorName(order.recipientName, order.reference);
  const bankAccountPlain = BANK_ACCOUNT.replace(/-/g, "");
  return (
    <div className="public-mypage-deposit" role="group" aria-label="입금 안내">
      <p className="public-mypage-deposit__title">입금 계좌 안내</p>
      <OrderDepositRow
        copyLabel="계좌번호 복사"
        label={`${BANK_NAME} · 예금주 ${BANK_HOLDER}`}
        value={BANK_ACCOUNT}
        hint={`복사 시 ${bankAccountPlain}`}
      />
      {order.totalAmount != null ? (
        <OrderDepositRow
          copyLabel="입금 금액 복사"
          label="입금 금액"
          value={formatCurrency(order.totalAmount)}
        />
      ) : null}
      {depositorName ? (
        <OrderDepositRow
          copyLabel="입금자명 복사"
          highlight
          hint="본인 성함 + 주문번호 마지막 4자리. 다르게 입력하면 입금 확인이 늦어질 수 있어요."
          label="입금자명 (필수)"
          value={depositorName}
        />
      ) : null}
      <p className="public-mypage-deposit__notice">
        주문 후 <strong>{PAYMENT_DEADLINE_HOURS}시간 이내</strong>에 입금해주세요. 미입금 시 주문이
        자동 취소됩니다.
      </p>
    </div>
  );
}

// P1-5: 정산 카드 — 클릭 시 주문번호·판매일·구매확정일·입금일 타임라인 노출.
function SettlementCard({ settlement, status }) {
  const [expanded, setExpanded] = useState(false);
  const isCompleted = status === "completed";
  const timeline = [
    { label: "판매일", value: settlement.soldAt },
    { label: "구매확정일", value: settlement.confirmedAt },
    { label: "입금예정일", value: settlement.scheduledAt },
    isCompleted ? { label: "정산완료일", value: settlement.completedAt ?? settlement.date } : null,
  ].filter(Boolean);
  const hasTimelineData = timeline.some((entry) => entry.value);

  return (
    <article className="public-mypage-settlement-card">
      <div className="public-mypage-settlement-card__row">
        <strong>
          {formatCompactDate(settlement.date)} {isCompleted ? "정산완료" : "예정"}
        </strong>
        <span className="public-mypage-settlement-card__amount">+{formatCurrency(settlement.amount)}</span>
      </div>
      <p>
        {settlement.orderReference ? `주문 #${settlement.orderReference} · ` : ""}
        수거 #{settlement.pickupReference} · 교재 {settlement.bookCount}권
      </p>
      {isCompleted ? (
        <>
          <p>
            판매 {formatCurrency(settlement.grossSales)} − 수수료 {formatCurrency(settlement.feeAmount)}
            {settlement.grossSales > 0
              ? ` (수수료율 ${Math.round((settlement.feeAmount / settlement.grossSales) * 100)}%)`
              : ""}
          </p>
          <p>
            입금: {settlement.bankLabel} {settlement.maskedAccount}
          </p>
        </>
      ) : (
        <span className={`public-mypage-chip public-mypage-chip--${settlement.tone ?? "warning"}`}>
          {settlement.statusLabel}
        </span>
      )}

      <button
        className="public-mypage-inline-link public-mypage-settlement-card__toggle"
        onClick={() => setExpanded((v) => !v)}
        type="button"
      >
        {expanded ? "타임라인 접기 ▲" : "타임라인 보기 ▼"}
      </button>

      {expanded ? (
        <ol className="public-mypage-settlement-timeline">
          {timeline.map((entry) => (
            <li className="public-mypage-settlement-timeline__item" key={entry.label}>
              <span className="public-mypage-settlement-timeline__label">{entry.label}</span>
              <span className="public-mypage-settlement-timeline__value">
                {entry.value ? formatCompactDate(entry.value) : "미확정"}
              </span>
            </li>
          ))}
          {!hasTimelineData && (
            <li className="public-mypage-settlement-timeline__empty">
              상세 일자 정보를 불러올 수 없어요. 입금이 늦어진다면 운영팀(subook2025@gmail.com)에 문의해주세요.
            </li>
          )}
        </ol>
      ) : null}
    </article>
  );
}

const SALES_ITEMS_PER_PAGE = 30;

function SalesTab({
  expandedShipmentId,
  onRequestPickup,
  onToggleShipment,
  onTrackParcel,
  settlementSummary,
  shipments,
}) {
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const salesMetrics = useMemo(() => deriveShipmentMetrics(shipments), [shipments]);
  const totalSettledAmount = Number(
    settlementSummary?.totalAmount ?? settlementSummary?.total_amount ?? 0,
  );
  const totalBookCount = salesMetrics.totalBookCount || shipments.reduce((sum, s) => sum + (s.bookCount ?? s.items?.length ?? 0), 0);

  // P0-S2: 모든 shipments에서 판매불가 책을 모아 상단 알림 띠를 노출.
  // 클릭하면 첫 판매불가 책이 있는 shipment를 펼치고 해당 책 row로 스크롤.
  const rejectedBooks = useMemo(() => {
    const acc = [];
    for (const shipment of shipments) {
      for (const item of shipment.items ?? []) {
        if (item.isRejected || item.rejectionReason) {
          acc.push({ shipmentId: shipment.id, itemId: item.id });
        }
      }
    }
    return acc;
  }, [shipments]);

  const handleJumpToFirstRejected = () => {
    if (rejectedBooks.length === 0) return;
    const first = rejectedBooks[0];
    if (expandedShipmentId !== first.shipmentId) {
      onToggleShipment(first.shipmentId);
    }
    // 펼침이 적용된 다음 페인트에서 스크롤
    window.setTimeout(() => {
      const el = document.getElementById(`public-mypage-book-${first.itemId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 80);
  };
  const filteredByStatus = useMemo(
    () => filterShipmentsByStatus(shipments, statusFilter),
    [shipments, statusFilter],
  );
  const filteredShipments = useMemo(() => {
    const normalized = searchKeyword.trim().toLowerCase();
    if (!normalized) {
      return filteredByStatus;
    }
    return filteredByStatus.filter((shipment) => {
      const headline = (shipment.summaryLabel ?? "").toLowerCase();
      if (headline.includes(normalized)) {
        return true;
      }
      return (shipment.items ?? []).some((item) =>
        (item.title ?? "").toLowerCase().includes(normalized),
      );
    });
  }, [filteredByStatus, searchKeyword]);

  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, searchKeyword]);

  const totalPages = Math.max(1, Math.ceil(filteredShipments.length / SALES_ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedShipments = filteredShipments.slice(
    (safePage - 1) * SALES_ITEMS_PER_PAGE,
    safePage * SALES_ITEMS_PER_PAGE,
  );

  if (!shipments.length) {
    return (
      <MypageEmptyState
        actionLabel="수거 요청하기"
        actionOnClick={onRequestPickup}
        description="집에 잠자는 교재를 보내보세요!"
        icon={<BookIcon size={40} />}
        title="아직 판매 내역이 없어요"
      />
    );
  }

  return (
    <div className="public-mypage-stack">
      <section className="public-mypage-section">
        <MypageSectionHeader
          description="등록한 판매 교재의 상태와 정산 현황을 한 번에 확인하세요."
          icon={<BoxIcon size={18} />}
          title="판매 내역"
        />

        <MypageOverviewGrid
          items={[
            { label: "전체", value: `${totalBookCount}권` },
            { label: "판매중", value: `${salesMetrics.onSaleBookCount}권` },
            { label: "정산완료", value: `${salesMetrics.settledBookCount}권` },
            { label: "누적 정산금액", value: formatCurrency(totalSettledAmount) },
          ]}
        />

        {rejectedBooks.length > 0 ? (
          <button
            className="public-mypage-rejected-banner"
            onClick={handleJumpToFirstRejected}
            type="button"
          >
            <span aria-hidden="true" className="public-mypage-rejected-banner__icon"><AlertTriangleIcon size={18} /></span>
            <span className="public-mypage-rejected-banner__copy">
              <strong>판매불가 {rejectedBooks.length}권</strong> 발생했어요. 사유와 검수 사진을 확인하고 필요하면 이의 신청해주세요.
            </span>
            <span aria-hidden="true" className="public-mypage-rejected-banner__chevron"><ChevronRightIcon size={16} /></span>
          </button>
        ) : null}

        <div className="public-mypage-sales-search">
          <input
            aria-label="판매 교재 검색"
            className="public-mypage-sales-search__input"
            onChange={(event) => setSearchKeyword(event.target.value)}
            placeholder="판매 교재명으로 검색"
            type="search"
            value={searchKeyword}
          />
        </div>

        <div className="public-mypage-order-filters">
          {SALES_STATUS_FILTERS.map((filterItem) => (
            <button
              className={`public-mypage-filter-chip ${statusFilter === filterItem.value ? "public-mypage-filter-chip--active" : ""}`}
              key={filterItem.value}
              onClick={() => setStatusFilter(filterItem.value)}
              type="button"
            >
              {filterItem.label}
            </button>
          ))}
        </div>

        {filteredShipments.length === 0 ? (
          <p className="public-mypage-order-empty-filter">해당 상태의 판매 내역이 없습니다.</p>
        ) : (
        <div className="public-mypage-flow-list">
          {paginatedShipments.map((shipment) => {
            const isExpanded = !shipment.compact || expandedShipmentId === shipment.id;
            const progressIndex = getShipmentProgressIndex(shipment.status);

            return (
              <article className={`public-mypage-flow-card ${shipment.compact ? "is-compact" : ""}`} key={shipment.id}>
                <div className="public-mypage-flow-card__header">
                  <div>
                    <p className="public-mypage-flow-card__meta">
                      수거 #{formatShipmentReference(shipment.reference)}{" "}
                      <span>{formatCompactDate(shipment.createdAt)} 신청</span>
                    </p>
                    <h3 className="public-mypage-flow-card__title">
                      {shipment.summaryLabel ?? `교재 ${shipment.bookCount ?? shipment.items?.length ?? 0}권`}
                    </h3>
                  </div>

                  <div className="public-mypage-flow-card__header-actions">
                    {!shipment.compact ? (
                      <span className={`public-mypage-chip public-mypage-chip--${getShipmentStatusTone(shipment.status)}`}>
                        {getShipmentStatusLabel(shipment.status)}
                      </span>
                    ) : (
                      <button
                        className="public-mypage-inline-link"
                        onClick={() => onToggleShipment(isExpanded ? null : shipment.id)}
                        type="button"
                      >
                        {isExpanded ? (
                          <>접기 <ChevronUpIcon size={13} /></>
                        ) : (
                          <>상세 <ArrowRightIcon size={13} /></>
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {isExpanded ? (
                  <>
                    <div className="public-mypage-flow-card__status-row">
                      <div>
                        <span className="public-mypage-flow-card__status-label">현재</span>
                        <strong>{getShipmentStatusLabel(shipment.status)}</strong>
                      </div>

                      {shipment.trackingNumber ? (
                        <button className="public-mypage-inline-link" onClick={() => onTrackParcel(shipment.trackingNumber)} type="button">
                          배송추적 <ArrowRightIcon size={13} />
                        </button>
                      ) : null}
                    </div>

                    {/* P1: 현재 단계를 1.4x 노드 + bold 라벨로 강조해 "지금 어디 있지?" 인지속도 향상 */}
                    <div className="public-mypage-progress-rail" role="presentation">
                      {SHIPMENT_PROGRESS_STEPS.map((step, index) => {
                        const isPast = index < progressIndex;
                        const isCurrent = index === progressIndex;
                        return (
                          <div
                            className={`public-mypage-progress-rail__step ${
                              isCurrent ? "is-current" : ""
                            }`}
                            key={step.key}
                          >
                            {index < SHIPMENT_PROGRESS_STEPS.length - 1 ? (
                              <span
                                className={`public-mypage-progress-rail__line ${
                                  isPast ? "is-active" : ""
                                }`}
                              />
                            ) : null}
                            <span
                              className={`public-mypage-progress-rail__node ${
                                isPast || isCurrent ? "is-active" : ""
                              } ${isCurrent ? "is-current" : ""}`}
                            />
                            <span className="public-mypage-progress-rail__label">{step.label}</span>
                          </div>
                        );
                      })}
                    </div>

                    {shipment.trackingNumber ? (
                      <p className="public-mypage-flow-card__tracking">
                        운송장: {shipment.trackingCompany} {shipment.trackingNumber}
                      </p>
                    ) : null}

                    <div className="public-mypage-book-list">
                      {shipment.items.map((item) => (
                        <RejectableBookRow
                          item={item}
                          key={item.id}
                          requestNumber={shipment.reference}
                        />
                      ))}
                    </div>
                  </>
                ) : null}
              </article>
            );
          })}
        </div>
        )}

        {totalPages > 1 ? (
          <nav className="public-mypage-pagination" aria-label="판매 내역 페이지">
            <button
              aria-label="이전 페이지"
              className="public-mypage-pagination__arrow"
              disabled={safePage === 1}
              onClick={() => setCurrentPage(Math.max(1, safePage - 1))}
              type="button"
            >
              ‹
            </button>
            {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
              <button
                aria-current={pageNumber === safePage ? "page" : undefined}
                className={`public-mypage-pagination__page ${pageNumber === safePage ? "is-active" : ""}`}
                key={pageNumber}
                onClick={() => setCurrentPage(pageNumber)}
                type="button"
              >
                {pageNumber}
              </button>
            ))}
            <button
              aria-label="다음 페이지"
              className="public-mypage-pagination__arrow"
              disabled={safePage === totalPages}
              onClick={() => setCurrentPage(Math.min(totalPages, safePage + 1))}
              type="button"
            >
              <ChevronRightIcon size={16} />
            </button>
          </nav>
        ) : null}
      </section>
    </div>
  );
}

// 쿠폰함: 보유/사용/만료 탭 + 코드 입력 + 다운로드 가능 쿠폰 목록.
// PR 3에서 주문 페이지의 쿠폰 적용 UI가 추가됨.
function CouponsView() {
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

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    const [walletRes, downloadRes] = await Promise.all([
      publicSupabase.rpc("get_member_coupons", { p_status_filter: "all" }),
      publicSupabase.rpc("get_downloadable_coupons"),
    ]);
    if (!walletRes.error) setCoupons(Array.isArray(walletRes.data) ? walletRes.data : []);
    if (!downloadRes.error) setDownloadable(Array.isArray(downloadRes.data) ? downloadRes.data : []);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const filteredCoupons = useMemo(
    () => coupons.filter((c) => c.effective_status === statusFilter),
    [coupons, statusFilter],
  );

  const handleClaimCode = async (e) => {
    e.preventDefault();
    if (!codeInput.trim()) return;
    setIsClaiming(true);
    const { error } = await publicSupabase.rpc("claim_coupon_by_code", {
      p_code: codeInput.trim(),
    });
    setIsClaiming(false);
    if (error) {
      showToast(error.message || "쿠폰 등록에 실패했습니다.", "error");
      return;
    }
    showToast("쿠폰이 등록되었습니다.", "success");
    setCodeInput("");
    await loadAll();
  };

  const handleDownload = async (coupon) => {
    setBusyId(coupon.id);
    const { error } = await publicSupabase.rpc("claim_coupon_for_download", {
      p_coupon_id: coupon.id,
    });
    setBusyId(null);
    if (error) {
      showToast(error.message || "쿠폰 받기에 실패했습니다.", "error");
      return;
    }
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
      <section className="public-mypage-section">
        <MypageSectionHeader
          description="쿠폰 코드를 입력하거나 다운로드 가능한 쿠폰을 받아보세요."
          icon={<TicketIcon size={18} />}
          title="쿠폰함"
        />

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
                    <p>{describeCouponDiscount(coupon)}{coupon.min_order_amount > 0 ? ` · 최소 ${formatCurrency(coupon.min_order_amount)}` : ""}</p>
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
        <div className="public-mypage-coupon-tabs">
          {[
            { key: "available", label: "보유" },
            { key: "used", label: "사용 완료" },
            { key: "expired", label: "만료" },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`public-mypage-coupon-tab ${statusFilter === tab.key ? "is-active" : ""}`}
              onClick={() => setStatusFilter(tab.key)}
            >
              {tab.label} ({counts[tab.key] ?? 0})
            </button>
          ))}
        </div>

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
            icon={<TicketIcon size={40} />}
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
                  {mc.min_order_amount > 0 ? (
                    <p className="public-mypage-coupon-card__hint">
                      {formatCurrency(mc.min_order_amount)} 이상 주문 시
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
function OrderDetailSheet({ order, onClose }) {
  if (!order) {
    return null;
  }

  const couponDiscount = Number(order.couponDiscountAmount) || 0;
  const shippingFee = Number(order.shippingFee) || 0;
  const totalAmount = Number(order.totalAmount) || 0;
  // 총 상품금액: subtotal 컬럼 우선, 없으면 합산금액에서 역산(결제금액 + 쿠폰할인 − 배송비).
  const productTotal =
    Number(order.subtotal) || Math.max(0, totalAmount + couponDiscount - shippingFee);
  // 무통장입금은 입금확인 시각이 따로 기록되지 않으므로(PG 승인 시각만 존재)
  // 결제 시각이 없으면 '주문일시'로 정확하게 라벨링해 허위 시각 표시를 피한다.
  const paidAt = order.paidAt || null;

  return (
    <ResponsiveSheet
      eyebrow="주문 상세"
      onClose={onClose}
      open={Boolean(order)}
      title="결제 정보"
    >
      <dl className="public-mypage-order-detail">
        {order.reference ? (
          <div className="public-mypage-order-detail__row">
            <dt>주문번호</dt>
            <dd>{order.reference}</dd>
          </div>
        ) : null}
        <div className="public-mypage-order-detail__row">
          <dt>{paidAt ? "결제일시" : "주문일시"}</dt>
          <dd>{formatDateTime(paidAt || order.createdAt)}</dd>
        </div>
        <div className="public-mypage-order-detail__row">
          <dt>결제방법</dt>
          <dd>{getPaymentMethodLabel(order.paymentMethod)}</dd>
        </div>

        <div className="public-mypage-order-detail__divider" aria-hidden="true" />

        <div className="public-mypage-order-detail__row">
          <dt>총 상품금액</dt>
          <dd>{formatCurrency(productTotal)}</dd>
        </div>
        <div className="public-mypage-order-detail__row">
          <dt>쿠폰할인</dt>
          <dd>{couponDiscount > 0 ? `−${formatCurrency(couponDiscount)}` : formatCurrency(0)}</dd>
        </div>
        <div className="public-mypage-order-detail__row">
          <dt>배송비</dt>
          <dd>{shippingFee > 0 ? formatCurrency(shippingFee) : "무료"}</dd>
        </div>

        <div className="public-mypage-order-detail__divider" aria-hidden="true" />

        <div className="public-mypage-order-detail__row public-mypage-order-detail__row--total">
          <dt>결제금액</dt>
          <dd>{formatCurrency(totalAmount)}</dd>
        </div>
      </dl>
    </ResponsiveSheet>
  );
}

function PurchasesView({
  busyOrderId,
  onCancelOrder,
  onConfirmOrder,
  onRequestReturn,
  onTrackParcel,
  orders,
}) {
  const [detailOrder, setDetailOrder] = useState(null);
  const [activeFilter, setActiveFilter] = useState("all");
  const navigate = useNavigate();

  const filteredOrders = useMemo(() => {
    if (activeFilter === "all") return orders;
    const card = PURCHASE_SUMMARY_CARDS.find((c) => c.key === activeFilter);
    if (!card?.statuses) return orders;
    return orders.filter((order) => card.statuses.includes(order.status));
  }, [orders, activeFilter]);

  const groupedOrders = useMemo(() => groupOrdersByDate(filteredOrders), [filteredOrders]);

  const handleReorder = (item) => {
    if (item.productId) {
      navigate(`/store/${item.productId}`);
    }
  };

  if (!orders.length) {
    return (
      <MypageEmptyState
        actionLabel="교재 둘러보기"
        actionTo="/"
        description="마음에 드는 교재를 구매해보세요!"
        icon={<CartIcon size={40} />}
        title="아직 구매 내역이 없어요"
      />
    );
  }

  return (
    <div className="public-mypage-stack">
      <div className="public-mypage-stat-row" role="tablist" aria-label="구매 상태 필터">
        {PURCHASE_SUMMARY_CARDS.map((card) => {
          const count = countOrdersByStatuses(orders, card.statuses);
          const isActive = activeFilter === card.key;
          return (
            <button
              aria-selected={isActive}
              className={`public-mypage-stat-card ${isActive ? "is-active" : ""}`}
              key={card.key}
              onClick={() => setActiveFilter(card.key)}
              role="tab"
              type="button"
            >
              <span className="public-mypage-stat-card__label">{card.label}</span>
              <span className="public-mypage-stat-card__value">{count}</span>
            </button>
          );
        })}
      </div>

      {groupedOrders.length === 0 ? (
        <p className="public-mypage-order-empty-filter">해당 상태의 주문이 없습니다.</p>
      ) : (
        groupedOrders.map((group) => (
          <section className="public-mypage-order-group" key={group.dateKey}>
            <header className="public-mypage-order-group__head">
              <h2 className="public-mypage-order-group__date">{group.dateLabel}</h2>
            </header>

            <div className="public-mypage-order-cards">
              {group.orders.flatMap((order) =>
                order.items.map((item) => (
                  <article className="public-mypage-purchase-card" key={`${order.id}-${item.id}`}>
                    <div className="public-mypage-purchase-card__status-row">
                      <span className={`public-mypage-chip public-mypage-chip--${getOrderStatusTone(order.status)}`}>
                        {getOrderStatusLabel(order.status)}
                      </span>
                      <button
                        aria-label="주문 상세보기"
                        className="public-mypage-purchase-card__detail-btn"
                        onClick={() => setDetailOrder(order)}
                        type="button"
                      >
                        <span>상세보기</span>
                        <ChevronRightIcon size={16} />
                      </button>
                    </div>

                    {/* 입금 대기 주문: 계좌·입금자명·금액 재확인 (주문완료 화면 놓쳐도 입금 가능) */}
                    {order.status === "pending" && order.paymentStatus !== "paid" ? (
                      <OrderDepositInfo order={order} />
                    ) : null}

                    <div className="public-mypage-purchase-card__body">
                      <div className="public-mypage-purchase-card__thumb" aria-hidden="true">
                        {item.coverImageUrl ? (
                          <img alt="" src={getThumbnailImageUrl(item.coverImageUrl)} />
                        ) : null}
                      </div>

                      <div className="public-mypage-purchase-card__info">
                        <h3 className="public-mypage-purchase-card__title">{item.title}</h3>
                        <p className="public-mypage-purchase-card__meta">
                          옵션: {item.gradeLabel || "없음"}
                          <span className="public-mypage-purchase-card__divider">/</span>
                          {item.quantity}
                        </p>
                        <p className="public-mypage-purchase-card__price">{formatCurrency(item.price)}</p>
                      </div>
                    </div>

                    {order.trackingNumber ? (
                      <TrackingNumberRow
                        company={order.trackingCompany}
                        trackingNumber={order.trackingNumber}
                      />
                    ) : null}

                    <div className="public-mypage-purchase-card__actions">
                      <button
                        className="public-mypage-purchase-card__btn"
                        onClick={() =>
                          order.trackingNumber ? onTrackParcel(order.trackingNumber) : null
                        }
                        type="button"
                      >
                        배송 조회
                      </button>
                      <button
                        className="public-mypage-purchase-card__btn"
                        disabled={!item.productId}
                        onClick={() => handleReorder(item)}
                        type="button"
                      >
                        같은 교재 다시 찾기
                      </button>
                      {order.canCancel ? (
                        <button
                          className="public-mypage-purchase-card__btn public-mypage-purchase-card__btn--danger"
                          disabled={busyOrderId === order.id}
                          onClick={() => onCancelOrder(order)}
                          type="button"
                        >
                          {busyOrderId === order.id ? "처리 중..." : "취소"}
                        </button>
                      ) : null}
                      {order.canConfirm ? (
                        <button
                          className="public-mypage-purchase-card__btn public-mypage-purchase-card__btn--primary"
                          disabled={busyOrderId === order.id}
                          onClick={() => onConfirmOrder(order)}
                          type="button"
                        >
                          {busyOrderId === order.id ? "처리 중..." : "구매확정"}
                        </button>
                      ) : null}
                      {order.canRequestRefund ? (
                        <button
                          className="public-mypage-purchase-card__btn"
                          disabled={busyOrderId === order.id}
                          onClick={() => onRequestReturn?.(order)}
                          type="button"
                        >
                          환불 신청
                        </button>
                      ) : null}
                      {/* 환불 처리 전 대기 상태만 표시 — refunded면 상단 status 배지가 이미 알려주므로 중복 제거 */}
                      {order.refundRequestedAt && order.status !== "refunded" ? (
                        <span className="public-mypage-purchase-card__refund-status">
                          환불 신청 접수됨
                        </span>
                      ) : null}
                    </div>
                    {order.canConfirm && order.autoConfirmDaysRemaining != null ? (
                      <p className="public-mypage-purchase-card__auto-confirm">
                        {order.autoConfirmDaysRemaining <= 0
                          ? "곧 자동으로 구매확정돼요 · 확정 후에는 반품할 수 없어요"
                          : `${order.autoConfirmDaysRemaining}일 뒤 자동으로 구매확정돼요 · 확정 후에는 반품할 수 없어요`}
                      </p>
                    ) : null}
                  </article>
                )),
              )}
            </div>
          </section>
        ))
      )}

      <OrderDetailSheet order={detailOrder} onClose={() => setDetailOrder(null)} />
    </div>
  );
}

function SettlementsTab({ completedSettlements, onRequestPickup, scheduledSettlements, settlementSummary }) {
  const settlementMetrics = deriveSettlementMetrics({
    settlementSummary,
    completedSettlements,
    scheduledSettlements,
  });

  if (!completedSettlements.length && !scheduledSettlements.length) {
    return (
      <MypageEmptyState
        actionLabel="수거 요청하기"
        actionOnClick={onRequestPickup}
        description="교재를 판매하면 정산 내역이 여기에 표시돼요."
        icon={<CoinIcon size={40} />}
        title="아직 정산 내역이 없어요"
      />
    );
  }

  return (
    <div className="public-mypage-stack">
      <section className="public-mypage-section">
        <MypageSectionHeader
          description="이번 달 정산 흐름과 누적 정산 금액을 함께 보여드려요."
          icon={<CoinIcon size={18} />}
          title="정산 내역"
        />

        <MypageOverviewGrid
          items={[
            { label: "정산 예정", value: formatCurrency(settlementMetrics.expectedAmount) },
            { label: "이번 달 정산", value: formatCurrency(settlementMetrics.currentMonthAmount) },
            { label: "누적 정산", value: formatCurrency(settlementMetrics.totalAmount) },
            { label: "완료 건수", value: `${settlementMetrics.completedCount}건` },
          ]}
        />

        <div className="public-mypage-settlement-summary">
          <div className="public-mypage-settlement-summary__item">
            <span>이번 달 정산</span>
            <strong>{formatCurrency(settlementMetrics.currentMonthAmount)}</strong>
          </div>
          <div className="public-mypage-settlement-summary__item">
            <span>총 누적 정산</span>
            <strong>{formatCurrency(settlementMetrics.totalAmount)}</strong>
          </div>
        </div>

        <div className="public-mypage-settlement-list">
          {completedSettlements.map((settlement) => (
            <SettlementCard key={settlement.id} settlement={settlement} status="completed" />
          ))}
        </div>

        {scheduledSettlements.length ? (
          <div className="public-mypage-pending-settlements">
            <h3 className="public-mypage-pending-settlements__title">정산 예정</h3>
            <div className="public-mypage-settlement-list">
              {scheduledSettlements.map((settlement) => (
                <SettlementCard key={settlement.id} settlement={settlement} status="scheduled" />
              ))}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

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
  return (
    <div className="public-mypage-stack">
      <section className="public-mypage-section">
        <MypageSectionHeader
          action={
            <Link className="public-mypage-inline-button" to="/">
              스토어 보기
            </Link>
          }
          description="찜해 둔 교재를 모아보고 품절 여부까지 한 번에 확인할 수 있어요."
          icon={<HeartIcon filled size={18} style={{ color: "var(--public-danger, #ff4a4a)" }} />}
          title="찜한 교재"
        />

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
          <div className="public-mypage-wishlist-grid">
            {wishlistProducts.map((product) => (
              <ProductCard
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
            description="마음에 드는 교재를 찜해두면 마이페이지에서 다시 빠르게 확인할 수 있어요."
            icon={<HeartIcon filled size={40} style={{ color: "var(--public-danger, #ff4a4a)" }} />}
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
  // 사이드바에서 들어왔을 때 해당 섹션만 노출. section이 비면(null) 기존처럼 전체 노출(레거시 호환).
  const showProfile = !section || section === "profile";
  const showAddresses = !section || section === "addresses";
  const showSettlementAccount = !section || section === "settlement-account";
  const showWishlist = !section; // 새 사이드바에서는 wishlist를 별도 메뉴로 빼냈음
  const showAccount = !section || section === "profile";

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
              <button className="public-mypage-inline-button" onClick={() => setIsProfileEditing(true)} type="button">
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
                    return "카카오 계정 (이메일 미연동)";
                  }
                  return rawEmail;
                })()}{" "}
                <em>(변경불가)</em>
              </dd>
            </div>
            <div className="public-mypage-profile-list__item">
              <dt>연락처</dt>
              <dd>{profileSnapshot?.phone || "-"}</dd>
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
          description="계좌 정보는 정산 시에만 사용되며 암호화되어 안전하게 보관됩니다."
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
                    <button className="public-mypage-text-button" onClick={() => openAccountSheet(account)} type="button">
                      수정
                    </button>
                    <button
                      className="public-mypage-text-button public-mypage-text-button--danger"
                      disabled={busyAccountId === account.id}
                      onClick={() => requestDeleteAccount(account)}
                      type="button"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <MypageEmptyState description="판매 정산을 받으려면 기본 계좌를 먼저 등록해 주세요." icon={<CardIcon size={40} />} title="등록한 정산 계좌가 없어요" />
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
            {wishlistProducts.map((product) => (
              <ProductCard
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
        <div className="public-mypage-account-actions public-mypage-account-actions--split">
          <button className="public-auth-button public-auth-button--secondary" disabled={isSigningOut} onClick={handleSignOut} type="button">
            {isDemoPreview ? "데모 종료" : isSigningOut ? "로그아웃 중..." : "로그아웃"}
          </button>
          <button className="public-auth-button public-mypage-button--danger-outline" disabled={isWithdrawing} onClick={handleWithdrawal} type="button">
            {isWithdrawing ? "처리 중..." : "회원탈퇴"}
          </button>
        </div>
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
              ? "카카오 계정 (이메일 미연동)"
              : profileForm.email}{" "}
            <em>(변경불가)</em>
          </span>
        </div>
        <div className={`public-auth-field-row ${profileErrors.phone ? "is-error" : ""}`}>
          <label className="public-auth-field-row__label" htmlFor="public-mypage-phone">
            연락처
          </label>
          <div className="public-auth-field-row__control">
            <input className="public-auth-field-row__input" id="public-mypage-phone" inputMode="numeric" onChange={handleProfileChange("phone")} placeholder="010-1234-5678" type="tel" value={profileForm.phone} />
          </div>
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
      <Link className="public-auth-ghost-link" to="/forgot-password">
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
          <button className="public-auth-button public-auth-button--secondary" onClick={closeAddressSheet} type="button">
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
          <button className="public-auth-button public-auth-button--secondary" onClick={closeAccountSheet} type="button">
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
      eyebrow="정산"
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
            <select className="public-mypage-select" id="public-mypage-account-bank" onChange={handleAccountChange("bank_name")} value={accountForm.bank_name}>
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
