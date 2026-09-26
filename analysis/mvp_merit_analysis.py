"""
Analisi riproducibile: "Chi vince l'MVP se lo merita davvero?"

Legge il dataset canonico usato dalla dashboard (data/mvp_candidates_pca.csv,
354 candidati su 27 stagioni, 1996-97 - 2022-23) e risponde a tre domande:

  1. Affidabilita' per metrica: quanto spesso il vincitore reale dell'MVP era
     anche il candidato #1 di quella stagione su una data statistica (overall
     e per era tattica)?
  2. Merit mismatch: quale vincitore si e' discostato di piu' dal merito
     statistico puro (rank peggiore su PIE + WS tra i candidati)?
  3. Voter fatigue vs incumbent bonus: controllando per PIE e Team_W_PCT, chi
     ha vinto l'MVP l'anno precedente riceve in media un voto piu' alto o piu'
     basso di quanto il modello si aspetterebbe?

Include anche due casi aneddotici citati nel report (crollo di squadra vs
arrivo di un secondo protagonista offensivo), con un limite noto: il dataset
contiene solo i candidati che hanno ricevuto voti MVP quell'anno, non l'intero
roster di squadra (vedi funzione narrative_cases).

Output: data/insights/insights.json, consumato da js/app.js per il modulo
interattivo "Insights" della dashboard.

Uso: python3 analysis/mvp_merit_analysis.py
"""
import csv
import json
from collections import defaultdict
from pathlib import Path

import numpy as np
from sklearn.linear_model import LinearRegression

ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = ROOT / "data" / "mvp_candidates_pca.csv"
OUTPUT_PATH = ROOT / "data" / "insights" / "insights.json"

METRICS = ["PIE", "WS", "Team_W_PCT", "PTS", "Net_Rating", "USG_PCT"]
ERAS = ["Pre-Analytics", "Transition", "Small-Ball"]


def to_f(v):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if f == f else None  # scarta NaN


def load_rows():
    with open(DATA_PATH, newline="") as f:
        return list(csv.DictReader(f))


def top1_reliability(rows):
    """Per ogni metrica: % di stagioni in cui il vincitore reale era anche
    il candidato con il valore piu' alto quell'anno."""
    by_season = defaultdict(list)
    for r in rows:
        by_season[r["Season"]].append(r)

    overall = {m: {"hit": 0, "total": 0} for m in METRICS}
    by_era = {e: {m: {"hit": 0, "total": 0} for m in METRICS} for e in ERAS}

    for season, cands in by_season.items():
        winner = next((c for c in cands if c["Is_MVP_Winner"] == "1"), None)
        if not winner:
            continue
        era = winner["Tactical_Era"]
        for m in METRICS:
            vals = [to_f(c[m]) for c in cands]
            vals = [v for v in vals if v is not None]
            wval = to_f(winner[m])
            if not vals or wval is None:
                continue
            is_top1 = abs(wval - max(vals)) < 1e-9
            overall[m]["hit"] += int(is_top1)
            overall[m]["total"] += 1
            if era in by_era:
                by_era[era][m]["hit"] += int(is_top1)
                by_era[era][m]["total"] += 1

    def pct(d):
        return {
            m: {
                "hit": v["hit"],
                "total": v["total"],
                "pct": round(v["hit"] / v["total"] * 100, 1) if v["total"] else None,
            }
            for m, v in d.items()
        }

    return {"overall": pct(overall), "by_era": {e: pct(d) for e, d in by_era.items()}}


