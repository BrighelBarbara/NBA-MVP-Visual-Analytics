import csv
import json
from collections import defaultdict
from pathlib import Path

import numpy as np
from sklearn.linear_model import LinearRegression, Ridge
from sklearn.preprocessing import StandardScaler

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
    return f if f == f else None

def load_rows():
    with open(DATA_PATH, newline="") as f:
        return list(csv.DictReader(f))

def top1_reliability(rows):

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

SCORE_METRICS = ["Team_W_PCT", "WS", "PIE", "PTS", "TS_PCT"]

def mvp_score_weights(rows):

    data = []
    for r in rows:
        vals = [to_f(r[m]) for m in SCORE_METRICS]
        share = to_f(r["MVP_Share"])
        if share is None or any(v is None for v in vals):
            continue
        data.append((vals, share))

    X = StandardScaler().fit_transform(np.array([d[0] for d in data]))
    y = np.array([d[1] for d in data])
    model = Ridge(alpha=1.0, positive=True).fit(X, y)
    total = float(model.coef_.sum())

    return {
        "method": "Ridge(alpha=1, positive=True) su z-score, target MVP_Share, pesi normalizzati a somma 1",
        "n": len(data),
        "r2": round(float(model.score(X, y)), 3),
        "weights": {m: round(float(c) / total, 3) for m, c in zip(SCORE_METRICS, model.coef_)},
    }

VOTE_FEATURES = ["PIE", "Team_W_PCT"]

def vote_model(rows, n_boot=2000, seed=0):

    pts = [(r, to_f(r["PIE"]), to_f(r["Team_W_PCT"]), to_f(r["MVP_Share"])) for r in rows]
    pts = [p for p in pts if None not in p[1:]]
    X_raw = np.array([[p[1], p[2]] for p in pts])
    mu, sd = X_raw.mean(axis=0), X_raw.std(axis=0, ddof=1)
    Z = (X_raw - mu) / sd
    y = np.array([p[3] for p in pts])
    eras = np.array([p[0]["Tactical_Era"] for p in pts])

    model = LinearRegression().fit(Z, y)
    expected = model.predict(Z)

    def fit(idx):
        m = LinearRegression().fit(Z[idx], y[idx])
        return m.coef_, m.score(Z[idx], y[idx])

    rng = np.random.default_rng(seed)
    by_era, boot = {}, {}
    for era in ERAS:
        idx = np.where(eras == era)[0]
        coef, r2 = fit(idx)
        samples = np.array([fit(rng.choice(idx, size=len(idx), replace=True))[0] for _ in range(n_boot)])
        boot[era] = samples
        lo, hi = np.percentile(samples, [2.5, 97.5], axis=0)
        by_era[era] = {
            "n": int(len(idx)),
            "r2": round(float(r2), 3),
            "coef": {f: round(float(c), 3) for f, c in zip(VOTE_FEATURES, coef)},
            "ci95": {f: [round(float(lo[i]), 3), round(float(hi[i]), 3)] for i, f in enumerate(VOTE_FEATURES)},
            "pie_to_team_ratio": round(float(coef[0] / coef[1]), 2),
        }
    diff = boot["Small-Ball"][:, 0] - boot["Pre-Analytics"][:, 0]

    by_season = defaultdict(list)
    for (r, *_), e in zip(pts, expected):
        by_season[r["Season"]].append((r, float(e)))
    seasons = []
    for season in sorted(by_season):
        cands = by_season[season]
        choice_r, choice_e = max(cands, key=lambda c: c[1])
        winner = next(((r, e) for r, e in cands if r["Is_MVP_Winner"] == "1"), None)
        if not winner:
            continue
        w_r, w_e = winner
        seasons.append({
            "season": season,
            "era": w_r["Tactical_Era"],
            "winner": w_r["Player"],
            "winner_expected": round(w_e, 3),
            "statistical_choice": choice_r["Player"],
            "choice_expected": round(choice_e, 3),
            "merit_gap": round(choice_e - w_e, 3),
            "matches": choice_r["Player"] == w_r["Player"],
        })
    mismatches = [s for s in seasons if not s["matches"]]
    big = [s for s in mismatches if s["merit_gap"] >= 0.15]

    streak = 0
    for s in reversed(seasons):
        if s["merit_gap"] >= 0.15:
            break
        streak += 1

    return {
        "features": VOTE_FEATURES,
        "standardization": {f: {"mean": round(float(mu[i]), 4), "std": round(float(sd[i]), 4)} for i, f in enumerate(VOTE_FEATURES)},
        "global": {
            "r2": round(float(model.score(Z, y)), 3),
            "intercept": round(float(model.intercept_), 4),
            "coef": {f: round(float(c), 4) for f, c in zip(VOTE_FEATURES, model.coef_)},
        },
        "by_era": by_era,
        "pie_coef_diff_smallball_vs_preanalytics": {
            "mean": round(float(diff.mean()), 3),
            "ci95": [round(float(x), 3) for x in np.percentile(diff, [2.5, 97.5])],
            "p_diff_le_0": round(float((diff <= 0).mean()), 4),
        },
        "seasons": seasons,
        "n_matches": len(seasons) - len(mismatches),
        "n_seasons": len(seasons),
        "big_mismatches": big,
        "seasons_since_last_big_mismatch": streak,
    }

