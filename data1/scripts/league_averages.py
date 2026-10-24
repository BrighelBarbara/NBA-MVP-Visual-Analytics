import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
STATS_REPO = ROOT / "data1" / "raw" / "nba_stats_repo" / "player"
OUT_FILE = ROOT / "data" / "league_averages.json"

METRICS = {
    "PTS": "PTS",
    "REB": "REB",
    "AST": "AST",
    "TS_PCT": "TS_PCT",
    "PIE": "PIE",
    "Team_W_PCT": "W_PCT",
}

def main():
    trad = pd.read_csv(STATS_REPO / "player_stats_traditionnal_rs.csv")[
        ["PLAYER_ID", "SEASON", "GP", "MIN", "PTS", "REB", "AST", "W_PCT"]
    ]
    adv = pd.read_csv(STATS_REPO / "player_stats_advanced_rs.csv")[["PLAYER_ID", "SEASON", "TS_PCT", "PIE"]]

    trad = trad.sort_values("MIN", ascending=False).drop_duplicates(subset=["PLAYER_ID", "SEASON"], keep="first")
    adv = adv.drop_duplicates(subset=["PLAYER_ID", "SEASON"], keep="first")
    df = trad.merge(adv, on=["PLAYER_ID", "SEASON"], how="left")
    df = df[(df["MIN"] >= 20) & (df["GP"] >= 41)]

    out = {"filter": "MIN >= 20, GP >= 41 (stesso filtro dei candidati MVP)", "seasons": {}}
    for season, g in df.groupby("SEASON"):
        out["seasons"][season] = {"n": int(len(g))}
        for name, col in METRICS.items():
            out["seasons"][season][name] = round(float(g[col].mean()), 4)

    with open(OUT_FILE, "w") as f:
        json.dump(out, f, indent=2)
    print(f"Medie di lega per {len(out['seasons'])} stagioni salvate in {OUT_FILE}")

if __name__ == "__main__":
    main()