def merit_mismatch(rows):
    """Rank del vincitore reale tra i candidati di quella stagione, su PIE,
    WS e Team_W_PCT. Un rank alto su PIE/WS (nonostante il titolo) segnala un
    premio guidato piu' da contesto/narrativa che da dominio statistico."""
    by_season = defaultdict(list)
    for r in rows:
        by_season[r["Season"]].append(r)

    cases = []
    for season, cands in by_season.items():
        winner = next((c for c in cands if c["Is_MVP_Winner"] == "1"), None)
        if not winner:
            continue
        ranks = {}
        for m in ["PIE", "WS", "Team_W_PCT"]:
            vals = [(c["Player"], to_f(c[m])) for c in cands if to_f(c[m]) is not None]
            vals.sort(key=lambda x: -x[1])
            rank = next((i + 1 for i, (p, _) in enumerate(vals) if p == winner["Player"]), None)
            ranks[f"{m}_rank"] = rank
            ranks[f"{m}_n"] = len(vals)
        cases.append({
            "season": season,
            "player": winner["Player"],
            "era": winner["Tactical_Era"],
            **ranks,
        })

    def merit_gap(c):
        if c["PIE_rank"] is None or c["WS_rank"] is None:
            return -1
        return c["PIE_rank"] + c["WS_rank"]

    cases.sort(key=merit_gap, reverse=True)
    return cases


def voter_fatigue(rows):
    """Modello Share ~ PIE + Team_W_PCT. Per chi ha vinto l'MVP l'anno prima,
    il residuo dell'anno successivo dice se il voto e' stato piu' generoso
    (bonus di fiducia) o piu' severo (voter fatigue) di quanto le statistiche
    da sole giustifichino."""
    seasons_sorted = sorted({r["Season"] for r in rows})
    season_idx = {s: i for i, s in enumerate(seasons_sorted)}
    winners_by_season = {r["Season"]: r["Player"] for r in rows if r["Is_MVP_Winner"] == "1"}

    data = []
    for r in rows:
        pie, wpct, share = to_f(r["PIE"]), to_f(r["Team_W_PCT"]), to_f(r["MVP_Share"])
        if pie is None or wpct is None or share is None:
            continue
        data.append((r["Player"], r["Season"], pie, wpct, share))

    X = np.array([[d[2], d[3]] for d in data])
    y = np.array([d[4] for d in data])
    model = LinearRegression().fit(X, y)
    r2 = model.score(X, y)
    residuals = y - model.predict(X)

    incumbents, incumbent_keys = [], set()
    for (player, season, pie, wpct, share), res in zip(data, residuals):
        si = season_idx[season]
        if si == 0:
            continue
        prev_season = seasons_sorted[si - 1]
        if winners_by_season.get(prev_season) == player:
            incumbents.append({
                "player": player,
                "season": season,
                "previous_mvp_season": prev_season,
                "pie": round(pie, 3),
                "team_w_pct": round(wpct, 3),
                "share": round(share, 3),
                "residual": round(float(res), 3),
            })
            incumbent_keys.add((player, season))

    incumbents.sort(key=lambda c: c["residual"])
    other_residuals = [
        float(res) for (p, s, *_), res in zip(data, residuals) if (p, s) not in incumbent_keys
    ]

    return {
        "r2": round(r2, 3),
        "features": ["PIE", "Team_W_PCT"],
        "target": "MVP_Share",
        "mean_residual_incumbents": round(float(np.mean([c["residual"] for c in incumbents])), 3),
        "mean_residual_others": round(float(np.mean(other_residuals)), 3),
        "incumbent_cases": incumbents,
    }


