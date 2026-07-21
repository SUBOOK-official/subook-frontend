function getCellType(value) {
  if (value instanceof Date) {
    return Date;
  }

  if (typeof value === "number") {
    return Number;
  }

  if (typeof value === "boolean") {
    return Boolean;
  }

  return String;
}

function normalizeExportValue(value, type) {
  if (value === null || value === undefined) {
    return null;
  }

  if (type === Number) {
    if (value === "") {
      return null;
    }

    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
  }

  if (type === Boolean) {
    return Boolean(value);
  }

  if (type === Date) {
    return value instanceof Date && !Number.isNaN(value.getTime()) ? value : null;
  }

  if (value instanceof Date) {
    return value;
  }

  return String(value);
}

function toExportCell(value, column) {
  const type = column.type ?? getCellType(value);
  const normalizedValue = normalizeExportValue(value, type);

  if (normalizedValue === null) {
    return null;
  }

  return {
    value: normalizedValue,
    type,
    ...(column.wrap ? { wrap: true } : {}),
  };
}

function getColumnValue(row, column) {
  if (typeof column.value === "function") {
    return column.value(row);
  }

  return row[column.key];
}

export async function exportRowsToXlsx({ rows, columns, fileName, sheetName }) {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const headerRow = columns.map((column) => ({
    value: column.header ?? column.key,
    type: String,
    fontWeight: "bold",
    backgroundColor: "#f2f2f3",
  }));
  const dataRows = rows.map((row) =>
    columns.map((column) => toExportCell(getColumnValue(row, column), column)),
  );

  await writeXlsxFile([headerRow, ...dataRows], {
    columns: columns.map((column) => ({ width: column.width })),
    fileName,
    sheet: sheetName,
    stickyRowsCount: 1,
  });
}

function normalizeHeader(value, index, seenHeaders) {
  const baseHeader = String(value ?? "").trim() || `Column${index + 1}`;
  const seenCount = seenHeaders.get(baseHeader) ?? 0;
  seenHeaders.set(baseHeader, seenCount + 1);

  return seenCount === 0 ? baseHeader : `${baseHeader}_${seenCount + 1}`;
}

function normalizeImportValue(value) {
  return value === null || value === undefined ? "" : value;
}

const WORKSHEET_XML_PATTERN = /^xl\/worksheets\/[^/]+\.xml$/i;

// 일부 도구(구글 시트, LibreOffice, 각종 서버 사이드 xlsx 생성기)는 서식만 입혀진
// 빈 셀을 `t="inlineStr"`로 저장하면서 정작 `<is><t>` 본문은 비워 둔다. read-excel-file 은
// 이런 셀을 빈 칸으로 넘기지 않고 예외를 던지므로
// (`Unsupported "inline string" cell value structure`), 파싱 전에 문제 셀의 inlineStr
// 타입만 벗겨서 일반 빈 셀로 바꾼다. 값이 들어 있는 정상 inline 문자열은 건드리지 않는다.
function stripEmptyInlineStrings(sheetXml) {
  // 자기 종료 셀(<c ... t="inlineStr" .../>)은 본문이 없으므로 항상 빈 셀이다.
  let result = sheetXml.replace(/<c\b([^>]*?)\s+t="inlineStr"([^>]*?)\/>/g, "<c$1$2/>");

  // 짝이 있는 셀(<c ...>...</c>)은 내부에 <t> 텍스트 노드가 없을 때만 빈 셀로 간주한다.
  result = result.replace(
    /<c\b([^>]*?)\s+t="inlineStr"([^>]*?)>([\s\S]*?)<\/c>/g,
    (match, beforeType, afterType, body) =>
      /<t[\s/>]/.test(body) ? match : `<c${beforeType}${afterType}>${body}</c>`,
  );

  return result;
}

// xlsx(zip)를 풀어 워크시트 XML의 빈 inlineStr 셀만 정리한 뒤 다시 압축해 돌려준다.
// 문제 셀이 없거나 zip 이 아니면 원본 파일을 그대로 반환한다.
async function sanitizeXlsxInlineStrings(file) {
  const { unzipSync, zipSync, strToU8, strFromU8 } = await import("fflate");

  let entries;
  try {
    entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
  } catch {
    // zip 이 아니거나 손상된 파일 → 원본을 넘겨 read-excel-file 이 자기 에러를 내게 둔다.
    return file;
  }

  let changed = false;
  for (const name of Object.keys(entries)) {
    if (!WORKSHEET_XML_PATTERN.test(name)) {
      continue;
    }

    const original = strFromU8(entries[name]);
    const sanitized = stripEmptyInlineStrings(original);
    if (sanitized !== original) {
      entries[name] = strToU8(sanitized);
      changed = true;
    }
  }

  if (!changed) {
    return file;
  }

  const repacked = zipSync(entries);
  const fileName = typeof file.name === "string" && file.name ? file.name : "upload.xlsx";
  return new File([repacked], fileName, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export async function readSheetRowsAsObjects(file) {
  const { readSheet } = await import("read-excel-file/browser");
  const safeFile = await sanitizeXlsxInlineStrings(file);
  const sheetRows = await readSheet(safeFile);

  if (!Array.isArray(sheetRows) || sheetRows.length === 0) {
    return [];
  }

  const seenHeaders = new Map();
  const headers = sheetRows[0].map((value, index) => normalizeHeader(value, index, seenHeaders));

  return sheetRows.slice(1).map((row) => {
    const objectRow = {};

    headers.forEach((header, index) => {
      objectRow[header] = normalizeImportValue(row[index]);
    });

    return objectRow;
  });
}
