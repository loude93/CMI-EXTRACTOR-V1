
import React, { useState, useEffect, useRef } from 'react';
import { AppState, ExtractionResult, Transaction, BatchSummary } from './types';
import { extractFinancialDataChunk } from './services/geminiService';
import SummaryCard from './components/SummaryCard';
import TransactionTable from './components/TransactionTable';
import * as XLSX from 'https://esm.sh/xlsx';

declare const PDFLib: any;

type ProcessingProfile = {
  chunkSize: number;
  concurrency: number;
};

const getProcessingProfile = (pageCount: number): ProcessingProfile => {
  if (pageCount > 500) {
    return { chunkSize: 10, concurrency: 2 };
  }

  if (pageCount > 250) {
    return { chunkSize: 15, concurrency: 3 };
  }

  return { chunkSize: 25, concurrency: 6 };
};

const App: React.FC = () => {
  const [state, setState] = useState<AppState>(() => {
    // Load from local storage for "Local PC" feel
    const saved = localStorage.getItem('cmi_extrator_state');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return { ...parsed, isProcessing: false, progress: null };
      } catch (e) {
        console.error("Failed to load saved state", e);
      }
    }
    return { 
      isProcessing: false, 
      progress: null,
      result: null, 
      error: null, 
      fileName: null 
    };
  });

  const [log, setLog] = useState<string[]>([]);
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerRef = useRef<number | null>(null);

  // Save to local storage whenever result changes
  useEffect(() => {
    if (state.result) {
      localStorage.setItem('cmi_extrator_state', JSON.stringify({
        result: state.result,
        fileName: state.fileName
      }));
    }
  }, [state.result, state.fileName]);

  useEffect(() => {
    if (state.isProcessing) {
      timerRef.current = window.setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [state.isProcessing]);

  const addLog = (msg: string) => setLog(prev => [msg, ...prev].slice(0, 5));

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleReset = () => {
    if (window.confirm("Voulez-vous vraiment effacer les données actuelles et commencer un nouveau projet ?")) {
      localStorage.removeItem('cmi_extrator_state');
      setState({
        isProcessing: false,
        progress: null,
        result: null,
        error: null,
        fileName: null
      });
      setLog([]);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const processFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || file.type !== 'application/pdf') return;

    setElapsedTime(0);
    setState({ isProcessing: true, progress: { current: 0, total: 0 }, error: null, fileName: file.name, result: null });
    setLog(["Initialisation du moteur CMI EXTRATOR..."]);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer);
      const pageCount = pdfDoc.getPageCount();

      const { chunkSize, concurrency } = getProcessingProfile(pageCount);
      const totalChunks = Math.ceil(pageCount / chunkSize);
      
      setState(s => ({ ...s, progress: { current: 0, total: totalChunks } }));
      addLog(`Moteur Turbo prêt pour ${pageCount} pages.`);

      if (pageCount > 500) {
        addLog(`Mode grand volume activé (${chunkSize} pages/chunk, concurrence ${concurrency}).`);
      }

      let allTransactions: Transaction[] = [];
      let allBatches: BatchSummary[] = [];
      
      let completedChunks = 0;

      for (let i = 0; i < totalChunks; i += concurrency) {
        const batchPromises = [];
        for (let j = 0; j < concurrency && (i + j) < totalChunks; j++) {
          const chunkIdx = i + j;
          const start = chunkIdx * chunkSize;
          const end = Math.min(start + chunkSize, pageCount);
          
          const task = (async () => {
            const newPdf = await PDFLib.PDFDocument.create();
            const pagesToCopy = Array.from({ length: end - start }, (_, idx) => start + idx);
            const copiedPages = await newPdf.copyPages(pdfDoc, pagesToCopy);
            copiedPages.forEach((p: any) => newPdf.addPage(p));
            const base64 = await newPdf.saveAsBase64();
            const res = await extractFinancialDataChunk(base64);
            completedChunks++;
            setState(s => ({ ...s, progress: { current: completedChunks, total: totalChunks } }));
            return res;
          })();
          batchPromises.push(task);
        }

        const batchResults = await Promise.all(batchPromises);
        batchResults.forEach(res => {
          allTransactions = [...allTransactions, ...res.transactions];
          allBatches = [...allBatches, ...res.batches];
        });

        await new Promise(resolve => setTimeout(resolve, 50));
      }

      const mergedResult: ExtractionResult = {
        batches: allBatches,
        transactions: allTransactions,
        summary: {
          totalRemiseDH: allBatches.reduce((a, b) => a + b.totalRemiseDH, 0),
          totalCommissionsHT: allBatches.reduce((a, b) => a + b.totalCommissionsHT, 0),
          totalTVASurCommissions: allBatches.reduce((a, b) => a + b.totalTVASurCommissions, 0),
          soldeNetRemise: allBatches.reduce((a, b) => a + b.soldeNetRemise, 0),
          soldeGlobal: 0
        },
        currency: "DH"
      };

      setState(prev => ({ ...prev, result: mergedResult, isProcessing: false, progress: null }));
    } catch (err: any) {
      setState(prev => ({ ...prev, error: "Erreur lors de l'extraction locale du PDF. Vérifiez que le fichier contient du texte exploitable.", isProcessing: false, progress: null }));
    }
  };

  const exportToExcel = () => {
    if (!state.result) return;
    const wb = XLSX.utils.book_new();
    
    const wsInvoices = XLSX.utils.json_to_sheet(state.result.batches.map(b => ({
      "DATE": b.date,
      "N° FACTURE": b.factureNumber,
      "TOTAL REMISE (DH)": b.totalRemiseDH,
      "TOTAL COMMISSIONS HT": b.totalCommissionsHT,
      "TOTAL TVA SUR COMMISSIONS": b.totalTVASurCommissions,
      "SOLDE NET REMISE": b.soldeNetRemise
    })));
    XLSX.utils.book_append_sheet(wb, wsInvoices, "LISTE_DES_FACTURES");
    
    const wsTx = XLSX.utils.json_to_sheet(state.result.transactions.map(t => ({
      "DATE": t.date,
      "LIBELLE": t.libelle,
      "DEBIT": t.debit,
      "CREDIT": t.credit
    })));
    XLSX.utils.book_append_sheet(wb, wsTx, "TOUTES_TRANSACTIONS");
    
    XLSX.writeFile(wb, `CMI_Extraction_${state.fileName?.replace('.pdf', '')}.xlsx`);
  };

  const { isProcessing, progress, result, error, fileName } = state;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-24 font-sans selection:bg-indigo-500 selection:text-white">
      <header className="bg-slate-950/90 backdrop-blur-xl border-b border-white/5 h-20 sticky top-0 z-40 flex items-center px-8 justify-between no-print">
        <div className="flex items-center space-x-4">
          <div className="bg-indigo-600 w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-lg">
            <i className="fa-solid fa-bolt text-lg"></i>
          </div>
          <div>
            <h1 className="text-xl font-black uppercase tracking-tighter">CMI <span className="text-indigo-500">EXTRATOR</span></h1>
            <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest -mt-1">BY MAISSINE MOHAMMED</p>
          </div>
        </div>
        {result && (
          <div className="flex items-center space-x-3">
             <button onClick={handleReset} className="bg-white/5 border border-white/10 text-slate-400 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-rose-500/10 hover:text-rose-400 hover:border-rose-500/20 transition-all flex items-center space-x-2">
               <i className="fa-solid fa-rotate-left"></i>
               <span>NOUVEAU</span>
             </button>
             <button onClick={handlePrint} className="bg-white/5 border border-white/10 text-slate-300 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all flex items-center space-x-2">
               <i className="fa-solid fa-print"></i>
               <span>IMPRIMER</span>
             </button>
             <button onClick={exportToExcel} className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-500 shadow-lg shadow-indigo-500/20 transition-all flex items-center space-x-2">
               <i className="fa-solid fa-file-excel"></i>
               <span>EXPORTER EXCEL</span>
             </button>
          </div>
        )}
      </header>

      <main className="max-w-7xl mx-auto px-8 pt-12">
        <div className="hidden print-only mb-12 border-b-4 border-black pb-6">
           <h1 className="text-4xl font-black">CMI EXTRATOR - RAPPORT D'AUDIT</h1>
           <p className="text-xl font-bold mt-2">Document : {fileName}</p>
           <p className="text-sm text-slate-500 uppercase font-black tracking-widest mt-1">Par Maissine Mohammed</p>
        </div>

        {!result && (
          <div className="max-w-3xl mx-auto space-y-8 no-print">
            <label className={`group block p-20 border-2 border-dashed rounded-[4rem] text-center cursor-pointer transition-all ${isProcessing ? 'bg-white/5 border-indigo-500/50' : 'bg-white/[0.02] border-white/10 hover:border-indigo-500 hover:bg-white/[0.05]'}`}>
              <input type="file" className="hidden" accept=".pdf" onChange={processFile} disabled={isProcessing} />
              <div className={`w-28 h-28 rounded-[3rem] mx-auto mb-10 flex items-center justify-center text-6xl transition-all duration-500 ${isProcessing ? 'bg-indigo-500 text-white animate-pulse shadow-[0_0_50px_rgba(79,70,229,0.3)]' : 'bg-white/5 text-slate-500'}`}>
                <i className={`fa-solid ${isProcessing ? 'fa-microchip animate-spin' : 'fa-cloud-arrow-up'}`}></i>
              </div>
              <h2 className="text-4xl font-black text-white uppercase tracking-tight">{fileName || "Charger un PDF"}</h2>
              <p className="text-sm text-slate-500 mt-4 font-bold uppercase tracking-[0.2em]">VERSION LOCALE PRO - MAISSINE MOHAMMED</p>
              
              {isProcessing && progress && (
                <div className="mt-16 max-w-md mx-auto space-y-6">
                   <div className="flex justify-between items-end">
                      <p className="text-indigo-400 text-[10px] font-black uppercase tracking-widest">Analyse IA en cours</p>
                      <p className="text-2xl font-black text-white">{Math.round((progress.current / progress.total) * 100)}%</p>
                   </div>
                   <div className="w-full h-3 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500 shadow-[0_0_20px_rgba(79,70,229,0.5)] transition-all duration-700" style={{ width: `${(progress.current / progress.total) * 100}%` }}></div>
                   </div>
                   <div className="bg-black/40 rounded-3xl p-6 text-left border border-white/5 text-[10px] font-mono text-slate-400">
                      {log.map((l, i) => <div key={i}>{`> ${l}`}</div>)}
                   </div>
                </div>
              )}
            </label>
            <div className="grid grid-cols-2 gap-4 text-center opacity-40 grayscale group-hover:grayscale-0 transition-all duration-1000">
               <div className="p-6 border border-white/5 rounded-3xl"><i className="fa-solid fa-shield-halved text-2xl mb-2"></i><p className="text-[10px] font-black uppercase tracking-widest">Traitement Sécurisé</p></div>
               <div className="p-6 border border-white/5 rounded-3xl"><i className="fa-solid fa-database text-2xl mb-2"></i><p className="text-[10px] font-black uppercase tracking-widest">Auto-Sauvegarde</p></div>
            </div>
          </div>
        )}

        {error && (
          <div className="max-w-2xl mx-auto mb-12 bg-rose-500/10 border border-rose-500/20 p-8 rounded-[2.5rem] text-rose-400 flex items-center space-x-6 uppercase font-black text-xs no-print">
             <i className="fa-solid fa-circle-exclamation text-4xl"></i>
             <span>{error}</span>
          </div>
        )}

        {result && (
          <div className="space-y-16 animate-in fade-in duration-700">
            {/* GLOBAL TOTALS */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <SummaryCard title="CUMUL REMISES" value={result.summary.totalRemiseDH} icon="fa-solid fa-sack-dollar" color="bg-indigo-600" />
              <SummaryCard title="CUMUL COMMISSIONS" value={result.summary.totalCommissionsHT} icon="fa-solid fa-percent" color="bg-rose-500" />
              <SummaryCard title="CUMUL TVA" value={result.summary.totalTVASurCommissions} icon="fa-solid fa-receipt" color="bg-amber-500" />
              <SummaryCard title="TOTAL NET" value={result.summary.soldeNetRemise} icon="fa-solid fa-vault" color="bg-emerald-600" />
            </div>

            {/* LIST PER FACTURE */}
            <section className="bg-slate-900 rounded-[3.5rem] p-1 border border-white/5 shadow-2xl">
              <div className="p-10 border-b border-white/5 flex justify-between items-center">
                <div>
                  <h3 className="text-2xl font-black uppercase text-white tracking-tighter">LISTE DÉTAILLÉE PAR FACTURE</h3>
                  <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.3em] mt-1">Données persistantes sur ce navigateur</p>
                </div>
                <div className="hidden print-only text-right">
                   <p className="text-[10px] font-black uppercase">Audit CMI Extrator</p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-950">
                    <tr>
                      <th className="px-10 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">DATE</th>
                      <th className="px-10 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">N° FACTURE</th>
                      <th className="px-10 py-5 text-[10px] font-black text-indigo-400 uppercase tracking-widest text-right">TOTAL REMISE (DH)</th>
                      <th className="px-10 py-5 text-[10px] font-black text-rose-400 uppercase tracking-widest text-right">COMMISSIONS HT</th>
                      <th className="px-10 py-5 text-[10px] font-black text-amber-400 uppercase tracking-widest text-right">TVA / COMM</th>
                      <th className="px-10 py-5 text-[10px] font-black text-emerald-400 uppercase tracking-widest text-right">SOLDE NET</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.03]">
                    {result.batches.map((b, idx) => (
                      <tr key={idx} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-10 py-5 text-xs font-mono font-bold text-slate-400">{b.date || "---"}</td>
                        <td className="px-10 py-5 text-xs font-black text-white">{b.factureNumber || "N/A"}</td>
                        <td className="px-10 py-5 text-xs font-black text-right">{b.totalRemiseDH.toLocaleString('fr-MA', { minimumFractionDigits: 2 })}</td>
                        <td className="px-10 py-5 text-xs font-black text-right text-rose-500">{b.totalCommissionsHT.toLocaleString('fr-MA', { minimumFractionDigits: 2 })}</td>
                        <td className="px-10 py-5 text-xs font-black text-right text-amber-500">{b.totalTVASurCommissions.toLocaleString('fr-MA', { minimumFractionDigits: 2 })}</td>
                        <td className="px-10 py-5 text-xs font-black text-right text-emerald-500">{b.soldeNetRemise.toLocaleString('fr-MA', { minimumFractionDigits: 2 })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* ALL TRANSACTIONS */}
            <section className="bg-slate-900 rounded-[3.5rem] p-1 border border-white/5 shadow-2xl overflow-hidden no-print">
              <div className="p-10 border-b border-white/5">
                <h3 className="text-2xl font-black uppercase text-white tracking-tighter">DÉTAILS DES TRANSACTIONS</h3>
                <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.3em] mt-1">Exportez vers Excel pour un audit transactionnel complet</p>
              </div>
              <TransactionTable transactions={result.transactions} />
            </section>
          </div>
        )}
      </main>
      <footer className="mt-20 border-t border-white/5 py-10 text-center no-print">
         <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.5em]">CMI EXTRATOR — MADE WITH PRECISION BY MAISSINE MOHAMMED</p>
         <div className="mt-4 flex justify-center space-x-6 grayscale opacity-30">
            <i className="fa-brands fa-windows text-xl"></i>
            <i className="fa-brands fa-apple text-xl"></i>
            <i className="fa-brands fa-chrome text-xl"></i>
         </div>
      </footer>
    </div>
  );
};

export default App;
