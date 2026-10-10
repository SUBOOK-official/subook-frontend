import { Upload } from "tus-js-client";
import { STUDY_MATERIAL_BUCKET, STUDY_MATERIAL_YEAR, STUDY_MATERIAL_SUBJECTS, validateStudyMaterialFile } from "../../shared-domain/src/studyMaterials.js";

const FIELDS = "id,exam_year,subject,subject_detail,title,file_name,storage_path,size_bytes,created_at";

async function request(run, attempts = 2) {
  let error;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    let timer;
    try {
      const result = await Promise.race([run(controller.signal), new Promise((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error("요청 시간이 초과되었습니다. 다시 시도해 주세요.")); }, 20000);
      })]);
      if (result.error) throw result.error;
      return result;
    } catch (caught) {
      error = caught;
      if (["42501", "22023", "23514"].includes(error.code)) break;
    } finally { clearTimeout(timer); }
  }
  throw error;
}

export async function listStudyMaterials(client) {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const { data } = await request((signal) => client.from("admin_study_materials").select(FIELDS)
      .eq("exam_year", STUDY_MATERIAL_YEAR).order("created_at", { ascending: false }).order("id")
      .range(offset, offset + 999).abortSignal(signal));
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}

export function studyMaterialStoragePath(id) { return `${STUDY_MATERIAL_YEAR}/${id}.pdf`; }

// Storage의 CORS 응답은 Accept-Ranges를 노출하지 않으므로 알려진 파일 크기로 직접 범위 요청한다.
// 500MB 교재를 열 때 전체 파일이 자동 다운로드되는 것을 방지한다.
export async function fetchStudyMaterialRange(url, begin, end, signal, fetcher = fetch) {
  const { data } = await request(async (timeoutSignal) => {
    const response = await fetcher(url, { headers: { Range: `bytes=${begin}-${end - 1}` },
      signal: signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal, referrerPolicy: "no-referrer" });
    if (response.status !== 206) { await response.body?.cancel(); throw new Error("PDF 일부를 불러오지 못했습니다. 다시 열어 주세요."); }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length !== end - begin) throw new Error("PDF 파일 응답 길이가 올바르지 않습니다.");
    return { data: bytes };
  });
  return data;
}

export async function createStudyMaterialUrl(client, row, download = false) {
  const { data } = await request(() => client.storage.from(STUDY_MATERIAL_BUCKET)
    .createSignedUrl(row.storage_path, 3600, download ? { download: row.file_name } : undefined));
  return data.signedUrl;
}

// 브라우저/일괄 가져오기 모두 동일한 TUS 설정 사용. PDF 전체를 메모리에 올리지 않는다.
export function uploadStudyMaterialBytes({ file, size, path, supabaseUrl, token, onProgress, signal, urlStorage, UploadClass = Upload }) {
  const url = new URL(supabaseUrl);
  if (url.hostname.endsWith(".supabase.co") && !url.hostname.endsWith(".storage.supabase.co")) {
    url.hostname = url.hostname.replace(".supabase.co", ".storage.supabase.co");
  }
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error("업로드를 중지했습니다.")); return; }
    let upload;
    const cleanup = () => signal?.removeEventListener("abort", cancel);
    const fail = () => { cleanup(); reject(new Error("파일 전송에 실패했습니다. 연결을 확인하고 다시 시도해 주세요.")); };
    const cancel = () => { void upload.abort().catch(() => {}); cleanup(); reject(new Error("업로드를 중지했습니다.")); };
    upload = new UploadClass(file, {
      endpoint: `${url.origin}/storage/v1/upload/resumable`,
      headers: { authorization: `Bearer ${token}` },
      uploadSize: size,
      chunkSize: 6 * 1024 * 1024,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      ...(urlStorage ? { urlStorage } : {}),
      // 신규 UUID 경로에만 저장하며 기존 자료를 덮어쓰지 않는다.
      fingerprint: () => Promise.resolve(`${url.origin}/${STUDY_MATERIAL_BUCKET}/${path}`),
      metadata: { bucketName: STUDY_MATERIAL_BUCKET, objectName: path, contentType: "application/pdf", cacheControl: "3600" },
      onBeforeRequest: (req) => {
        const raw = req.getUnderlyingObject();
        if (raw) { raw.timeout = 120000; return; } // 브라우저 XHR
        // Node 스택은 send 전에는 ClientRequest가 생성되지 않는다.
        const send = req.send.bind(req);
        req.send = async (body) => {
          let timer;
          try { return await Promise.race([send(body), new Promise((_, reject) => {
            timer = setTimeout(() => { void req.abort(); reject(new Error("전송 시간 초과")); }, 120000);
          })]); } finally { clearTimeout(timer); }
        };
      },
      onProgress: (uploaded, total) => onProgress?.(Math.round(uploaded / total * 100)),
      onError: fail,
      onSuccess: () => { cleanup(); resolve(); },
    });
    signal?.addEventListener("abort", cancel, { once: true });
    upload.findPreviousUploads().then((previous) => {
      if (signal?.aborted) return;
      if (previous.length) upload.resumeFromPreviousUpload(previous[0]);
      upload.start();
    }).catch(fail);
  });
}

export async function uploadStudyMaterial(client, item, { onProgress, signal } = {}) {
  const validation = validateStudyMaterialFile(item.file);
  if (validation) throw new Error(validation);
  if (!STUDY_MATERIAL_SUBJECTS.includes(item.subject) || item.subject_detail.trim().length > 80) throw new Error("과목과 세부과목을 확인해 주세요.");
  const header = new TextDecoder().decode(await item.file.slice(0, 5).arrayBuffer());
  if (header !== "%PDF-") throw new Error("올바른 PDF 파일이 아닙니다.");
  const { data: { session }, error } = await client.auth.getSession();
  if (error || !session) throw new Error("로그인이 만료되었습니다. 다시 로그인해 주세요.");
  const payload = { p_id: item.id, p_subject: item.subject, p_subject_detail: item.subject_detail.trim(),
    p_title: item.file.name.replace(/\.pdf$/i, "").trim(), p_file_name: item.file.name, p_size_bytes: item.file.size };
  const path = studyMaterialStoragePath(item.id);
  // 저장 응답이 유실됐거나 전송 후 등록만 실패했다면 파일을 재전송하지 않는다.
  const { data: existing } = await request((abortSignal) => client.from("admin_study_materials").select(FIELDS).eq("id", item.id).maybeSingle().abortSignal(abortSignal));
  if (existing) return existing;
  const { data: uploaded } = await request(async () => {
    const result = await client.storage.from(STUDY_MATERIAL_BUCKET).exists(path);
    // storage-js는 없는 객체(400/404)에도 data:false와 error를 함께 반환한다.
    return result.data === false ? { data: false, error: null } : result;
  });
  if (!uploaded) await uploadStudyMaterialBytes({ file: item.file, size: item.file.size, path,
    supabaseUrl: client.supabaseUrl, token: session.access_token, onProgress, signal });
  const { data } = await request((abortSignal) => client.rpc("admin_register_study_material", payload).abortSignal(abortSignal));
  return data;
}