def _fit_vote(rows, merit_col):

    pts = [(r, to_f(r[merit_col]), to_f(r["Team_W_PCT"]), to_f(r["MVP_Share"])) for r in rows]
    pts = [p for p in pts if None not in p[1:]]
    X = np.array([[p[1], p[2]] for p in pts])
    Z = (X - X.mean(axis=0)) / X.std(axis=0, ddof=1)
    y = np.array([p[3] for p in pts])
    m = LinearRegression().fit(Z, y)
    return [p[0] for p in pts], m.predict(Z), y, float(m.score(Z, y))

def position_effect(rows, vote):

    from scipy import stats

    rows_m, expected, y, _ = _fit_vote(rows, "PIE")
    narr = y - expected
    pc1 = np.array([to_f(r["PC1"]) for r in rows_m])
    eras = np.array([r["Tactical_Era"] for r in rows_m])
    guard = pc1 < 0

    def compare(mask):
        g, b = narr[mask & guard], narr[mask & ~guard]
        t = stats.ttest_ind(g, b, equal_var=False)
        return {
            "guards": {"n": int(len(g)), "mean_narrative": round(float(g.mean()), 3)},
            "bigs": {"n": int(len(b)), "mean_narrative": round(float(b.mean()), 3)},
            "diff": round(float(g.mean() - b.mean()), 3),
            "welch_t": round(float(t.statistic), 2),
            "p_value": round(float(t.pvalue), 4),
        }

    everyone = np.ones(len(rows_m), dtype=bool)
    by_name = {(r["Player"], r["Season"]): r for r in rows}
    shifts = []
    for s in vote["big_mismatches"]:
        w = by_name[(s["winner"], s["season"])]
        c = by_name[(s["statistical_choice"], s["season"])]
        shifts.append({
            "season": s["season"],
            "winner": s["winner"], "winner_pc1": round(to_f(w["PC1"]), 2), "winner_ast": to_f(w["AST"]),
            "choice": s["statistical_choice"], "choice_pc1": round(to_f(c["PC1"]), 2), "choice_ast": to_f(c["AST"]),
            "guard_over_big": to_f(w["PC1"]) < 0 <= to_f(c["PC1"]),
        })
    winners_by_era = {}
    for era in ERAS:
        ws = [r for r in rows if r["Is_MVP_Winner"] == "1" and r["Tactical_Era"] == era]
        winners_by_era[era] = {
            "guards": sum(1 for r in ws if to_f(r["PC1"]) < 0),
            "bigs": sum(1 for r in ws if to_f(r["PC1"]) >= 0),
        }
    return {
        "split": "PC1 < 0 = profilo da guardia/esterno, PC1 >= 0 = profilo da lungo",
        "corr_pc1_narrative": round(float(np.corrcoef(pc1, narr)[0, 1]), 3),
        "overall": compare(everyone),
        "by_era": {era: compare(eras == era) for era in ERAS},
        "big_mismatch_shifts": shifts,
        "n_guard_over_big": sum(1 for x in shifts if x["guard_over_big"]),
        "winners_by_era": winners_by_era,
    }

