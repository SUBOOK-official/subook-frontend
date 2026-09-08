import { isValidKoreanMobile } from "./publicAuthFormUtils.js";

// 기존 주문 검증 조건·오류 코드를 유지하며 입력 중 안내와 제출 검증에서 함께 사용한다.
export function getOrderValidationErrors({ shipping, refundAccount, isPg, agreementOrder, agreementPayment, agreementRefund }) {
  const errors = [];
  if (!shipping.recipientName.trim()) {
    errors.push({ field: "recipient_name", message: "수령인 이름을 입력해주세요." });
  }
  if (!shipping.recipientPhone.trim()) {
    errors.push({ field: "recipient_phone", message: "수령인 연락처를 입력해주세요." });
  } else if (!isValidKoreanMobile(shipping.recipientPhone)) {
    errors.push({ field: "phone_format", message: "휴대폰 번호를 정확히 입력해주세요. (예: 010-1234-5678)" });
  }
  if (!shipping.postalCode.trim() || !shipping.addressLine1.trim()) {
    errors.push({ field: "address", message: "주소 검색으로 배송지 주소를 입력해주세요." });
  }
  if (!agreementOrder) {
    errors.push({ field: "agreement_order", message: "[필수] 주문 내용 확인 및 개인정보 수집·이용 동의에 체크해주세요." });
  }
  if (!isPg && !agreementPayment) {
    errors.push({ field: "agreement_payment", message: "[필수] 미입금 시 주문 자동 취소 동의에 체크해주세요." });
  }
  if (!agreementRefund) {
    errors.push({ field: "agreement_refund", message: "[필수] 환불·교환 정책 확인 동의에 체크해주세요." });
  }
  if (!isPg) {
    if (!refundAccount.bank.trim()) {
      errors.push({ field: "refund_bank", message: "환불받을 계좌의 은행을 선택해주세요." });
    }
    if (refundAccount.number.replace(/[^0-9]/g, "").length < 6) {
      errors.push({ field: "refund_account_number", message: "환불받을 계좌번호를 정확히 입력해주세요." });
    }
    if (!refundAccount.holder.trim()) {
      errors.push({ field: "refund_account_holder", message: "환불받을 계좌의 예금주를 입력해주세요." });
    }
  }
  return errors;
}

export function getOrderInputField(field) {
  return field === "phone_format" ? "recipient_phone" : field;
}

export function focusOrderValidationError(field, root = document) {
  const target = root.getElementById(`checkout-${getOrderInputField(field)}`)
    ?? root.getElementById("checkout-address-change");
  target?.focus({ preventScroll: true });
  target?.scrollIntoView({ block: "center", behavior: "instant" });
}
