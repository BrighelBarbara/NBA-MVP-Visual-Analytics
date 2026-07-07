"""
build_dataset.py
-----------------
Unisce:
  1) Le statistiche giocatori dal repo GitHub (Brescou/NBA-dataset-stats-player-team)
  2) I voti MVP raccolti da Basketball-Reference (data/raw/mvp_voting.csv)

Applica i filtri della proposal (MIN >= 20, GP >= 41), aggiunge la colonna
dell'era tattica e verifica l'AS Index (#righe * #colonne, atteso 10.000-50.000).

Uso:
    python build_dataset.py
Output:
    data/processed/mvp_candidates_final.csv
"""

import pandas as pd
from unidecode import unidecode
from pathlib import Path

RAW = Path(__file__).resolve().parents[1] / "raw"
STATS_REPO = RAW / "nba_stats_repo" / "player"
OUT_DIR = Path(__file__).resolve().parents[1] / "processed"
OUT_DIR.mkdir(parents=True, exist_ok=True)


def norm_name(name: str) -> str:
    """Normalizza i nomi giocatore per il join (rimuove accenti, spazi doppi, minuscolo)."""
    if pd.isna(name):
        return name
    return unidecode(str(name)).strip().lower()


def load_mvp_voting() -> pd.DataFrame:
    """Carica e concatena tutti i file di voto MVP raccolti (mvp_voting*.csv)."""
    files = list(RAW.glob("mvp_voting*.csv"))
    if not files:
        raise FileNotFoundError(
            "Nessun file mvp_voting*.csv trovato in data/raw/. "
            "Completa prima la raccolta dei voti MVP."
        )
    dfs = [pd.read_csv(f, dtype={"Rank": str}) for f in files]
    mvp = pd.concat(dfs, ignore_index=True)
    mvp["player_key"] = mvp["Player"].apply(norm_name)
    mvp["is_mvp_winner"] = (mvp["Rank"] == "1").astype(int)
    return mvp


TRADITIONAL_COLS = [
    "PLAYER_ID", "PLAYER_NAME", "TEAM_ABBREVIATION", "AGE", "SEASON",
    "GP", "MIN", "PTS", "REB", "AST", "STL", "BLK", "TOV",
    "FG_PCT", "FG3_PCT", "FT_PCT", "PLUS_MINUS",
]
ADV_COLS = ["PLAYER_ID", "SEASON", "TS_PCT", "USG_PCT", "PIE", "OFF_RATING", "DEF_RATING", "NET_RATING"]
USAGE_COLS = ["PLAYER_ID", "SEASON", "PCT_PTS", "PCT_AST", "PCT_REB"]
MISC_COLS = ["PLAYER_ID", "SEASON", "PTS_PAINT", "PTS_FB", "PTS_OFF_TOV"]


def load_player_stats() -> pd.DataFrame:
    """Carica e unisce le statistiche regular-season (traditional + advanced + usage + misc).

    Tiene solo le colonne rilevanti (niente colonne _RANK) per restare vicini
    all'AS Index dichiarato nella proposal (~22 colonne).
    Un giocatore scambiato a meta' stagione ha piu' righe (una per squadra + una
    riga 'TOT'): teniamo solo quella con piu' minuti per evitare duplicati.
    """
    trad = pd.read_csv(STATS_REPO / "player_stats_traditionnal_rs.csv")[TRADITIONAL_COLS]
    adv = pd.read_csv(STATS_REPO / "player_stats_advanced_rs.csv")[ADV_COLS]
    usage = pd.read_csv(STATS_REPO / "player_stats_usage_rs.csv")[USAGE_COLS]
    misc = pd.read_csv(STATS_REPO / "player_stats_misc_rs.csv")[MISC_COLS]

    trad = trad.sort_values("MIN", ascending=False).drop_duplicates(
        subset=["PLAYER_ID", "SEASON"], keep="first"
    )

    key = ["PLAYER_ID", "SEASON"]
    merged = trad.merge(adv, on=key, how="left")
    merged = merged.merge(usage, on=key, how="left")
    merged = merged.merge(misc, on=key, how="left")

    merged["player_key"] = merged["PLAYER_NAME"].apply(norm_name)
    return merged


def assign_era(season: str) -> str:
    start_year = int(season.split("-")[0])
    if start_year <= 2004:
        return "Pre-Analytics"
    elif start_year <= 2015:
        return "Transition"
    else:
        return "Small-Ball"


def main():
    mvp = load_mvp_voting()
    stats = load_player_stats()

    merged = mvp.merge(
        stats,
        left_on=["player_key", "Season"],
        right_on=["player_key", "SEASON"],
        how="left",
        suffixes=("_mvp", "_stats"),
    )

    unmatched = merged[merged["PLAYER_ID"].isna()]
    if len(unmatched) > 0:
        print(f"⚠️  {len(unmatched)} candidati MVP non trovati nelle statistiche giocatori:")
        print(unmatched[["Season", "Player"]].to_string(index=False))
        print("Controlla la normalizzazione dei nomi per queste righe.\n")

    merged = merged[merged["PLAYER_ID"].notna()].copy()

    # Filtro dalla proposal: MIN >= 20, GP >= 41
    merged["MIN"] = pd.to_numeric(merged["MIN"], errors="coerce")
    merged["GP"] = pd.to_numeric(merged["GP"], errors="coerce")
    filtered = merged[(merged["MIN"] >= 20) & (merged["GP"] >= 41)].copy()

    filtered["tactical_era"] = filtered["Season"].apply(assign_era)

    out_path = OUT_DIR / "mvp_candidates_final.csv"
    filtered.to_csv(out_path, index=False)

    n_rows, n_cols = filtered.shape
    as_index = n_rows * n_cols
    print(f"\n✅ Dataset finale salvato in: {out_path}")
    print(f"   Righe: {n_rows}  |  Colonne: {n_cols}")
    print(f"   AS Index = {n_rows} x {n_cols} = {as_index}")
    if not (10_000 <= as_index <= 50_000):
        print("   ⚠️  Fuori dal range richiesto (10.000-50.000) — valuta di aggiungere/togliere colonne "
              "o rivedere il filtro.")
    else:
        print("   ✔️  Dentro il range richiesto dal regolamento (10.000-50.000).")


if __name__ == "__main__":
    main()
