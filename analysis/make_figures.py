import csv
import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parent.parent
INSIGHTS = json.loads((ROOT / "data" / "insights" / "insights.json").read_text())
OUT = ROOT / "analysis" / "figures"
OUT.mkdir(exist_ok=True)

ERA_COLORS = {"Pre-Analytics": "#0072B2", "Transition": "#E69F00", "Small-Ball": "#009E73"}
ERAS = list(ERA_COLORS)
NEG, POS = "#B2182B", "#2166AC"

plt.rcParams.update({
    "font.size": 10, "axes.spines.top": False, "axes.spines.right": False,
    "axes.titleweight": "bold", "axes.titlesize": 11, "figure.dpi": 150,
})

def save(fig, name):
    fig.tight_layout()
    fig.savefig(OUT / name, bbox_inches="tight")
    plt.close(fig)
    print(f"  {OUT / name}")

def fig_winner_vs_statistical_choice():

    vm = INSIGHTS["vote_model"]
    seasons = vm["seasons"]
    x = list(range(len(seasons)))
    fig, ax = plt.subplots(figsize=(9, 3.8))
    ax.plot(x, [s["choice_expected"] for s in seasons], color="#7f8c8d", lw=1.2, ls="--",
            label="Scelta statistica della stagione (share attesa più alta)")
    k = 0
    for i, s in enumerate(seasons):
        ax.scatter(i, s["winner_expected"], marker="*", s=130, color=ERA_COLORS[s["era"]],
                   edgecolor="black", linewidth=0.6, zorder=3)
        if s["merit_gap"] >= 0.15:
            ax.vlines(i, s["winner_expected"], s["choice_expected"], color=NEG, lw=1.5, zorder=2)
            ax.annotate(f"{s['winner'].split()[-1]}\n(vs {s['statistical_choice'].split()[-1]})",
                        (i, s["winner_expected"]), xytext=(0, -26 if k % 2 == 0 else -50), textcoords="offset points",
                        ha="center", fontsize=7, color=NEG)
            k += 1
    ax.scatter([], [], marker="*", s=130, color="#bbb", edgecolor="black", label="MVP reale (colore = era)")
    ax.plot([], [], color=NEG, lw=1.5, label="Scarto ≥ 0,15: MVP 'controcorrente'")
    ax.axvspan(seasons.index(next(s for s in seasons if s["season"] == "2011-12")) - 0.5, len(seasons) - 0.5,
               color="#009E73", alpha=0.06)
    ax.text(len(seasons) - 1, 0.02, f"{vm['seasons_since_last_big_mismatch']} stagioni consecutive\nsenza MVP controcorrente",
            ha="right", va="bottom", fontsize=8, color="#1a252f")
    ax.set_xticks(x[::3], [s["season"] for s in seasons][::3], rotation=30, ha="right")
    ax.set_ylabel("Share di voto attesa\n(modello PIE + record squadra)")
    ax.set_ylim(-0.22, 1.0)
    ax.set_title("L'MVP reale contro la scelta statistica di ogni stagione")
    ax.legend(loc="upper left", fontsize=7.5, frameon=False)
    save(fig, "fig1_mvp_vs_scelta_statistica.png")

def fig_vote_weights_by_era():

    by_era = INSIGHTS["vote_model"]["by_era"]
    fig, axes = plt.subplots(1, 2, figsize=(8, 3.2), sharey=True)
    for ax, feat, title in zip(axes, ["PIE", "Team_W_PCT"],
                               ["Peso del merito individuale (PIE)", "Peso del record di squadra"]):
        for i, era in enumerate(ERAS):
            e = by_era[era]
            c, (lo, hi) = e["coef"][feat], e["ci95"][feat]
            ax.bar(i, c, color=ERA_COLORS[era], width=0.6)
            ax.errorbar(i, c, yerr=[[c - lo], [hi - c]], color="black", capsize=4, lw=1)
            ax.text(i, hi + 0.01, f"{c:.3f}", ha="center", fontsize=8)
        ax.set_xticks(range(3), ERAS)
        ax.set_title(title)
    axes[0].set_ylabel("Coefficiente standardizzato\n(Δ share per 1 dev. std.)")
    d = INSIGHTS["vote_model"]["pie_coef_diff_smallball_vs_preanalytics"]
    fig.suptitle(f"Come votano le tre ere (barre: IC 95% bootstrap). Δ PIE Small-Ball − Pre-Analytics = "
                 f"+{d['mean']:.3f} [{d['ci95'][0]:.3f}; {d['ci95'][1]:.3f}]", fontsize=9)
    save(fig, "fig2_pesi_voto_per_era.png")