def robustness_ws(rows, vote):

    complete = {}
    for r in rows:
        complete.setdefault(r["Season"], True)
        if to_f(r["WS"]) is None:
            complete[r["Season"]] = False
    seasons_ok = sorted(s for s, ok in complete.items() if ok)
    sub = [r for r in rows if r["Season"] in seasons_ok]

    rows_m, expected, _, r2 = _fit_vote(sub, "WS")
    by_season = defaultdict(list)
    for r, e in zip(rows_m, expected):
        by_season[r["Season"]].append((r, float(e)))
    pie_by_season = {s["season"]: s for s in vote["seasons"]}

    out = []
    for season in seasons_ok:
        cands = by_season[season]
        choice_r, choice_e = max(cands, key=lambda c: c[1])
        w_r, w_e = next((r, e) for r, e in cands if r["Is_MVP_Winner"] == "1")
        pie = pie_by_season[season]
        out.append({
            "season": season,
            "winner": w_r["Player"],
            "choice_ws": choice_r["Player"],
            "gap_ws": round(choice_e - w_e, 3),
            "choice_pie": pie["statistical_choice"],
            "gap_pie": pie["merit_gap"],
            "same_choice": choice_r["Player"] == pie["statistical_choice"],
        })

    rows_ws = [r for r in rows if to_f(r["WS"]) is not None]
    X = np.array([[to_f(r["WS"]), to_f(r["Team_W_PCT"])] for r in rows_ws])
    Z = (X - X.mean(axis=0)) / X.std(axis=0, ddof=1)
    y = np.array([to_f(r["MVP_Share"]) for r in rows_ws])
    eras = np.array([r["Tactical_Era"] for r in rows_ws])
    by_era = {}
    for era in ERAS:
        idx = eras == era
        m = LinearRegression().fit(Z[idx], y[idx])
        by_era[era] = {"n": int(idx.sum()), "coef_WS": round(float(m.coef_[0]), 3),
                       "coef_Team_W_PCT": round(float(m.coef_[1]), 3), "r2": round(float(m.score(Z[idx], y[idx])), 3)}

    def mean_gap(items, key, early):
        vals = [x[key] for x in items if (int(x["season"][:4]) <= 2010) == early]
        return round(float(np.mean(vals)), 3)

    big_pie = {s["season"] for s in out if s["gap_pie"] >= 0.15}
    big_ws = {s["season"] for s in out if s["gap_ws"] >= 0.15}
    last_big_ws = max((s["season"] for s in out if s["gap_ws"] >= 0.15), default=None)
    return {
        "seasons_compared": len(out),
        "first_season": seasons_ok[0],
        "r2_ws_model": round(r2, 3),
        "same_statistical_choice": sum(s["same_choice"] for s in out),
        "big_mismatches_pie": sorted(big_pie),
        "big_mismatches_ws": sorted(big_ws),
        "last_big_mismatch_ws": last_big_ws,
        "mean_winner_gap": {
            "pie": {"until_2010": mean_gap(out, "gap_pie", True), "from_2011": mean_gap(out, "gap_pie", False)},
            "ws": {"until_2010": mean_gap(out, "gap_ws", True), "from_2011": mean_gap(out, "gap_ws", False)},
        },
        "by_era_ws": by_era,
        "seasons": out,
    }

def narrative_cases(rows):

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

