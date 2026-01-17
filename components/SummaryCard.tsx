
import React from 'react';

interface SummaryCardProps {
  title: string;
  value: number;
  icon: string;
  color: string;
  currency?: string;
  subValues?: number[];
}

const SummaryCard: React.FC<SummaryCardProps> = ({ title, value, icon, color, currency = "DH", subValues }) => {
  return (
    <div className="bg-white p-7 rounded-[2rem] shadow-lg shadow-slate-100 border border-slate-100 flex flex-col h-full hover:border-indigo-200 transition-all group">
      <div className="flex items-start justify-between mb-4">
        <div className={`w-14 h-14 rounded-2xl ${color} bg-opacity-10 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform`}>
          <i className={`${icon} ${color.replace('bg-', 'text-')}`}></i>
        </div>
      </div>
      
      <div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">{title}</p>
        <h3 className="text-3xl font-black text-slate-900 tracking-tighter">
          {(value ?? 0).toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          <span className="text-xs ml-2 text-slate-400 font-bold uppercase">{currency}</span>
        </h3>
      </div>
      
      {subValues && subValues.length > 0 && (
        <div className="mt-6 pt-5 border-t border-slate-50 space-y-2">
          <p className="text-[9px] uppercase font-black text-slate-400 tracking-widest">Détails par lot</p>
          <div className="max-h-24 overflow-y-auto pr-2 custom-scrollbar">
            {subValues.map((val, i) => (
              <div key={i} className="flex justify-between text-[11px] text-slate-500 py-1 border-b border-slate-50 last:border-0">
                <span className="font-medium">Lot #{i + 1}</span>
                <span className="font-bold text-slate-700">{(val ?? 0).toLocaleString('fr-MA', { minimumFractionDigits: 2 })} {currency}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SummaryCard;