def narrative_cases(rows):
    """Due casi aneddotici citati nel report:
    - crollo del record di squadra a parita' di merito individuale (Garnett,
      Nowitzki, e per contrasto Nash, Curry);
    - arrivo di un secondo protagonista offensivo, misurato come collasso del
      divario di USG_PCT tra il vincitore e il candidato successivo della
      stessa squadra (Curry/Durant).

    LIMITE NOTO: il dataset contiene solo i candidati che hanno ricevuto voti
    MVP quell'anno, non l'intero roster. Il metodo dell'usage-gap funziona
    solo quando anche il "secondo protagonista" ha ricevuto voti MVP (vero
    per Durant nel 2016-17). Il caso Westbrook/Paul George (OKC 2017-18) NON
    e' verificabile con questo dataset perche' George non fu candidato MVP
    quell'anno: senza il suo USG_PCT il calcolo del gap sarebbe fuorviante,
    quindi va escluso finche' non si integrano i dati di roster completo
    (disponibili grezzi in data1/raw/nba_stats_repo, non ancora uniti).
    """
    by_player_season = {(r["Player"], r["Season"]): r for r in rows}
    by_season = defaultdict(list)
    for r in rows:
        by_season[r["Season"]].append(r)

    def get(player, season, metric):
        r = by_player_season.get((player, season))
        return to_f(r[metric]) if r else None

    def team_collapse_case(player, y1, y2):
        return {
            "player": player,
            "year": y1,
            "next_year": y2,
            "pie": [get(player, y1, "PIE"), get(player, y2, "PIE")],
            "team_w_pct": [get(player, y1, "Team_W_PCT"), get(player, y2, "Team_W_PCT")],
            "share": [get(player, y1, "MVP_Share"), get(player, y2, "MVP_Share")],
        }

    def usage_gap(season, team):
        teammates = [
            (c["Player"], to_f(c["USG_PCT"]))
            for c in by_season[season]
            if c["Team"] == team and to_f(c["USG_PCT"]) is not None
        ]
        teammates.sort(key=lambda x: -x[1])
        if len(teammates) < 2:
            return None
        return {
            "leader": teammates[0],
            "second": teammates[1],
            "gap": round(teammates[0][1] - teammates[1][1], 3),
        }

    return {
        "team_collapse": [
            team_collapse_case("Kevin Garnett", "2003-04", "2004-05"),
            team_collapse_case("Dirk Nowitzki", "2006-07", "2007-08"),
            team_collapse_case("Steve Nash", "2004-05", "2005-06"),
            team_collapse_case("Stephen Curry", "2015-16", "2016-17"),
        ],
        "usage_gap": {
            "player": "Stephen Curry",
            "team": "GSW",
            "year": "2015-16",
            "next_year": "2016-17",
            "gap": [usage_gap("2015-16", "GSW"), usage_gap("2016-17", "GSW")],
        },
        "usage_gap_not_verifiable": {
            "player": "Russell Westbrook",
            "team": "OKC",
            "year": "2016-17",
            "next_year": "2017-18",
            "reason": (
                "Paul George non ricevette voti MVP nel 2017-18, quindi non "
                "compare tra i candidati: il suo USG_PCT non e' nel dataset "
                "e il gap calcolato solo sui candidati sarebbe fuorviante."
            ),
        },
    }


def main():
    rows = load_rows()
    mismatch = merit_mismatch(rows)
    result = {
        "generated_from": "data/mvp_candidates_pca.csv",
        "n_candidates": len(rows),
        "n_seasons": len({r["Season"] for r in rows}),
        "top1_reliability": top1_reliability(rows),
        "merit_mismatch": mismatch,
        "most_anomalous_winner": mismatch[0] if mismatch else None,
        "voter_fatigue": voter_fatigue(rows),
        "narrative_cases": narrative_cases(rows),
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w") as f:
        json.dump(result, f, indent=2)

    top = result["most_anomalous_winner"]
    print(f"Insights scritti in {OUTPUT_PATH}")
    print(f"Vincitore piu' anomalo: {top['player']} ({top['season']}) "
          f"- PIE_rank={top['PIE_rank']}/{top['PIE_n']}, "
          f"WS_rank={top['WS_rank']}/{top['WS_n']}, "
          f"Team_W_PCT_rank={top['Team_W_PCT_rank']}/{top['Team_W_PCT_n']}")
    print(f"Modello voter-fatigue: R^2={result['voter_fatigue']['r2']}, "
          f"residuo medio incumbent={result['voter_fatigue']['mean_residual_incumbents']:+.3f} "
          f"vs altri={result['voter_fatigue']['mean_residual_others']:+.3f}")


if __name__ == "__main__":
    main()