def win_rate_threshold_effect(rows):

    by_season = defaultdict(list)
    for r in rows:
        by_season[r["Season"]].append(r)

    pie_rank = {}
    for season, cands in by_season.items():
        valid = [(c, to_f(c["PIE"])) for c in cands if to_f(c["PIE"]) is not None]
        valid.sort(key=lambda x: -x[1])
        for i, (c, _) in enumerate(valid, start=1):
            pie_rank[(c["Player"], c["Season"])] = i

    serious = [r for r in rows if pie_rank.get((r["Player"], r["Season"]), 999) <= 5]
    COLLAPSE_THRESHOLD = 0.10

    def band_stats(lo, hi):
        shares = [
            to_f(r["MVP_Share"]) for r in serious
            if to_f(r["Team_W_PCT"]) is not None and lo <= to_f(r["Team_W_PCT"]) < hi
            and to_f(r["MVP_Share"]) is not None
        ]
        if not shares:
            return None
        collapsed = sum(1 for s in shares if s < COLLAPSE_THRESHOLD)
        return {
            "n": len(shares),
            "mean_share": round(sum(shares) / len(shares), 3),
            "collapse_rate_pct": round(collapsed / len(shares) * 100, 1),
        }

    bands = {
        "under_55": {"label": "< 55%", **band_stats(0, 0.55)},
        "band_55_65": {"label": "55-65%", **band_stats(0.55, 0.65)},
        "over_65": {"label": ">= 65%", **band_stats(0.65, 2)},
    }

    fine_bins = []
    for lo, hi in [(0, 0.50), (0.50, 0.55), (0.55, 0.60), (0.60, 0.65),
                   (0.65, 0.70), (0.70, 0.75), (0.75, 1.01)]:
        stats = band_stats(lo, hi)
        if stats:
            fine_bins.append({"range_low": lo, "range_high": min(hi, 1.0), **stats})

    return {
        "n_serious_candidates": len(serious),
        "serious_definition": "PIE rank <= 5 nella propria stagione",
        "collapse_definition": f"MVP_Share < {COLLAPSE_THRESHOLD}",
        "bands": bands,
        "fine_bins": fine_bins,
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
        "mvp_score_weights": mvp_score_weights(rows),
        "vote_model": (vm := vote_model(rows)),
        "position_effect": position_effect(rows, vm),
        "robustness_ws": robustness_ws(rows, vm),
        "narrative_cases": narrative_cases(rows),
        "win_rate_threshold": win_rate_threshold_effect(rows),
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

    vm = result["vote_model"]
    print(f"Modello del voto: R^2={vm['global']['r2']} | scelta statistica = MVP reale in "
          f"{vm['n_matches']}/{vm['n_seasons']} stagioni | MVP controcorrente (scarto>=0.15): "
          + ", ".join(f"{s['winner']} {s['season']}" for s in vm['big_mismatches'])
          + f" | stagioni consecutive senza: {vm['seasons_since_last_big_mismatch']}")
    for era, e in vm["by_era"].items():
        print(f"  {era:14s} n={e['n']:3d} R^2={e['r2']} PIE={e['coef']['PIE']} {e['ci95']['PIE']} "
              f"W%={e['coef']['Team_W_PCT']} {e['ci95']['Team_W_PCT']}")
    print(f"  PIE Small-Ball - Pre-Analytics: {vm['pie_coef_diff_smallball_vs_preanalytics']}")

    pe = result["position_effect"]
    print(f"Guardie vs lunghi: narrativa {pe['overall']['guards']['mean_narrative']:+.3f} vs "
          f"{pe['overall']['bigs']['mean_narrative']:+.3f} (t={pe['overall']['welch_t']}, p={pe['overall']['p_value']}) | "
          f"MVP controcorrente guardia su lungo: {pe['n_guard_over_big']}/{len(pe['big_mismatch_shifts'])}")
    for era, e in pe["by_era"].items():
        print(f"  {era:14s} diff={e['diff']:+.3f} p={e['p_value']}  MVP guardie/lunghi={pe['winners_by_era'][era]}")
    rb = result["robustness_ws"]
    print(f"Robustezza WS ({rb['seasons_compared']} stagioni dal {rb['first_season']}, R^2={rb['r2_ws_model']}): "
          f"stessa scelta statistica in {rb['same_statistical_choice']}/{rb['seasons_compared']} | "
          f"controcorrente PIE={rb['big_mismatches_pie']} WS={rb['big_mismatches_ws']}")

    sw = result["mvp_score_weights"]
    print(f"Pesi MVP Score (R^2={sw['r2']}, n={sw['n']}): {sw['weights']}")

    wt = result["win_rate_threshold"]
    print(f"Effetto-soglia W_PCT (n={wt['n_serious_candidates']} candidati forti): "
          f"<55% -> {wt['bands']['under_55']['collapse_rate_pct']}% crollati | "
          f"55-65% -> {wt['bands']['band_55_65']['collapse_rate_pct']}% | "
          f">=65% -> {wt['bands']['over_65']['collapse_rate_pct']}%")

if __name__ == "__main__":
    main()