def fig_threshold():

    wt = INSIGHTS["win_rate_threshold"]
    keys = ["under_55", "band_55_65", "over_65"]
    bands = [wt["bands"][k] for k in keys]
    fig, ax = plt.subplots(figsize=(5.5, 3.2))
    colors = ["#99000d", "#fb6a4a", "#fcbba1"]
    ax.bar([b["label"] for b in bands], [b["collapse_rate_pct"] for b in bands], color=colors, edgecolor="#8b1a1a", lw=0.5)
    for i, b in enumerate(bands):
        ax.text(i, b["collapse_rate_pct"] + 2, f"{b['collapse_rate_pct']}%\n(n={b['n']})", ha="center", fontsize=8)
    ax.set_ylim(0, 110)
    ax.set_ylabel("% con share < 10%")
    ax.set_xlabel("Record di vittorie della squadra")
    ax.set_title(f"Candidati top-5 su PIE (n={wt['n_serious_candidates']}): quando il voto crolla")
    save(fig, "fig3_soglia_record_squadra.png")

def fig_incumbents():

    vf = INSIGHTS["voter_fatigue"]
    cases = vf["incumbent_cases"]
    fig, ax = plt.subplots(figsize=(6.5, 5.2))
    labels = [f"{c['player']} {c['season']}" for c in cases]
    vals = [c["residual"] for c in cases]
    ax.barh(labels, vals, color=[POS if v >= 0 else NEG for v in vals])
    ax.axvline(0, color="#999", lw=0.8)
    ax.tick_params(axis="y", labelsize=7)
    ax.set_xlabel("Share reale − share attesa (narrativa)")
    ax.set_title(f"MVP dell'anno prima: residuo medio +{vf['mean_residual_incumbents']:.3f} "
                 f"(altri {vf['mean_residual_others']:+.3f})", fontsize=10)
    save(fig, "fig4_mvp_uscenti.png")

def fig_reliability():

    rel = INSIGHTS["top1_reliability"]["by_era"]
    metrics = ["PIE", "WS", "Team_W_PCT", "PTS"]
    fig, ax = plt.subplots(figsize=(6.5, 3))
    w = 0.26
    for j, era in enumerate(ERAS):
        vals = [rel[era][m]["pct"] or 0 for m in metrics]
        ax.bar([i + (j - 1) * w for i in range(len(metrics))], vals, width=w, color=ERA_COLORS[era], label=era)
    ax.set_xticks(range(len(metrics)), metrics)
    ax.set_ylabel("% stagioni in cui il #1\nsulla metrica ha vinto")
    ax.set_ylim(0, 100)
    ax.legend(fontsize=8, frameon=False)
    ax.set_title("Affidabilità delle singole statistiche come predittore dell'MVP")
    save(fig, "fig5_affidabilita_metriche.png")

