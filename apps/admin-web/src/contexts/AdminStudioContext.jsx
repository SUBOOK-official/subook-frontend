import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { isSupabaseConfigured, supabase } from "@shared-supabase/supabaseClient";

const STUDIO_MAX_IMAGE_SIDE = 1600;
const STUDIO_MAX_BASE64_LENGTH = 3_000_000;
const STUDIO_OUTPUT_QUALITY_STEPS = [0.9, 0.82, 0.75, 0.68];
const STUDIO_REQUEST_TIMEOUT_MS = 240_000;

const AdminStudioContext = createContext(null);

function revokeStudioPreviewUrls(items) {
  items.forEach((item) => {
    if (item?.sourcePreviewUrl) {
      URL.revokeObjectURL(item.sourcePreviewUrl);
    }
  });
}

function getImageDataFromDataUrl(dataUrl) {
  const marker = ";base64,";
  const markerIndex = dataUrl.indexOf(marker);
  if (markerIndex < 0) {
    throw new Error("이미지 변환 형식이 올바르지 않습니다.");
  }

  const mimeType = dataUrl.slice(5, markerIndex);
  const imageBase64 = dataUrl.slice(markerIndex + marker.length);
  return { mimeType, imageBase64 };
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("이미지를 읽지 못했습니다."));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("이미지를 불러오지 못했습니다."));
    image.src = dataUrl;
  });
}

async function prepareStudioImagePayload(file) {
  const sourceDataUrl = await readFileAsDataUrl(file);
  const sourceImage = await loadImage(sourceDataUrl);

  const sourceWidth = sourceImage.naturalWidth || sourceImage.width;
  const sourceHeight = sourceImage.naturalHeight || sourceImage.height;
  if (!sourceWidth || !sourceHeight) {
    throw new Error("이미지 크기를 확인할 수 없습니다.");
  }

  const scale = Math.min(1, STUDIO_MAX_IMAGE_SIDE / Math.max(sourceWidth, sourceHeight));
  const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
  const targetHeight = Math.max(1, Math.round(sourceHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("이미지 처리를 시작할 수 없습니다.");
  }

  context.drawImage(sourceImage, 0, 0, targetWidth, targetHeight);

  for (const quality of STUDIO_OUTPUT_QUALITY_STEPS) {
    const compressed = canvas.toDataURL("image/jpeg", quality);
    const payload = getImageDataFromDataUrl(compressed);
    if (payload.imageBase64.length <= STUDIO_MAX_BASE64_LENGTH) {
      return payload;
    }
  }

  throw new Error("이미지 용량이 너무 큽니다. 더 작은 이미지를 선택해 주세요.");
}

function getStudioDownloadName(originalName, mimeType) {
  const cleanName = String(originalName || "book").replace(/\.[^/.]+$/, "");
  const extension = mimeType === "image/webp" ? "webp" : "png";
  return `${cleanName}_studio_2k.${extension}`;
}

function supportsDirectoryDownloadApi() {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    typeof window.showDirectoryPicker === "function"
  );
}

async function dataUrlToBlob(dataUrl) {
  const response = await fetch(dataUrl);
  return response.blob();
}

function getUniqueStudioDownloadName(originalName, mimeType, usedNames) {
  const initialName = getStudioDownloadName(originalName, mimeType);
  if (!usedNames.has(initialName)) {
    usedNames.add(initialName);
    return initialName;
  }

  const extensionIndex = initialName.lastIndexOf(".");
  const baseName = extensionIndex >= 0 ? initialName.slice(0, extensionIndex) : initialName;
  const extension = extensionIndex >= 0 ? initialName.slice(extensionIndex) : "";
  let duplicateIndex = 2;

  while (true) {
    const nextName = `${baseName}_${duplicateIndex}${extension}`;
    if (!usedNames.has(nextName)) {
      usedNames.add(nextName);
      return nextName;
    }
    duplicateIndex += 1;
  }
}

function createStudioJobs(files) {
  return files.map((file, index) => ({
    id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
    file,
    fileName: file.name,
    sourcePreviewUrl: URL.createObjectURL(file),
    status: "ready",
    errorMessage: "",
    generatedDataUrl: "",
    generatedMimeType: "",
  }));
}

