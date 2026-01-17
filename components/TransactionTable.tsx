
import React, { useState } from 'react';
import { Transaction } from '../types';

interface TransactionTableProps {
  transactions: Transaction[];
}

const TransactionTable: React.FC<TransactionTableProps> = ({ transactions }) => {
  const [searchTerm, setSearchTerm] = useState('');
  
  // Filter only if needed to save performance on 10k+ rows
  const filtered = searchTerm.length > 2 
    ? transactions.filter(tx => tx.libelle?.toLowerCase().includes(searchTerm.toLowerCase()) || tx.date?.includes(searchTerm))
    : transactions;

  if (transactions.length === 0) return <div className="p-20 text-center text-slate-500 uppercase font-black text-xs tracking-widest">Aucune donnée à afficher.</div>;

  return (
    <div className="flex flex-col h-[700px]">
      <div className="p-6 border-b border-white/5 bg-slate-800/50 backdrop-blur-md">
        <div className="relative max-w-md">
           <i className="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"></i>
           <input 
             type="text" 
             placeholder="Rechercher une transaction (Date ou Libellé)..." 
             value={searchTerm} 
             onChange={(e) => setSearchTerm(e.target.value)} 
             className="w-full bg-slate-900 border border-white/10 rounded-2xl py-3 pl-12 pr-4 text-xs font-medium text-white focus:ring-2 focus:ring-indigo-500 transition-all outline-none" 
           />
        </div>
      </div>
      <div className="flex-1 overflow-auto custom-scrollbar">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 z-10 bg-slate-900 shadow-xl">
            <tr>
              <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-white/10">DATE</th>
              <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-white/10">LIBELLE</th>
              <th className="px-8 py-4 text-[10px] font-black text-rose-400 uppercase tracking-widest text-right border-b border-white/10">DEBIT (DH)</th>
              <th className="px-8 py-4 text-[10px] font-black text-emerald-400 uppercase tracking-widest text-right border-b border-white/10">CREDIT (DH)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.03]">
            {filtered.map((tx, idx) => (
              <tr key={idx} className="hover:bg-white/[0.02] transition-colors group">
                <td className="px-8 py-4 text-[11px] text-slate-400 font-mono font-bold">{tx.date || '---'}</td>
                <td className="px-8 py-4 text-xs text-white font-bold uppercase tracking-tight group-hover:text-indigo-400 transition-colors">{tx.libelle || '---'}</td>
                <td className="px-8 py-4 text-xs text-right text-rose-500 font-black">{tx.debit ? tx.debit.toLocaleString('fr-MA', { minimumFractionDigits: 2 }) : '-'}</td>
                <td className="px-8 py-4 text-xs text-right text-emerald-500 font-black">{tx.credit ? tx.credit.toLocaleString('fr-MA', { minimumFractionDigits: 2 }) : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="p-4 bg-slate-900/50 border-t border-white/5 text-[9px] font-black uppercase text-slate-500 flex justify-between">
        <span>Affichage de {filtered.length} transactions</span>
        <span>Précision Industrielle Gemini AI</span>
      </div>
    </div>
  );
};

export default TransactionTable;
