export function formatDate(dateString) {
  if (!dateString) {
    return "-";
  }

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return dateString;
  }

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

export function formatCurrency(amount) {
  if (amount === null || amount === undefined || amount === "") {
    return "미입력";
  }

  const numericAmount = Number(amount);
  if (Number.isNaN(numericAmount)) {
    return "미입력";
  }

  return `${numericAmount.toLocaleString("ko-KR")}원`;
}
