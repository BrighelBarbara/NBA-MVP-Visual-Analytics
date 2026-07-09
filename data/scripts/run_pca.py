"""
run_pca.py
----------
Esegue la Principal Component Analysis (PCA) sul dataset finale dei
candidati MVP, per ridurre le statistiche numeriche a 2 dimensioni
(PC1, PC2) da usare come assi X/Y della scatterplot.

Perche' la PCA (per il report):
- I candidati MVP hanno ~20 statistiche numeriche correlate tra loro
  (es. PTS e USG_PCT tendono a crescere insieme).
- La PCA trova le combinazioni lineari di queste statistiche che
  spiegano la maggior varianza tra i candidati, permettendo di
  visualizzarli su un piano 2D pur mantenendo la struttura dei dati.
- Le statistiche vengono standardizzate (media 0, deviazione standard 1)
  PRIMA della PCA: senza questo passaggio, statistiche con range di valori
  piu' ampio (es. PTS che va da 10 a 35) dominerebbero rispetto a quelle
  con range piu' piccolo (es. STL che va da 0.5 a 2.5), falsando il risultato.

Uso:
    python run_pca.py
Output:
    data/processed/pca_result.json
"""

import json
from pathlib import Path

import pandas as pd
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler

PROCESSED = Path(__file__).resolve().parents[1] / "processed"
INPUT_FILE = PROCESSED / "mvp_candidates_final.csv"
OUTPUT_FILE = PROCESSED / "pca_result.json"

# Le statistiche numeriche usate come input della PCA.
# Scelte per rappresentare: produzione offensiva, difesa, efficienza,
# playmaking, utilizzo/ruolo nella squadra. Escludiamo colonne che
# sono "conseguenza" del voto MVP stesso (Share, PtsWon, First, ecc.)
# perche' altrimenti la PCA si limiterebbe a "ricostruire" il voto
# invece di descrivere il merito statistico -- punto chiave da
# giustificare nel report.
FEATURE_COLS = [
    "MIN", "PTS_stats", "REB", "AST_stats", "STL_stats", "BLK_stats", "TOV",
    "FG_PCT", "FG3_PCT", "FT_PCT", "PLUS_MINUS",
    "TS_PCT", "USG_PCT", "PIE", "OFF_RATING", "DEF_RATING", "NET_RATING",
    "PCT_PTS", "PCT_AST", "PCT_REB",
    "PTS_PAINT", "PTS_FB", "PTS_OFF_TOV",
]

# Colonne "metadata" da portare nel JSON per il tooltip/sidebar del frontend
META_COLS = ["Season", "Player", "Tm", "is_mvp_winner", "tactical_era", "Rank", "Share"]


def main():
    df = pd.read_csv(INPUT_FILE)

    X = df[FEATURE_COLS].copy()

    # 1) Standardizzazione: ogni colonna diventa media=0, std=1
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    # 2) PCA a 2 componenti
    pca = PCA(n_components=2)
    components = pca.fit_transform(X_scaled)

    df["PC1"] = components[:, 0]
    df["PC2"] = components[:, 1]

    explained = pca.explained_variance_ratio_
    print(f"Varianza spiegata da PC1: {explained[0]*100:.1f}%")
    print(f"Varianza spiegata da PC2: {explained[1]*100:.1f}%")
    print(f"Totale (PC1+PC2): {(explained[0]+explained[1])*100:.1f}%")

    # 3) Quali statistiche originali "pesano" di piu' su PC1 e PC2
    #    (utile per dare un nome/interpretazione agli assi nel report,
    #    es. "PC1 sembra rappresentare il volume offensivo complessivo")
    loadings = pd.DataFrame(
        pca.components_.T, index=FEATURE_COLS, columns=["PC1_loading", "PC2_loading"]
    )
    print("\nStatistiche piu' influenti su PC1 (valore assoluto):")
    print(loadings["PC1_loading"].abs().sort_values(ascending=False).head(5))
    print("\nStatistiche piu' influenti su PC2 (valore assoluto):")
    print(loadings["PC2_loading"].abs().sort_values(ascending=False).head(5))

    # 4) Esporta il risultato in JSON per il frontend
    out_records = df[META_COLS + ["PC1", "PC2"]].to_dict(orient="records")
    output = {
        "explained_variance": {
            "PC1": round(float(explained[0]), 4),
            "PC2": round(float(explained[1]), 4),
        },
        "loadings": {
            col: {"PC1": round(float(loadings.loc[col, "PC1_loading"]), 3),
                  "PC2": round(float(loadings.loc[col, "PC2_loading"]), 3)}
            for col in FEATURE_COLS
        },
        "points": out_records,
    }

    with open(OUTPUT_FILE, "w") as f:
        json.dump(output, f, indent=2)

    print(f"\n✅ Risultato PCA salvato in: {OUTPUT_FILE}")
    print(f"   {len(out_records)} punti pronti per la scatterplot")


if __name__ == "__main__":
    main()
