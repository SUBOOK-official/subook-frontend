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
    backgroundColor: "#f1f5f9",
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

export async function readSheetRowsAsObjects(file) {
  const { readSheet } = await import("read-excel-file/browser");
  const sheetRows = await readSheet(file);

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
