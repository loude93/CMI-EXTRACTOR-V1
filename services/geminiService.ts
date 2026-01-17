
import { GoogleGenAI, Type } from "@google/genai";
import { ExtractionResult } from "../types";

const API_KEY = process.env.API_KEY || "";

export const extractFinancialDataChunk = async (base64Pdf: string, retryCount = 0): Promise<ExtractionResult> => {
  const aiModel = "gemini-3-flash-preview";
  const ai = new GoogleGenAI({ apiKey: API_KEY });

  const systemInstruction = `
    Rôle : Expert Comptable Haute Précision.
    MISSION : EXTRAIRE CHAQUE FACTURE ET CHAQUE TRANSACTION.
    
    POUR CHAQUE FACTURE (REMISE) DÉTECTÉE, VOUS DEVEZ EXTRAIRE :
    1. DATE DE LA FACTURE (Format JJ/MM/AAAA)
    2. N° DE FACTURE
    3. TOTAL REMISE (DH)
    4. TOTAL COMMISSIONS HT
    5. TOTAL TVA SUR COMMISSIONS
    6. SOLDE NET REMISE
    
    POUR CHAQUE TRANSACTION :
    1. DATE
    2. LIBELLE
    3. DEBIT
    4. CREDIT
    
    IMPORTANT : Ne manquez aucune facture. Si une page contient un résumé de remise, extrayez impérativement la DATE et les 4 montants.
  `;

  try {
    const response = await ai.models.generateContent({
      model: aiModel,
      contents: {
        parts: [
          { inlineData: { mimeType: "application/pdf", data: base64Pdf } },
          { text: "EXTRAYEZ TOUTES LES FACTURES INDIVIDUELLEMENT AVEC LEURS DATES ET MONANTS, AINSI QUE TOUTES LES TRANSACTIONS." }
        ],
      },
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        maxOutputTokens: 65000,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            f: { 
              type: Type.ARRAY, 
              description: "Liste des factures individuelles",
              items: { 
                type: Type.OBJECT, 
                properties: { 
                  dt: { type: Type.STRING, description: "Date de la Facture" },
                  id: { type: Type.STRING, description: "N° Facture" },
                  r: { type: Type.NUMBER, description: "TOTAL REMISE (DH)" },
                  c: { type: Type.NUMBER, description: "TOTAL COMMISSIONS HT" },
                  v: { type: Type.NUMBER, description: "TOTAL TVA SUR COMMISSIONS" },
                  n: { type: Type.NUMBER, description: "SOLDE NET REMISE" }
                },
                required: ["dt", "id", "r", "c", "v", "n"]
              } 
            },
            t: { 
              type: Type.ARRAY, 
              items: { 
                type: Type.OBJECT, 
                properties: { 
                  d: { type: Type.STRING }, 
                  l: { type: Type.STRING }, 
                  db: { type: Type.NUMBER, nullable: true }, 
                  cr: { type: Type.NUMBER, nullable: true } 
                } 
              } 
            }
          },
          required: ["f", "t"]
        }
      }
    });

    const raw = JSON.parse(response.text.replace(/```json/g, "").replace(/```/g, "").trim());

    const batches = (raw.f || []).map((i: any) => ({ 
      date: i.dt || "",
      factureNumber: i.id || "", 
      totalRemiseDH: i.r || 0, 
      totalCommissionsHT: i.c || 0, 
      totalTVASurCommissions: i.v || 0, 
      soldeNetRemise: i.n || 0 
    }));

    const transactions = (raw.t || []).map((i: any) => ({ 
      date: i.d || "", 
      libelle: i.l || "", 
      debit: i.db || null, 
      credit: i.cr || null, 
      solde: null 
    }));

    return {
      batches,
      transactions,
      summary: { 
        totalRemiseDH: batches.reduce((acc: number, b: any) => acc + b.totalRemiseDH, 0),
        totalCommissionsHT: batches.reduce((acc: number, b: any) => acc + b.totalCommissionsHT, 0),
        totalTVASurCommissions: batches.reduce((acc: number, b: any) => acc + b.totalTVASurCommissions, 0),
        soldeNetRemise: batches.reduce((acc: number, b: any) => acc + b.soldeNetRemise, 0),
        soldeGlobal: 0 
      },
      currency: "DH"
    };
  } catch (error) {
    if (retryCount < 1) {
      await new Promise(r => setTimeout(r, 1000));
      return extractFinancialDataChunk(base64Pdf, retryCount + 1);
    }
    throw error;
  }
};
