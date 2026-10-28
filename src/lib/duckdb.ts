"use client";

import type { ColumnProfile, DatasetProfile } from "./types";

const MAX_FILE_SIZE = 5 * 1024 * 1024;

function displayValue(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function buildProfile(
  fileName: string,
  rows: Record<string, unknown>[],
  types: Record<string, string>,
): DatasetProfile {
  const columnNames = Object.keys(rows[0] || types);
  const columns: ColumnProfile[] = columnNames.map((name) => {
    const values = rows.map((row) => row[name]);
    const populated = values.filter((value) => value !== null && value !== undefined && value !== "");
    const samples = populated
      .map(displayValue)
      .filter(Boolean)
      .slice(0, 3);

    return {
      name,
      inferredType: types[name] || typeof populated[0] || "unknown",
      nullPercentage: rows.length
        ? Number((((rows.length - populated.length) / rows.length) * 100).toFixed(1))
        : 0,
      uniqueCount: new Set(populated.map(displayValue)).size,
      samples,
    };
  });

  return { fileName, rowCount: rows.length, columns };
}

function parseCsvFallback(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];
    if (character === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.length)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  row.push(cell);
  if (row.some((value) => value.length)) rows.push(row);

  const [headers = [], ...data] = rows;
  return data.map((values) =>
    Object.fromEntries(headers.map((header, index) => [header.trim(), values[index] ?? ""])),
  );
}

export async function profileCsv(file: File): Promise<DatasetProfile> {
  if (!file.name.toLowerCase().endsWith(".csv")) throw new Error("Please upload a CSV file.");
  if (file.size > MAX_FILE_SIZE) throw new Error("Keep demo files below 5 MB.");
  const text = await file.text();

  try {
    const duckdb = await import("@duckdb/duckdb-wasm/dist/duckdb-browser");
    const bundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles());
    if (!bundle.mainWorker || !bundle.mainModule) throw new Error("DuckDB browser bundle unavailable.");

    const workerUrl = URL.createObjectURL(
      new Blob([`importScripts("${bundle.mainWorker}");`], { type: "text/javascript" }),
    );
    const worker = new Worker(workerUrl);
    const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);
    const db = new duckdb.AsyncDuckDB(logger, worker);

    try {
      await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
      await db.registerFileText("customer.csv", text);
      const connection = await db.connect();
      try {
        const result = await connection.query(
          "SELECT * FROM read_csv_auto('customer.csv', header = true, sample_size = -1)",
        );
        const rows = result
          .toArray()
          .map((row: { toJSON(): Record<string, unknown> }) => row.toJSON());
        const types = Object.fromEntries(
          result.schema.fields.map(
            (field: { name: string; type: { toString(): string } }) => [
              field.name,
              field.type.toString(),
            ],
          ),
        );
        return buildProfile(file.name, rows, types);
      } finally {
        await connection.close();
      }
    } finally {
      await db.terminate();
      worker.terminate();
      URL.revokeObjectURL(workerUrl);
    }
  } catch (error) {
    console.warn("DuckDB-Wasm profiling failed; using the CSV fallback parser.", error);
    const rows = parseCsvFallback(text);
    if (!rows.length) throw new Error("The CSV file does not contain any data rows.");
    return buildProfile(file.name, rows, {});
  }
}