def fig_pca_shifts():

    with open(ROOT / "data" / "mvp_candidates_pca.csv", newline="") as f:
        rows = list(csv.DictReader(f))
    meta = json.loads((ROOT / "data" / "pca_meta.json").read_text())
    pe = INSIGHTS["position_effect"]
    pos = {(r["Player"], r["Season"]): (float(r["PC1"]), float(r["PC2"])) for r in rows}

    fig, ax = plt.subplots(figsize=(7.5, 4.6))
    for era, color in ERA_COLORS.items():
        pts = [r for r in rows if r["Tactical_Era"] == era]
        ax.scatter([float(r["PC1"]) for r in pts], [float(r["PC2"]) for r in pts],
                   s=10, color=color, alpha=0.25, linewidths=0, label=era)
    ax.axvline(0, color="#999", lw=0.8, ls=":")
    ax.text(-0.3, ax.get_ylim()[1] * 0.95, "← guardie", ha="right", fontsize=8, color="#555")
    ax.text(0.3, ax.get_ylim()[1] * 0.95, "lunghi →", ha="left", fontsize=8, color="#555")
    for sft in pe["big_mismatch_shifts"]:
        c = pos[(sft["choice"], sft["season"])]
        w = pos[(sft["winner"], sft["season"])]
        ax.annotate("", xy=w, xytext=c,
                    arrowprops=dict(arrowstyle="-|>", color=NEG, lw=1.6, shrinkA=4, shrinkB=4))
        ax.scatter(*c, s=45, facecolors="none", edgecolors="#1a252f", linewidths=1.2, zorder=3)
        ax.scatter(*w, s=110, marker="*", color=NEG, edgecolors="black", linewidths=0.5, zorder=4)
        ax.annotate(f"{sft['winner'].split()[-1]} {sft['season'][2:]}", w, xytext=(-6, 6),
                    textcoords="offset points", ha="right", fontsize=7.5, color=NEG)
    ax.scatter([], [], s=45, facecolors="none", edgecolors="#1a252f", label="Scelta statistica")
    ax.scatter([], [], s=110, marker="*", color=NEG, edgecolors="black", label="MVP controcorrente")
    ev = meta["explained_variance"]
    ax.set_xlabel(f"PC1 ({ev['PC1'] * 100:.1f}%): ← guardie · lunghi →")
    ax.set_ylabel(f"PC2 ({ev['PC2'] * 100:.1f}%): volume offensivo →")
    o = pe["overall"]
    ax.set_title(f"MVP controcorrente: il voto si sposta verso le guardie ({pe['n_guard_over_big']}/"
                 f"{len(pe['big_mismatch_shifts'])} casi)\nnarrativa media guardie {o['guards']['mean_narrative']:+.3f} vs "
                 f"lunghi {o['bigs']['mean_narrative']:+.3f} (p={o['p_value']})", fontsize=10)
    ax.legend(fontsize=7.5, frameon=False, loc="lower right")
    save(fig, "fig6_pca_spostamento_guardie.png")

def fig_robustness():

    rb = INSIGHTS["robustness_ws"]
    seasons = rb["seasons"]
    x = range(len(seasons))
    fig, ax = plt.subplots(figsize=(9, 3.2))
    w = 0.4
    ax.bar([i - w / 2 for i in x], [s["gap_pie"] for s in seasons], width=w, color="#1a252f", label="merito = PIE")
    ax.bar([i + w / 2 for i in x], [s["gap_ws"] for s in seasons], width=w, color="#95a5a6", label="merito = WS")
    ax.axhline(0.15, color=NEG, lw=1, ls="--")
    ax.text(len(seasons) - 0.5, 0.155, "soglia MVP controcorrente", ha="right", fontsize=7.5, color=NEG)
    ax.set_xticks(list(x), [s["season"] for s in seasons], rotation=45, ha="right", fontsize=7.5)
    ax.set_ylabel("Scarto di share attesa\nscelta statistica − MVP")
    g = rb["mean_winner_gap"]
    ax.set_title(f"Robustezza (2001-2023): scarto medio fino al 2010 → dal 2011: PIE {g['pie']['until_2010']:.3f} → "
                 f"{g['pie']['from_2011']:.3f}, WS {g['ws']['until_2010']:.3f} → {g['ws']['from_2011']:.3f}", fontsize=9.5)
    ax.legend(fontsize=8, frameon=False, loc="upper right")
    save(fig, "fig7_robustezza_pie_ws.png")

if __name__ == "__main__":
    print("Figure generate:")
    fig_winner_vs_statistical_choice()
    fig_vote_weights_by_era()
    fig_threshold()
    fig_incumbents()
    fig_reliability()
    fig_pca_shifts()
    fig_robustness()
