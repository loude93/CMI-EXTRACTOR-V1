
export interface Transaction {
  date: string;
  libelle: string;
  debit: number | null;
  credit: number | null;
  solde: number | null;
}

export interface BatchSummary {
  date: string;
  factureNumber: string;
  totalRemiseDH: number;
  totalCommissionsHT: number;
  totalTVASurCommissions: number;
  soldeNetRemise: number;
}

export interface Summary {
  totalRemiseDH: number;
  totalCommissionsHT: number;
  totalTVASurCommissions: number;
  soldeNetRemise: number;
  soldeGlobal: number;
}

export interface ExtractionResult {
  batches: BatchSummary[];
  transactions: Transaction[];
  summary: Summary;
  currency: string;
}

export interface AppState {
  isProcessing: boolean;
  progress: {
    current: number;
    total: number;
  } | null;
  result: ExtractionResult | null;
  error: string | null;
  fileName: string | null;
}
