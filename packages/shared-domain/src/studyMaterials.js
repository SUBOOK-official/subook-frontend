export const STUDY_MATERIAL_YEAR = 2028;
export const STUDY_MATERIAL_BUCKET = "admin-study-materials";
export const STUDY_MATERIAL_MAX_BYTES = 1024 * 1024 * 1024;
export const STUDY_MATERIAL_SUBJECTS = ["국어", "수학", "영어", "한국사", "통합사회", "통합과학", "기타"];
export const STUDY_MATERIAL_DETAILS = {
  국어: ["화법과 언어", "독서와 작문", "문학"],
  수학: ["대수", "미적분1", "확률과 통계"],
  영어: [], 한국사: [], 통합사회: [], 통합과학: [], 기타: [],
};

export function validateStudyMaterialFile(file) {
  if (!file || !/\.pdf$/i.test(file.name)) return "PDF 파일만 업로드할 수 있습니다.";
  if (file.type && !["application/pdf", "application/octet-stream"].includes(file.type)) return "PDF 파일만 업로드할 수 있습니다.";
  if (!Number.isSafeInteger(file.size) || file.size < 5) return "파일이 비어 있거나 올바르지 않습니다.";
  if (file.size > STUDY_MATERIAL_MAX_BYTES) return "PDF는 파일당 1GB 이하로 업로드해 주세요.";
  if (file.name.length > 350 || file.name.replace(/\.pdf$/i, "").trim().length > 300) return "파일 이름은 300자 이하로 줄여 주세요.";
  return "";
}

export function formatMaterialSize(bytes) {
  const size = Number(bytes) || 0;
  if (size >= 1024 ** 3) return `${(size / 1024 ** 3).toFixed(2)} GB`;
  if (size >= 1024 ** 2) return `${(size / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(1, Math.ceil(size / 1024))} KB`;
}

export function materialCategoryFromPath(relativePath) {
  const parts = relativePath.replaceAll("\\", "/").split("/");
  const subject = parts.shift();
  const fileName = parts.pop();
  if (!STUDY_MATERIAL_SUBJECTS.includes(subject) || !fileName || parts.length > 1) throw new Error(`과목 폴더 구조를 확인해 주세요: ${relativePath}`);
  return { subject, subject_detail: parts[0] || "", file_name: fileName, title: fileName.replace(/\.pdf$/i, "").trim() };
}