function getSummary(jobs) {
  return jobs.reduce(
    (accumulator, job) => {
      accumulator.total += 1;
      if (job.status === "ready") {
        accumulator.ready += 1;
      } else if (job.status === "queued") {
        accumulator.queued += 1;
      } else if (job.status === "processing") {
        accumulator.processing += 1;
      } else if (job.status === "done") {
        accumulator.done += 1;
      } else if (job.status === "error") {
        accumulator.error += 1;
      }
      return accumulator;
    },
    { total: 0, ready: 0, queued: 0, processing: 0, done: 0, error: 0 },
  );
}

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function AdminStudioProvider({ children }) {
  const [jobs, setJobs] = useState([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [isQueueRunning, setIsQueueRunning] = useState(false);
  const [runStats, setRunStats] = useState(null);
  const [clockNowMs, setClockNowMs] = useState(() => Date.now());
  const supportsDirectoryDownload = supportsDirectoryDownloadApi();

  const jobsRef = useRef(jobs);
  const isProcessingRef = useRef(false);
  const runStatsRef = useRef(null);

  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  useEffect(
    () => () => {
      revokeStudioPreviewUrls(jobsRef.current);
    },
    [],
  );

  const summary = useMemo(() => getSummary(jobs), [jobs]);
  const isGenerating = summary.queued > 0 || summary.processing > 0 || isQueueRunning;

  useEffect(() => {
    if (!isGenerating || !runStats?.startedAt) {
      return;
    }

    setClockNowMs(Date.now());
    const intervalId = window.setInterval(() => {
      setClockNowMs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isGenerating, runStats?.startedAt]);

  const studioProgress = useMemo(() => {
    if (!runStats || !runStats.total) {
      return {
        total: 0,
        completed: 0,
        remaining: 0,
        percent: 0,
        estimatedRemainingMs: null,
      };
    }

    const completed = runStats.success + runStats.failed;
    const remaining = Math.max(0, runStats.total - completed);
    const percent = Math.min(100, Math.round((completed / runStats.total) * 100));

    let estimatedRemainingMs = null;
    if (remaining > 0 && completed > 0 && runStats.startedAt) {
      const elapsedMs = Math.max(0, clockNowMs - runStats.startedAt);
      const averagePerItemMs = elapsedMs / completed;
      estimatedRemainingMs = Math.max(0, Math.round(averagePerItemMs * remaining));
    }

    return {
      total: runStats.total,
      completed,
      remaining,
      percent,
      estimatedRemainingMs,
    };
  }, [runStats, clockNowMs]);

  const clearMessages = useCallback(() => {
    setError("");
    setNotice("");
  }, []);

  const requestStudioGeneration = useCallback(async (accessToken, payload) => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      controller.abort();
    }, STUDIO_REQUEST_TIMEOUT_MS);

    let response;
    try {
      response = await fetch("/api/admin/book-studio", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (requestError) {
      if (requestError instanceof DOMException && requestError.name === "AbortError") {
        throw new Error(
          `요청 시간이 초과되었습니다. (${Math.floor(STUDIO_REQUEST_TIMEOUT_MS / 1000)}초) 잠시 후 다시 시도해 주세요.`,
        );
      }
      throw requestError;
    } finally {
      window.clearTimeout(timeoutId);
    }

    let responseBody = {};
    try {
      responseBody = await response.json();
    } catch (_parseError) {
      responseBody = {};
    }

    if (!response.ok) {
      const code = String(responseBody.code || "").trim();
      const errorMessage = String(responseBody.error || "AI 사진 생성에 실패했습니다.").trim();
      const detail = String(responseBody.detail || "").trim();
      const statusText = response.status ? `HTTP ${response.status}` : "";

      const segments = [];
      if (statusText) {
        segments.push(statusText);
      }
      if (code) {
        segments.push(code);
      }
      segments.push(errorMessage);
      if (detail) {
        segments.push(detail);
      }

      throw new Error(segments.join(" | "));
    }

    if (!responseBody.imageBase64 || !responseBody.mimeType) {
      const code = String(responseBody.code || "INVALID_STUDIO_RESPONSE").trim();
      const detail = String(responseBody.detail || "").trim();
      const segments = ["AI 사진 생성 결과 형식이 올바르지 않습니다.", code];
      if (detail) {
        segments.push(detail);
      }
      throw new Error(segments.join(" | "));
    }

    return responseBody;
  }, []);

  const processQueuedJob = useCallback(
    async (job) => {
      if (!job) {
        return;
      }

      isProcessingRef.current = true;
      setJobs((previousJobs) =>
        previousJobs.map((item) =>
          item.id === job.id
            ? {
                ...item,
                status: "processing",
                errorMessage: "",
              }
            : item,
        ),
      );

      try {
        if (!isSupabaseConfigured || !supabase) {
          throw new Error("Supabase 환경 변수가 설정되지 않아 기능을 사용할 수 없습니다.");
        }

        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData?.session?.access_token || "";
        if (!accessToken) {
          throw new Error("로그인 세션이 만료되었습니다. 다시 로그인해 주세요.");
        }

        const payload = await prepareStudioImagePayload(job.file);
        const generated = await requestStudioGeneration(accessToken, payload);
        const generatedDataUrl = `data:${generated.mimeType};base64,${generated.imageBase64}`;

        runStatsRef.current = runStatsRef.current
          ? {
              ...runStatsRef.current,
              success: runStatsRef.current.success + 1,
            }
          : null;
        if (runStatsRef.current) {
          setRunStats(runStatsRef.current);
        }

        setJobs((previousJobs) =>
          previousJobs.map((item) =>
            item.id === job.id
              ? {
                  ...item,
                  status: "done",
                  generatedDataUrl,
                  generatedMimeType: generated.mimeType,
                  errorMessage: "",
                }
              : item,
          ),
        );
      } catch (generationError) {
        const message =
          generationError instanceof Error
            ? generationError.message
            : "이미지 생성 중 오류가 발생했습니다.";

        runStatsRef.current = runStatsRef.current
          ? {
              ...runStatsRef.current,
              failed: runStatsRef.current.failed + 1,
            }
          : null;
        if (runStatsRef.current) {
          setRunStats(runStatsRef.current);
        }

        setJobs((previousJobs) =>
          previousJobs.map((item) =>
            item.id === job.id
              ? {
                  ...item,
                  status: "error",
                  errorMessage: message,
                }
              : item,
          ),
        );
      } finally {
        isProcessingRef.current = false;
      }
    },
    [requestStudioGeneration],
  );

  useEffect(() => {
    if (!isQueueRunning || isProcessingRef.current) {
      return;
    }

    const nextJob = jobs.find((job) => job.status === "queued");
    if (!nextJob) {
      const runStats = runStatsRef.current;
      runStatsRef.current = null;
      setIsQueueRunning(false);
      if (runStats) {
        setRunStats(runStats);
      }

      if (runStats) {
        if (runStats.success > 0) {
          setNotice(
            `${runStats.success}장 생성 완료${
              runStats.failed > 0 ? ` · 실패 ${runStats.failed}장` : ""
            }`,
          );
          setError("");
        } else {
          setError("생성에 성공한 이미지가 없습니다. 아래 실패 사유를 확인해 주세요.");
          setNotice("");
        }
      }
      return;
    }

    void processQueuedJob(nextJob);
  }, [isQueueRunning, jobs, processQueuedJob]);

  const replaceFiles = useCallback(
    (selectedFiles) => {
      if (isGenerating) {
        return false;
      }

      const files = Array.from(selectedFiles || []);
      if (files.length === 0) {
        return false;
      }

      const nextJobs = createStudioJobs(files);

      setJobs((previousJobs) => {
        revokeStudioPreviewUrls(previousJobs);
        return nextJobs;
      });

      setIsQueueRunning(false);
      runStatsRef.current = null;
      setRunStats(null);
      setError("");

      setNotice(`${nextJobs.length}장의 책 사진을 준비했습니다.`);
      return true;
    },
    [isGenerating],
  );

  const appendFiles = useCallback(
    (selectedFiles) => {
      const files = Array.from(selectedFiles || []);
      if (files.length === 0) {
        return false;
      }

      const nextJobs = createStudioJobs(files).map((job) => ({
        ...job,
        status: isGenerating ? "queued" : job.status,
      }));
      setJobs((previousJobs) => [...previousJobs, ...nextJobs]);

      if (isGenerating && runStatsRef.current) {
        const nextRunStats = {
          ...runStatsRef.current,
          total: runStatsRef.current.total + nextJobs.length,
        };
        runStatsRef.current = nextRunStats;
        setRunStats(nextRunStats);
      } else {
        setRunStats(null);
      }

      setError("");
      setNotice(
        isGenerating
          ? `${nextJobs.length}장을 대기열에 추가했습니다. 현재 생성이 끝나면 이어서 처리됩니다.`
          : `${nextJobs.length}장을 기존 목록에 추가했습니다.`,
      );
      return true;
    },
    [isGenerating],
  );

  const clearJobs = useCallback(() => {
    if (isGenerating) {
      setError("생성 중에는 초기화할 수 없습니다.");
      return false;
    }

    setJobs((previousJobs) => {
      revokeStudioPreviewUrls(previousJobs);
      return [];
    });
    setNotice("");
    setError("");
    runStatsRef.current = null;
    setRunStats(null);
    return true;
  }, [isGenerating]);

  const enqueueByStatus = useCallback((statuses, emptyMessage, startMessage) => {
    const candidates = jobs.filter((job) => statuses.includes(job.status));
    if (candidates.length === 0) {
      setError(emptyMessage);
      return false;
    }

    const candidateIds = new Set(candidates.map((job) => job.id));
    const nextRunStats = {
      total: candidates.length,
      success: 0,
      failed: 0,
      startedAt: Date.now(),
    };
    runStatsRef.current = nextRunStats;
    setRunStats(nextRunStats);
    setJobs((previousJobs) =>
      previousJobs.map((item) =>
        candidateIds.has(item.id)
          ? {
              ...item,
              status: "queued",
              errorMessage: "",
            }
          : item,
      ),
    );
    setError("");
    setNotice(startMessage(candidates.length));
    setIsQueueRunning(true);
    return true;
  }, [jobs]);

  const startGeneration = useCallback(() => {
    if (!isSupabaseConfigured || !supabase) {
      setError("Supabase 환경 변수가 설정되지 않아 기능을 사용할 수 없습니다.");
      return false;
    }

    return enqueueByStatus(
      ["ready", "error"],
      "생성할 이미지가 없습니다. 먼저 사진을 선택해 주세요.",
      (count) => `백그라운드 생성을 시작했습니다. ${count}장을 순차 처리합니다.`,
    );
  }, [enqueueByStatus]);

  const retryFailedJobs = useCallback(() => {
    if (!isSupabaseConfigured || !supabase) {
      setError("Supabase 환경 변수가 설정되지 않아 기능을 사용할 수 없습니다.");
      return false;
    }

    return enqueueByStatus(
      ["error"],
      "재시도할 실패 이미지가 없습니다.",
      (count) => `실패한 ${count}장을 백그라운드에서 재시도합니다.`,
    );
  }, [enqueueByStatus]);

  const retryJob = useCallback(
    (jobId) => {
      if (!jobId || isGenerating) {
        return false;
      }

      const candidate = jobs.find((job) => job.id === jobId && job.status === "error");
      if (!candidate) {
        return false;
      }

      const nextRunStats = { total: 1, success: 0, failed: 0, startedAt: Date.now() };
      runStatsRef.current = nextRunStats;
      setRunStats(nextRunStats);
      setJobs((previousJobs) =>
        previousJobs.map((item) =>
          item.id === jobId
            ? {
                ...item,
                status: "queued",
                errorMessage: "",
              }
            : item,
        ),
      );
      setError("");
      setNotice(`"${candidate.fileName}" 재시도를 시작했습니다.`);
      setIsQueueRunning(true);
      return true;
    },
    [isGenerating, jobs],
  );

  const downloadJob = useCallback((job) => {
    if (!job?.generatedDataUrl) {
      return false;
    }

    const link = document.createElement("a");
    link.href = job.generatedDataUrl;
    link.download = getStudioDownloadName(job.fileName, job.generatedMimeType);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return true;
  }, []);

  const saveGeneratedJobsToDirectory = useCallback(async (downloadable) => {
    if (!supportsDirectoryDownloadApi()) {
      return 0;
    }

    let directoryHandle;
    try {
      directoryHandle = await window.showDirectoryPicker({ mode: "readwrite" });
    } catch (directoryError) {
      if (directoryError instanceof DOMException && directoryError.name === "AbortError") {
        return 0;
      }
      throw directoryError;
    }

    const usedNames = new Set();
    const failedFiles = [];
    let savedCount = 0;

    for (const job of downloadable) {
      try {
        const fileName = getUniqueStudioDownloadName(job.fileName, job.generatedMimeType, usedNames);
        const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        const blob = await dataUrlToBlob(job.generatedDataUrl);
        await writable.write(blob);
        await writable.close();
        savedCount += 1;
      } catch (_saveError) {
        failedFiles.push(job.fileName);
      }
    }

    if (failedFiles.length > 0) {
      const previewText =
        failedFiles.length > 2
          ? `${failedFiles.slice(0, 2).join(", ")} 외 ${failedFiles.length - 2}건`
          : failedFiles.join(", ");
      setError(`일부 이미지를 저장하지 못했습니다. ${previewText}`);
    } else {
      setError("");
    }

    if (savedCount > 0) {
      const folderName = directoryHandle?.name ? `"${directoryHandle.name}" 폴더` : "선택한 폴더";
      setNotice(
        `${savedCount}장을 ${folderName}에 저장했습니다.${
          failedFiles.length > 0 ? ` 실패 ${failedFiles.length}장` : ""
        }`,
      );
    }

    return savedCount;
  }, []);

  const downloadAllGenerated = useCallback(async () => {
    const downloadable = jobs.filter((job) => job.status === "done" && job.generatedDataUrl);
    if (downloadable.length === 0) {
      setError("다운로드할 생성 결과가 없습니다.");
      return 0;
    }

    if (supportsDirectoryDownload) {
      try {
        return await saveGeneratedJobsToDirectory(downloadable);
      } catch (directoryError) {
        const message =
          directoryError instanceof Error
            ? directoryError.message
            : "폴더 저장에 실패했습니다. 브라우저 다운로드로 다시 시도해 주세요.";
        setError(message);
        return 0;
      }
    }

    for (let index = 0; index < downloadable.length; index += 1) {
      downloadJob(downloadable[index]);
      if (index < downloadable.length - 1) {
        await sleep(140);
      }
    }

    setError("");
    setNotice(
      `${downloadable.length}장을 일괄 다운로드했습니다. 브라우저에서 여러 다운로드를 허용해 주세요.`,
    );
    return downloadable.length;
  }, [downloadJob, jobs, saveGeneratedJobsToDirectory, supportsDirectoryDownload]);

  const value = useMemo(
    () => ({
      jobs,
      summary,
      notice,
      error,
      isGenerating,
      studioProgress,
      requestTimeoutMs: STUDIO_REQUEST_TIMEOUT_MS,
      supportsDirectoryDownload,
      replaceFiles,
      appendFiles,
      clearJobs,
      clearMessages,
      startGeneration,
      retryFailedJobs,
      retryJob,
      downloadJob,
      downloadAllGenerated,
    }),
    [
      clearJobs,
      clearMessages,
      downloadAllGenerated,
      downloadJob,
      error,
      isGenerating,
      jobs,
      notice,
      supportsDirectoryDownload,
      appendFiles,
      studioProgress,
      replaceFiles,
      retryFailedJobs,
      retryJob,
      startGeneration,
      summary,
    ],
  );

  return <AdminStudioContext.Provider value={value}>{children}</AdminStudioContext.Provider>;
}

export function useAdminStudio() {
  const context = useContext(AdminStudioContext);
  if (!context) {
    throw new Error("useAdminStudio must be used within AdminStudioProvider.");
  }

  return context;
}
