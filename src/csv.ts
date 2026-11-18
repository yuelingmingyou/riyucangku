import type { Term } from "@/types";
import { uid } from "./store";

// CSV 字段顺序（含表头，与 Excel 兼容，导出带 BOM）
export const CSV_HEADERS = ["中文", "日文", "读音", "分类", "备注"] as const;

type Field = keyof Pick<Term, "zh" | "ja" | "kana" | "category" | "note">;

function escapeCell(v: string): string {
  if (/[",\n\r]/.test(v)) return '"' + v.replace(/"/g, '""') + '"';
  return v;
}

export function toCSV(terms: Term[]): string {
  const lines = [CSV_HEADERS.join(",")];
  for (const t of terms) {
    lines.push([t.zh, t.ja, t.kana, t.category, t.note].map(escapeCell).join(","));
  }
  return "﻿" + lines.join("\r\n");
}

// 手写 CSV 解析：支持引号包裹、内嵌逗号/换行、双引号转义
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      cell += c;
    }
  }
  row.push(cell);
  if (row.length > 1 || row[0] !== "") rows.push(row);
  return rows;
}

const HEADER_MAP: Record<string, Field> = {
  中文: "zh",
  日文: "ja",
  日语: "ja",
  读音: "kana",
  假名: "kana",
  分类: "category",
  备注: "note",
  zh: "zh",
  ja: "ja",
  kana: "kana",
  category: "category",
  note: "note",
};

export interface ImportResult {
  terms: Term[];
  skipped: number;
}

// 从 CSV 文本解析术语（自动识别表头；无表头时按默认列序）
export function termsFromCSV(text: string): ImportResult {
  const rows = parseCSV(text);
  if (rows.length === 0) return { terms: [], skipped: 0 };

  const firstRow = rows[0].map((h) => h.trim());
  const hasHeader = firstRow.some((h) => HEADER_MAP[h] !== undefined);
  let order: (Field | null)[];
  let dataRows: string[][];

  if (hasHeader) {
    order = firstRow.map((h) => HEADER_MAP[h] ?? null);
    dataRows = rows.slice(1);
  } else {
    order = ["zh", "ja", "kana", "category", "note"];
    dataRows = rows;
  }

  const terms: Term[] = [];
  let skipped = 0;
  const now = Date.now();
  for (const r of dataRows) {
    const rec: Record<Field, string> = { zh: "", ja: "", kana: "", category: "", note: "" };
    order.forEach((key, i) => {
      if (key && r[i] !== undefined) rec[key] = r[i].trim();
    });
    if (!rec.zh && !rec.ja) {
      skipped++;
      continue;
    }
    terms.push({
      id: uid(),
      zh: rec.zh,
      ja: rec.ja,
      kana: rec.kana,
      category: rec.category || "未分类",
      note: rec.note,
      createdAt: now,
      updatedAt: now,
    });
  }
  return { terms, skipped };
}

// JSON 备份解析（宽容：接受数组或 {terms, categories}，键名支持中文）
export function termsFromJSON(text: string): { terms: Term[]; categories: string[] } | null {
  try {
    const data = JSON.parse(text);
    const arr: unknown[] = Array.isArray(data) ? data : Array.isArray(data?.terms) ? data.terms : [];
    const categories: string[] = Array.isArray(data?.categories)
      ? data.categories.filter((c: unknown) => typeof c === "string")
      : [];
    const now = Date.now();
    const terms: Term[] = [];
    for (const item of arr) {
      if (typeof item !== "object" || item === null) continue;
      const o = item as Record<string, unknown>;
      const zh = String(o.zh ?? o["中文"] ?? "").trim();
      const ja = String(o.ja ?? o["日文"] ?? "").trim();
      if (!zh && !ja) continue;
      terms.push({
        id: uid(),
        zh,
        ja,
        kana: String(o.kana ?? o["读音"] ?? o["假名"] ?? ""),
        category: String(o.category ?? o["分类"] ?? "未分类"),
        note: String(o.note ?? o["备注"] ?? ""),
        createdAt: now,
        updatedAt: now,
      });
    }
    return { terms, categories };
  } catch {
    return null;
  }
}

export function downloadFile(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function todayStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}
