# NBA-MVP-Visual-Analytics
Visual Analytics dashboard investigating whether the NBA MVP Award has historically rewarded the statistically most deserving player, using PCA, coordinated views, and interactive analytics on 1996-2023 NBA data.

## Avvio della dashboard

La dashboard carica i dati con `d3.csv`/`d3.json`, quindi va servita da un
server locale (aprire `index.html` direttamente dal file system non funziona):

```
python3 -m http.server 8000
```

poi aprire <http://localhost:8000>.

## Dataset

`data/mvp_candidates_pca.csv`: 354 candidati MVP (giocatori che hanno ricevuto
almeno un voto, con MIN ≥ 20 e GP ≥ 41) su 27 stagioni, 1996-97 → 2022-23.
41 colonne, AS Index = 14.514. Fonti: statistiche dal repo
[Brescou/NBA-dataset-stats-player-team](https://github.com/Brescou/NBA-dataset-stats-player-team)
(`data1/raw/nba_stats_repo/`), voti MVP da Basketball-Reference
(`data1/raw/mvp_voting.csv`).

## Pipeline

Ogni passo legge l'output del precedente; rieseguirla tutta riproduce
esattamente i file versionati.

| # | Script | Output |
|---|---|---|
| 1 | `data1/scripts/build_dataset.py`: merge statistiche + voti, filtri, era tattica | `data1/processed/mvp_candidates_final.csv` |
| 2 | `Visual Analytics/cleaning_dataset.py`: selezione e rinomina colonne | `Visual Analytics/mvp_candidates_cleaned.csv` |
| 3 | `Visual Analytics/compute_pca.py`: PCA su 24 statistiche individuali standardizzate | `data/mvp_candidates_pca.csv`, `data/pca_meta.json` |
| 4 | `data1/scripts/league_averages.py`: media di lega per stagione (riferimento della Line Chart) | `data/league_averages.json` |
| 5 | `analysis/mvp_merit_analysis.py`: modello del voto, insight, pesi dell'MVP Score | `data/insights/insights.json` |
| 6 | `analysis/make_figures.py`: figure per report e slide | `analysis/figures/*.png` |

```
python3 data1/scripts/build_dataset.py
python3 "Visual Analytics/cleaning_dataset.py"
python3 "Visual Analytics/compute_pca.py"
python3 data1/scripts/league_averages.py
python3 analysis/mvp_merit_analysis.py
python3 analysis/make_figures.py
```

Dipendenze: `pandas`, `numpy`, `scikit-learn`, `unidecode`, `matplotlib`.

## Struttura

- `index.html`, `js/app.js`, `css/styles.css`: dashboard D3.js v7.
- `analysis/INSIGHTS_REPORT.md`: insight scoperti, metodo, scenari della demo e limiti.
- `analysis/CHANGELOG.md`: storico tecnico delle modifiche.
