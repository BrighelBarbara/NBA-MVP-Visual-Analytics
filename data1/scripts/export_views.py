"""
export_views.py
----------------
Esporta da mvp_candidates_final.csv i JSON necessari alle altre viste
D3 della dashboard (oltre alla scatterplot PCA, gia' gestita da run_pca.py).

Nota: BPM e VORP non sono presenti in nessuna delle fonti dati usate
(ne' in nba_stats_repo ne' in mvp_voting.csv). Gli assi del Parallel
Coordinates li sostituiscono con le metriche avanzate realmente
disponibili: PIE al posto di BPM, NET_RATING al posto di VORP (in
aggiunta a WS, gia' presente). Le colonne del voto MVP (Rank, Share,
PtsWon, PtsMax, First) sono escluse di proposito da queste esportazioni,
per lo stesso motivo per cui sono escluse dalla PCA in run_pca.py: non
devono influenzare le viste che valutano il merito statistico.

Uso:
    python export_views.py
Output:
    data/processed/parallel_coords.json
    data/processed/line_chart.json
"""

import json
from pathlib import Path

import pandas as pd

PROCESSED = Path(__file__).resolve().parents[1] / "processed"
INPUT_FILE = PROCESSED / "mvp_candidates_final.csv"
PARALLEL_COORDS_FILE = PROCESSED / "parallel_coords.json"
LINE_CHART_FILE = PROCESSED / "line_chart.json"

# Le colonne del dataset finale usano nomi diversi da quelli "leggibili"
# richiesti dal frontend (per via dei suffissi _mvp/_stats aggiunti nel
# merge di build_dataset.py). Mappiamo qui i nomi puliti.
STAT_COLS = {
    "PTS": "PTS",
    "REB": "REB",
    "AST": "AST",
    "TS_PCT": "TS_PCT",
    "PIE": "PIE",
    "WS": "WS",
    "NET_RATING": "NET_RATING",
    "W_PCT": "W_PCT",
}


def season_start_year(season: str) -> int:
    """'1996-97' -> 1996, per ordinare cronologicamente l'asse X del line chart."""
    return int(season.split("-")[0])


def load_clean(df: pd.DataFrame) -> pd.DataFrame:
    out = pd.DataFrame({
        "player": df["Player"],
        "season": df["Season"],
        "season_year": df["Season"].apply(season_start_year),
        "era": df["tactical_era"],
        "is_mvp_winner": df["is_mvp_winner"],
    })
    for clean_name, source_col in STAT_COLS.items():
        out[clean_name] = df[source_col]
    return out


def export_parallel_coords(df: pd.DataFrame):
    """Un record per candidato-stagione, con solo le metriche di merito statistico."""
    records = df.sort_values(["season_year", "player"]).to_dict(orient="records")
    with open(PARALLEL_COORDS_FILE, "w") as f:
        json.dump(records, f, indent=2)
    print(f"✅ Parallel Coordinates: {len(records)} record salvati in {PARALLEL_COORDS_FILE}")


def export_line_chart(df: pd.DataFrame):
    """Formato 'long': una riga per (player, season), ordinato per player
    e poi per stagione, cosi' il frontend puo' disegnare una linea per
    giocatore lungo l'asse temporale (season_year)."""
    records = df.sort_values(["player", "season_year"]).to_dict(orient="records")
    with open(LINE_CHART_FILE, "w") as f:
        json.dump(records, f, indent=2)
    n_players = df["player"].nunique()
    print(f"✅ Line Chart: {len(records)} record ({n_players} giocatori) salvati in {LINE_CHART_FILE}")


def main():
    df = pd.read_csv(INPUT_FILE)
    clean = load_clean(df)
    export_parallel_coords(clean)
    export_line_chart(clean)


if __name__ == "__main__":
    main()
