import * as pdfjsLib from "https://esm.sh/pdfjs-dist@4.10.38/legacy/build/pdf.mjs";
import { ExtractionResult, BatchSummary, Transaction } from "../types";

(pdfjsLib as any).GlobalWorkerOptions.workerSrc = "https://esm.sh/pdfjs-dist@4.10.38/legacy/build/pdf.worker.min.mjs";

const parseNumber = (value: string | undefined): number => {
  if (!value) return 0;
  const normalized = value.replace(/\s/g, "").replace(/\./g, "").replace(/,/g, ".");
  const result = Number.parseFloat(normalized);
  return Number.isFinite(result) ? result : 0;
};

const normalizeDate = (value: string): string => value.replace(/-/g, "/");

const extractLines = async (base64Pdf: string): Promise<string[]> => {
  const binary = atob(base64Pdf);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  const pdf = await (pdfjsLib as any).getDocument({ data: bytes }).promise;
  const lines: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const pageItems = content.items as Array<{ str?: string }>;

    let currentLine = "";
    for (const item of pageItems) {
      const token = (item.str || "").trim();
      if (!token) continue;

      if (currentLine.length > 0) {
        currentLine += ` ${token}`;
      } else {
        currentLine = token;
      }

      if (/\d{2}[/-]\d{2}[/-]\d{4}/.test(token) || token.endsWith(":")) {
        lines.push(currentLine);
        currentLine = "";
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }
  }

  return lines.map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
};

const parseInvoices = (lines: string[]): BatchSummary[] => {
  const invoices: BatchSummary[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/facture|remise/i.test(line)) continue;

    const dateMatch = line.match(/\b\d{2}[/-]\d{2}[/-]\d{4}\b/);
    const invoiceIdMatch = line.match(/(?:facture|n[°o]?\s*facture)\s*[:#-]?\s*([A-Z0-9\-/]+)/i);

    let totalRemiseDH = 0;
    let totalCommissionsHT = 0;
    let totalTVASurCommissions = 0;
    let soldeNetRemise = 0;

    for (let j = i; j < Math.min(i + 8, lines.length); j++) {
      const scope = lines[j];
      const amountMatch = scope.match(/(-?[\d\s.,]+)$/);
      const amount = parseNumber(amountMatch?.[1]);

      if (/total\s*remise/i.test(scope)) totalRemiseDH = amount;
      if (/commission/i.test(scope) && /ht/i.test(scope)) totalCommissionsHT = amount;
      if (/tva/i.test(scope)) totalTVASurCommissions = amount;
      if (/solde\s*net/i.test(scope)) soldeNetRemise = amount;
    }

    if (totalRemiseDH || totalCommissionsHT || totalTVASurCommissions || soldeNetRemise) {
      invoices.push({
        date: dateMatch ? normalizeDate(dateMatch[0]) : "",
        factureNumber: invoiceIdMatch?.[1] || "",
        totalRemiseDH,
        totalCommissionsHT,
        totalTVASurCommissions,
        soldeNetRemise,
      });
    }
  }

  return invoices;
};

const parseTransactions = (lines: string[]): Transaction[] => {
  const transactions: Transaction[] = [];

  for (const line of lines) {
    const txMatch = line.match(
      /^(\d{2}[/-]\d{2}[/-]\d{4})\s+(.+?)\s+(-?[\d\s.,]+)?\s+(-?[\d\s.,]+)?$/,
    );

    if (!txMatch) continue;

    const [, date, libelle, debitRaw, creditRaw] = txMatch;
    const debit = debitRaw ? parseNumber(debitRaw) : null;
    const credit = creditRaw ? parseNumber(creditRaw) : null;

    if (!libelle || (!debit && !credit)) continue;

    transactions.push({
      date: normalizeDate(date),
      libelle,
      debit,
      credit,
      solde: null,
    });
  }

  return transactions;
};

export const extractFinancialDataChunk = async (base64Pdf: string): Promise<ExtractionResult> => {
  const lines = await extractLines(base64Pdf);

  const batches = parseInvoices(lines);
  const transactions = parseTransactions(lines);

  return {
    batches,
    transactions,
    summary: {
      totalRemiseDH: batches.reduce((acc, b) => acc + b.totalRemiseDH, 0),
      totalCommissionsHT: batches.reduce((acc, b) => acc + b.totalCommissionsHT, 0),
      totalTVASurCommissions: batches.reduce((acc, b) => acc + b.totalTVASurCommissions, 0),
      soldeNetRemise: batches.reduce((acc, b) => acc + b.soldeNetRemise, 0),
      soldeGlobal: 0,
    },
    currency: "DH",
  };
};
