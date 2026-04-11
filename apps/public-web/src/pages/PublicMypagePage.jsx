import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { formatCurrency } from "@shared-domain/format";
import PublicAuthHeader from "../components/PublicAuthHeader";
import ContentContainer from "../components/ContentContainer";
import PublicFooter from "../components/PublicFooter";
import {
  ConfirmDialog,
  MypageEmptyState,
  MypageSectionHeader,
  MypageSummaryCard,
  ResponsiveSheet,
} from "../components/PublicMypageUi.jsx";
import PublicPageFrame from "../components/PublicPageFrame";
import PublicToastMessage from "../components/PublicToastMessage";
import { usePublicAuth } from "../contexts/PublicAuthContext";
import usePublicMemberGate from "../lib/publicMemberGate";
import { DEMO_MEMBER_PROFILE, DEMO_MEMBER_USER } from "../lib/publicMypageDemo";
import {
  cancelMemberOrder,
  checkMemberNicknameAvailability,
  confirmMemberPurchase,
  createDisplayName,
  createEmptyDashboardSummary,
  deleteMemberSettlementAccount,
  deleteMemberShippingAddress,
  loadMemberPortalSnapshot,
  saveMemberProfile,
  saveMemberSettlementAccount,
  saveMemberShippingAddress,
  setDefaultMemberSettlementAccount,
  setDefaultMemberShippingAddress,
} from "../lib/memberPortal";
import {
  BANK_OPTIONS,
  MAX_SAVED_ITEMS,
  SHIPMENT_PROGRESS_STEPS,
  TAB_ITEMS,
  buildAccountForm,
  buildAddressForm,
  buildCjTrackingUrl,
  buildProfileForm,
  formatCompactDate,
  formatOrderReference,
  formatShipmentReference,
  getOrderStatusLabel,
  getOrderStatusTone,
  getShipmentProgressIndex,
  getShipmentStatusLabel,
  getShipmentStatusTone,
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
import { formatPhoneNumber, hasValidPhoneNumber } from "../lib/publicAuthFormUtils";
import "./PublicMypagePage.css";

const initialLoadedTabs = {
  sales: false,
  purchases: false,
  settlements: false,
  settings: false,
};

const initialTabPhases = {
  sales: "idle",
  purchases: "idle",
  settlements: "idle",
  settings: "idle",
};

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
};

function PublicMypagePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const isDemoPreview = searchParams.get("demo") === "1";
  const {
    isAdminAccount,
    isAuthenticated,
    isConfigured,
    isLoading,
    profile,
    refreshProfile,
    signOut,
    user,
  } = usePublicAuth();
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
  const [busyAddressId, setBusyAddressId] = useState(null);
  const [busyAccountId, setBusyAccountId] = useState(null);
  const [busyOrderId, setBusyOrderId] = useState(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [confirmState, setConfirmState] = useState(initialConfirmState);
  const [expandedShipmentId, setExpandedShipmentId] = useState(null);
  const tabPanelRef = useRef(null);
  const addressDetailInputRef = useRef(null);

  const previewAccount = isDemoPreview
    ? {
        name: effectiveProfile?.name,
        nickname: effectiveProfile?.nickname,
        displayName: createDisplayName(effectiveProfile),
      }
    : null;

  const profileSnapshot = portalState.profile ?? effectiveProfile;
  const summary = useMemo(
    () => portalState.dashboardSummary ?? createEmptyDashboardSummary(profileSnapshot),
    [portalState.dashboardSummary, profileSnapshot],
  );
  const displayName = createDisplayName(profileSnapshot);
  const joinDateText = formatCompactDate(effectiveUser?.created_at ?? profileSnapshot?.created_at);
  const isPortalPending = tabPhases[activeTabKey] === "loading" && !portalState.profile;
  const currentNickname = (profileSnapshot?.nickname ?? profileSnapshot?.name ?? "").trim();

  useEffect(() => {
    setActiveTabKey(getTabKeyFromHash(location.hash));
  }, [location.hash]);

  useEffect(() => {
    if (!effectiveUser || loadedTabs[activeTabKey]) {
      return undefined;
    }

    let isCancelled = false;

    setTabPhases((currentValue) => ({
      ...currentValue,
      [activeTabKey]: "loading",
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
        [activeTabKey]: true,
      }));
      setTabPhases((currentValue) => ({
        ...currentValue,
        [activeTabKey]: "ready",
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
    activeTabKey,
    effectiveProfile,
    effectiveUser,
    isDemoPreview,
    loadedTabs,
    portalState.profile,
  ]);

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

    if (!accountForm.account_number.trim()) {
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
    setConfirmState({
      open: true,
      type: "cancel_order",
      itemId: order.id,
      title: "주문을 취소하시겠습니까?",
      body: "취소 후에는 되돌릴 수 없습니다.",
      confirmLabel: "주문 취소",
      confirmTone: "danger",
    });
  };

  const handleConfirmAction = async () => {
    if (!confirmState.itemId || !effectiveUser) {
      closeConfirmDialog();
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
      const result = await cancelMemberOrder({
        user: effectiveUser,
        orderId: confirmState.itemId,
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

  const handleReviewWrite = () => {
    if (!requireMember("writeReview")) {
      return;
    }

    setToastState({
      message: "리뷰 작성 기능은 다음 단계에서 연결됩니다.",
      tone: "info",
    });
  };

  const handlePickupRequest = () => {
    if (!requireMember("pickupRequest", "/pickup/new")) {
      return;
    }

    navigate("/pickup/new");
  };

  const handleReturnRequest = () => {
    setToastState({
      message: "반품 신청 기능은 다음 단계에서 연결됩니다.",
      tone: "info",
    });
  };

  const handleWithdrawal = () => {
    setToastState({
      message: "회원탈퇴 기능은 고객센터 연동 후 제공됩니다.",
      tone: "info",
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

  if (isLoading && !isDemoPreview) {
    return (
      <PublicPageFrame>
        <div className="public-auth-page public-mypage-page">
          <div className="public-auth-page__body">
            <PublicAuthHeader />
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
    return (
      <Navigate
        replace
        state={{
          from: location,
          notice: isAdminAccount
            ? "운영자 계정은 공개 마이페이지를 사용할 수 없습니다. 관리자 페이지에서 로그인해 주세요."
            : "",
        }}
        to="/login"
      />
    );
  }

  const activeTabContent = (() => {
    if (activeTabKey === "sales") {
      if (tabPhases.sales === "loading" && !loadedTabs.sales) {
        return (
          <div className="public-mypage-stack">
            <div className="public-mypage-skeleton public-mypage-skeleton--panel" />
            <div className="public-mypage-skeleton public-mypage-skeleton--panel" />
          </div>
        );
      }

      return (
        <SalesTab
          expandedShipmentId={expandedShipmentId}
          onRequestPickup={handlePickupRequest}
          onToggleShipment={setExpandedShipmentId}
          onTrackParcel={handleTrackParcel}
          shipments={portalState.shipments}
        />
      );
    }

    if (activeTabKey === "purchases") {
      if (tabPhases.purchases === "loading" && !loadedTabs.purchases) {
        return <div className="public-mypage-skeleton public-mypage-skeleton--panel" />;
      }

      return (
        <PurchasesTab
          busyOrderId={busyOrderId}
          onCancelOrder={requestCancelOrder}
          onConfirmOrder={requestConfirmPurchase}
          onRequestReturn={handleReturnRequest}
          onTrackParcel={handleTrackParcel}
          onWriteReview={handleReviewWrite}
          orders={portalState.orders}
        />
      );
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
      return (
        <div className="public-mypage-stack">
          <div className="public-mypage-skeleton public-mypage-skeleton--panel" />
          <div className="public-mypage-skeleton public-mypage-skeleton--panel" />
        </div>
      );
    }

    return (
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
        joinDateText={joinDateText}
        nicknameStatus={nicknameStatus}
        openAccountSheet={openAccountSheet}
        openAddressSheet={openAddressSheet}
        portalState={portalState}
        profileErrors={profileErrors}
        profileForm={profileForm}
        profileSnapshot={profileSnapshot}
        requestDeleteAccount={requestDeleteAccount}
        requestDeleteAddress={requestDeleteAddress}
        setIsProfileEditing={setIsProfileEditing}
        setProfileErrors={setProfileErrors}
        setProfileForm={setProfileForm}
        user={effectiveUser}
      />
    );
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
            <PublicAuthHeader previewAccount={previewAccount} />

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

                <section className="public-mypage-hero">
                  <button
                    className="public-mypage-hero__profile"
                    onClick={() => moveToTab("settings", { openProfileEdit: true })}
                    type="button"
                  >
                    <div>
                      <p className="public-mypage-hero__eyebrow">👤 {displayName}님</p>
                      <h1 className="public-mypage-hero__title">{profileSnapshot?.email || effectiveUser?.email || "-"}</h1>
                    </div>
                    <span className="public-mypage-hero__link">프로필 수정 →</span>
                  </button>

                  <div className="public-mypage-hero__summary">
                    <MypageSummaryCard
                      description="판매현황으로 이동"
                      onClick={() => moveToTab("sales")}
                      title="📦 판매중"
                      value={`${summary.on_sale_book_count ?? 0}건`}
                    />
                    <MypageSummaryCard
                      description="정산내역으로 이동"
                      onClick={() => moveToTab("settlements")}
                      title="💰 정산 예정"
                      value={formatCurrency(summary.estimated_settled_value ?? 0)}
                    />
                    <MypageSummaryCard
                      description="구매현황으로 이동"
                      onClick={() => moveToTab("purchases")}
                      title="📚 구매 진행"
                      value={`${summary.purchase_in_progress_count ?? 0}건`}
                    />
                  </div>
                </section>

                <section className="public-mypage-tabs">
                  <div className="public-mypage-tabs__list" role="tablist">
                    {TAB_ITEMS.map((item) => (
                      <button
                        aria-selected={activeTabKey === item.key}
                        className={`public-mypage-tabs__button ${activeTabKey === item.key ? "is-active" : ""}`}
                        key={item.key}
                        onClick={() => moveToTab(item.key)}
                        role="tab"
                        type="button"
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>

                  <div className="public-mypage-tab-panel" key={activeTabKey} ref={tabPanelRef}>
                    {activeTabContent}
                  </div>
                </section>
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
        confirmLabel={confirmState.confirmLabel}
        confirmTone={confirmState.confirmTone}
        onClose={closeConfirmDialog}
        onConfirm={() => {
          void handleConfirmAction();
        }}
        open={confirmState.open}
        title={confirmState.title}
      />
      {memberGateDialog}
    </>
  );
}

function SalesTab({ expandedShipmentId, onRequestPickup, onToggleShipment, onTrackParcel, shipments }) {
  if (!shipments.length) {
    return (
      <MypageEmptyState
        actionLabel="수거 요청하기"
        actionOnClick={onRequestPickup}
        description="집에 잠자는 교재를 보내보세요!"
        icon="📚"
        title="아직 판매 내역이 없어요"
      />
    );
  }

  return (
    <div className="public-mypage-stack">
      <section className="public-mypage-section">
        <MypageSectionHeader
          description="수거 요청부터 검수와 판매 상태까지 한 화면에서 확인하세요."
          icon="📦"
          title="수거 요청 내역"
        />

        <div className="public-mypage-flow-list">
          {shipments.map((shipment) => {
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
                        {isExpanded ? "접기 ↑" : "상세 →"}
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
                          배송추적 →
                        </button>
                      ) : null}
                    </div>

                    <div className="public-mypage-progress-rail" role="presentation">
                      {SHIPMENT_PROGRESS_STEPS.map((step, index) => (
                        <div className="public-mypage-progress-rail__step" key={step.key}>
                          {index < SHIPMENT_PROGRESS_STEPS.length - 1 ? (
                            <span
                              className={`public-mypage-progress-rail__line ${
                                index < progressIndex ? "is-active" : ""
                              }`}
                            />
                          ) : null}
                          <span
                            className={`public-mypage-progress-rail__node ${
                              index <= progressIndex ? "is-active" : ""
                            }`}
                          />
                          <span className="public-mypage-progress-rail__label">{step.label}</span>
                        </div>
                      ))}
                    </div>

                    {shipment.trackingNumber ? (
                      <p className="public-mypage-flow-card__tracking">
                        운송장: {shipment.trackingCompany} {shipment.trackingNumber}
                      </p>
                    ) : null}

                    <div className="public-mypage-book-list">
                      {shipment.items.map((item) => (
                        <div className="public-mypage-book-row" key={item.id}>
                          <div className="public-mypage-book-row__copy">
                            <strong>[📚] {item.title}</strong>
                            <p>
                              {item.rejectionReason
                                ? `판매불가 · 사유: ${item.rejectionReason}`
                                : `등급: ${item.gradeLabel ?? "-"} | 판매가: ${
                                    item.price ? formatCurrency(item.price) : "-"
                                  }`}
                            </p>
                          </div>
                          <span className={`public-mypage-chip public-mypage-chip--${item.tone ?? "neutral"}`}>
                            {item.statusLabel}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

const PURCHASE_STATUS_FILTERS = [
  { value: "all", label: "전체" },
  { value: "in_progress", label: "진행중" },
  { value: "delivered", label: "배송완료" },
  { value: "confirmed", label: "구매확정" },
  { value: "cancelled", label: "취소/환불" },
];

function PurchasesTab({
  busyOrderId,
  onCancelOrder,
  onConfirmOrder,
  onRequestReturn,
  onTrackParcel,
  onWriteReview,
  orders,
}) {
  const [statusFilter, setStatusFilter] = useState("all");

  if (!orders.length) {
    return (
      <MypageEmptyState
        actionLabel="교재 둘러보기"
        actionTo="/store"
        description="마음에 드는 교재를 구매해보세요!"
        icon="🛒"
        title="아직 구매 내역이 없어요"
      />
    );
  }

  const filteredOrders = statusFilter === "all"
    ? orders
    : statusFilter === "in_progress"
      ? orders.filter((o) => ["pending", "paid", "shipping"].includes(o.status))
      : statusFilter === "cancelled"
        ? orders.filter((o) => ["cancelled", "refunded"].includes(o.status))
        : orders.filter((o) => o.status === statusFilter);

  return (
    <div className="public-mypage-stack">
      <section className="public-mypage-section">
        <MypageSectionHeader
          description="최근 주문, 배송 상태, 구매확정까지 이어서 관리하세요."
          icon="🛍"
          title="주문 내역"
        />

        {/* 상태 필터 */}
        <div className="public-mypage-order-filters">
          {PURCHASE_STATUS_FILTERS.map((f) => (
            <button
              className={`public-mypage-filter-chip ${statusFilter === f.value ? "public-mypage-filter-chip--active" : ""}`}
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              type="button"
            >
              {f.label}
            </button>
          ))}
        </div>

        {filteredOrders.length === 0 ? (
          <p className="public-mypage-order-empty-filter">해당 상태의 주문이 없습니다.</p>
        ) : (
        <div className="public-mypage-order-list">
          {filteredOrders.map((order) => (
            <article className="public-mypage-order-card" key={order.id}>
              <div className="public-mypage-order-card__header">
                <div>
                  <p className="public-mypage-order-card__meta">
                    주문 #{formatOrderReference(order.reference)} <span>{formatCompactDate(order.createdAt)}</span>
                  </p>
                  <div className="public-mypage-order-card__status">
                    <span className={`public-mypage-chip public-mypage-chip--${getOrderStatusTone(order.status)}`}>
                      {getOrderStatusLabel(order.status)}
                    </span>
                    {order.trackingNumber ? (
                      <span className="public-mypage-order-card__tracking">
                        {order.trackingCompany} {order.trackingNumber}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="public-mypage-order-card__items">
                {order.items.map((item) => (
                  <div className="public-mypage-order-item" key={item.id}>
                    <span>
                      [📚] {item.title} ({item.gradeLabel}) × {item.quantity}
                    </span>
                    <strong>{formatCurrency(item.price)}</strong>
                  </div>
                ))}
              </div>

              <p className="public-mypage-order-card__total">
                총 결제: {formatCurrency(order.totalAmount)}{" "}
                {order.shippingFee ? `(배송비 ${formatCurrency(order.shippingFee)} 포함)` : ""}
              </p>

              {order.autoConfirmDaysRemaining ? (
                <p className="public-mypage-order-card__note">
                  {order.autoConfirmDaysRemaining}일 후 자동으로 구매가 확정됩니다
                </p>
              ) : null}

              <div className="public-mypage-order-card__actions">
                {order.trackingNumber ? (
                  <button className="public-auth-button public-auth-button--secondary" onClick={() => onTrackParcel(order.trackingNumber)} type="button">
                    배송추적
                  </button>
                ) : null}
                {order.canConfirm ? (
                  <button
                    className="public-auth-button public-auth-button--primary"
                    disabled={busyOrderId === order.id}
                    onClick={() => onConfirmOrder(order)}
                    type="button"
                  >
                    {busyOrderId === order.id ? "처리 중..." : "구매확정"}
                  </button>
                ) : null}
                {order.canCancel ? (
                  <button
                    className="public-auth-button public-auth-button--danger"
                    disabled={busyOrderId === order.id}
                    onClick={() => onCancelOrder(order)}
                    type="button"
                  >
                    {busyOrderId === order.id ? "처리 중..." : "주문취소"}
                  </button>
                ) : null}
                {order.canReturn ? (
                  <button className="public-auth-button public-auth-button--secondary" onClick={onRequestReturn} type="button">
                    반품신청
                  </button>
                ) : null}
                {order.canReview ? (
                  <button className="public-auth-button public-auth-button--secondary" onClick={onWriteReview} type="button">
                    리뷰작성
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
        )}
      </section>
    </div>
  );
}

function SettlementsTab({ completedSettlements, onRequestPickup, scheduledSettlements, settlementSummary }) {
  if (!completedSettlements.length && !scheduledSettlements.length) {
    return (
      <MypageEmptyState
        actionLabel="수거 요청하기"
        actionOnClick={onRequestPickup}
        description="교재를 판매하면 정산 내역이 여기에 표시돼요."
        icon="💰"
        title="아직 정산 내역이 없어요"
      />
    );
  }

  return (
    <div className="public-mypage-stack">
      <section className="public-mypage-section">
        <MypageSectionHeader
          description="이번 달 정산 흐름과 누적 정산 금액을 함께 보여드려요."
          icon="💰"
          title="정산 내역"
        />

        <div className="public-mypage-settlement-summary">
          <div className="public-mypage-settlement-summary__item">
            <span>이번 달 정산</span>
            <strong>{formatCurrency(settlementSummary?.currentMonthAmount ?? 0)}</strong>
          </div>
          <div className="public-mypage-settlement-summary__item">
            <span>총 누적 정산</span>
            <strong>{formatCurrency(settlementSummary?.totalAmount ?? 0)}</strong>
          </div>
        </div>

        <div className="public-mypage-settlement-list">
          {completedSettlements.map((settlement) => (
            <article className="public-mypage-settlement-card" key={settlement.id}>
              <div className="public-mypage-settlement-card__row">
                <strong>{formatCompactDate(settlement.date)} 정산완료</strong>
                <span className="public-mypage-settlement-card__amount">+{formatCurrency(settlement.amount)}</span>
              </div>
              <p>
                수거 #{settlement.pickupReference} · 교재 {settlement.bookCount}권
              </p>
              <p>
                판매 {formatCurrency(settlement.grossSales)} - 수수료 {formatCurrency(settlement.feeAmount)}
              </p>
              <p>
                입금: {settlement.bankLabel} {settlement.maskedAccount}
              </p>
            </article>
          ))}
        </div>

        {scheduledSettlements.length ? (
          <div className="public-mypage-pending-settlements">
            <h3 className="public-mypage-pending-settlements__title">정산 예정</h3>
            <div className="public-mypage-settlement-list">
              {scheduledSettlements.map((settlement) => (
                <article className="public-mypage-settlement-card" key={settlement.id}>
                  <div className="public-mypage-settlement-card__row">
                    <strong>{formatCompactDate(settlement.date)} 예정</strong>
                    <span className="public-mypage-settlement-card__amount">+{formatCurrency(settlement.amount)}</span>
                  </div>
                  <span className={`public-mypage-chip public-mypage-chip--${settlement.tone ?? "warning"}`}>
                    {settlement.statusLabel}
                  </span>
                </article>
              ))}
            </div>
          </div>
        ) : null}
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
  joinDateText,
  nicknameStatus,
  openAccountSheet,
  openAddressSheet,
  portalState,
  profileErrors,
  profileForm,
  profileSnapshot,
  requestDeleteAccount,
  requestDeleteAddress,
  setIsProfileEditing,
  setProfileErrors,
  setProfileForm,
  user,
}) {
  return (
    <div className="public-mypage-stack">
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
          icon="👤"
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
                {profileSnapshot?.email || user?.email || "-"} <em>(변경불가)</em>
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

      <section className="public-mypage-section">
        <MypageSectionHeader
          action={
            <button className="public-mypage-inline-button public-mypage-inline-button--primary" onClick={() => openAddressSheet()} type="button">
              + 새 주소
            </button>
          }
          description="주문 때 자주 쓰는 배송지를 최대 5개까지 등록할 수 있습니다."
          icon="📍"
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
          <MypageEmptyState description="주문 전에 기본 배송지를 미리 등록해 두면 더 편하게 이용할 수 있어요." icon="📍" title="등록한 배송지가 없어요" />
        )}
      </section>

      <section className="public-mypage-section">
        <MypageSectionHeader
          action={
            <button className="public-mypage-inline-button public-mypage-inline-button--primary" onClick={() => openAccountSheet()} type="button">
              + 새 계좌
            </button>
          }
          description="계좌 정보는 정산 시에만 사용되며 암호화되어 안전하게 보관됩니다."
          icon="💰"
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
                      {maskAccountNumber(account.account_number)} · {account.account_holder}
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
          <MypageEmptyState description="판매 정산을 받으려면 기본 계좌를 먼저 등록해 주세요." icon="💳" title="등록한 정산 계좌가 없어요" />
        )}
      </section>

      <section className="public-mypage-section public-mypage-section--compact">
        <MypageSectionHeader
          description={isDemoPreview ? "데모에서는 로그아웃 대신 홈으로 돌아갑니다." : "로그아웃과 회원탈퇴 관련 작업을 여기서 관리합니다."}
          icon="🔒"
          title="계정"
        />
        <div className="public-mypage-account-actions public-mypage-account-actions--split">
          <button className="public-auth-button public-auth-button--secondary" disabled={isSigningOut} onClick={handleSignOut} type="button">
            {isDemoPreview ? "데모 종료" : isSigningOut ? "로그아웃 중..." : "로그아웃"}
          </button>
          <button className="public-auth-button public-mypage-button--danger-outline" onClick={handleWithdrawal} type="button">
            회원탈퇴
          </button>
        </div>
      </section>
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
            {profileForm.email} <em>(변경불가)</em>
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
        비밀번호 변경 →
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
            <input className="public-auth-field-row__input" id="public-mypage-account-number" onChange={handleAccountChange("account_number")} placeholder="110-123-456789" type="text" value={accountForm.account_number} />
          </div>
          {accountErrors.account_number ? <p className="public-auth-inline-message public-auth-inline-message--error">{accountErrors.account_number}</p> : null}
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
