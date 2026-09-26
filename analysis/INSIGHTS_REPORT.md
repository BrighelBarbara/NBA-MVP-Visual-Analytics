# Report: "Chi vince l'MVP se lo merita davvero?"

Analisi riproducibile sul dataset del progetto (`data/mvp_candidates_pca.csv`,
354 candidati, 27 stagioni 1996-97 → 2022-23). Script: `analysis/mvp_merit_analysis.py`.
Output dati: `data/insights/insights.json`. Integrazione visiva: modulo "Insights"
in `index.html` / `js/app.js`.

Riproduci con:
```
python3 analysis/mvp_merit_analysis.py
```

---

## 1. Cosa è stato fatto

Le analisi discusse informalmente (affidabilità delle metriche, caso Nash,
crolli di voto, voter fatigue, usage-gap Curry/Durant) sono state:

1. **verificate numericamente** riga per riga sul dataset reale del progetto
   (non su dati di altra provenienza);
2. **trasformate in uno script Python versionato** (`analysis/mvp_merit_analysis.py`),
   così sono riproducibili da chiunque clonando la repo, non solo raccontabili a voce;
3. **integrate visivamente e in modo interattivo** nella dashboard, non lasciate
   solo nel report testuale.

Modifiche al codice:
- `analysis/mvp_merit_analysis.py` (nuovo) — calcola i 4 risultati sotto ed esporta `data/insights/insights.json`.
- `js/app.js` — carica `insights.json` insieme al CSV; aggiunge legenda, annotazione persistente sul caso più anomalo, due nuovi grafici D3 interattivi, callout narrativo.
- `css/styles.css` — stili per legenda, grafici, tooltip; **palette colori delle ere sostituita** (vedi §3).
- `index.html` — nuova sezione "Modulo Insights" con due grafici + callout.

---

## 2. Risultati (verificati sul dataset del progetto)

### 2.1 Affidabilità per metrica: nessuna statistica semplice prevede l'MVP, una composita sì

% di stagioni (su 27) in cui il vincitore reale era anche il candidato #1 su quella statistica:

| Metrica | % top-1 | n |
|---|---|---|
| **PIE** | **70.4%** | 27 |
| WS (Win Shares) | 59.1% | 22* |
| Team W_PCT | 40.7% | 27 |
| PTS | 33.3% | 27 |
| NET_RATING | 22.2% | 27 |
| USG_PCT | 22.2% | 27 |

\* WS mancante per 5 stagioni Pre-Analytics (vedi limiti, §4).

Per era:

| Era | PIE | WS | PTS |
|---|---|---|---|
| Pre-Analytics (1996–2004) | 66.7% | 75.0%* | 44.4% |
| Transition (2005–2015) | 63.6% | 63.6% | 18.2% |
| Small-Ball (2016–2023) | **85.7%** | 42.9% | 42.9% |

**Lettura**: il PIE è il predittore singolo più affidabile, e lo è ancora di più
nell'era Small-Ball — il contrario di quanto ci si aspetterebbe se il voto
moderno fosse "più guidato dai social/dalla narrativa".

### 2.2 Il caso più anomalo: Steve Nash, 2004-05

Identificato **algoritmicamente** (rank peggiore su PIE+WS tra tutti i vincitori), non scelto a mano:

| Metrica | Rank di Nash tra i 16 candidati |
|---|---|
| PIE | 11°/16 |
| WS | 11°/16 |
| Team W_PCT | **1°/16** |

Ha vinto per il record della sua squadra (Phoenix Suns), non per dominio statistico individuale — è il caso di "vittoria meno meritata statisticamente" del dataset.

### 2.3 Crollo di squadra vs merito individuale (4 casi anno-dopo-vittoria)

| Giocatore | Anno → anno dopo | PIE | Team W_PCT | Share voti |
|---|---|---|---|---|
| Kevin Garnett | 2003-04 → 2004-05 | 0.222 → 0.213 (−4%) | 0.707 → 0.537 (−24%) | 0.991 → 0.012 |
| Dirk Nowitzki | 2006-07 → 2007-08 | 0.201 → 0.176 (−12%) | 0.821 → 0.636 (−23%) | 0.882 → 0.004 |
| Steve Nash | 2004-05 → 2005-06 | 0.145 → 0.166 (+14%) | 0.800 → 0.684 (−14%) | 0.839 → 0.739 |
| Stephen Curry | 2015-16 → 2016-17 | 0.197 → 0.151 (−23%) | 0.899 → 0.823 (−8%) | 1.000 → 0.051 |

**Lettura**: Garnett e Nowitzki hanno statistiche individuali quasi identiche
all'anno prima, ma il voto crolla a zero perché la squadra scende sotto la
soglia critica ~60-65% di vittorie. Curry è il caso più interessante: la
squadra resta fortissima (82%) eppure il voto crolla comunque — un indizio di
un effetto narrativo/di "stanchezza del voto" che va oltre la performance.

### 2.4 Arrivo di un secondo protagonista: il divario di utilizzo crolla

| Stagione | Leader USG_PCT (GSW) | Secondo | Divario |
|---|---|---|---|
| 2015-16 (prima di Durant) | Curry 0.314 | Draymond Green 0.184 | **0.130** |
| 2016-17 (dopo Durant) | Curry 0.286 | Kevin Durant 0.271 | **0.015** |

Il divario crolla di ~9 volte nello stesso anno in cui il voto MVP di Curry crolla del 95%.

### 2.5 Voter fatigue vs "bonus di fiducia" (modello Share ~ PIE + Team_W_PCT)

Modello: regressione lineare, R² = **0.459**, su tutti i 354 candidati.
Residuo medio per chi ha vinto l'MVP l'anno precedente: **+0.111** (n=23) — in
media un *bonus*, non una penalità — contro **−0.008** per tutti gli altri.

La media nasconde due gruppi opposti:

| Crollo (residuo più negativo) | Bonus (residuo più positivo) |
|---|---|
| Kevin Garnett 2004-05: **−0.406** | Steve Nash 2005-06: **+0.512** |
| Dirk Nowitzki 2007-08: **−0.249** | Steve Nash 2006-07: **+0.484** |
| Russell Westbrook 2017-18: **−0.204** | Stephen Curry 2015-16: **+0.374** |
| Stephen Curry 2016-17: **−0.196** | James Harden 2018-19: **+0.330** |
| Karl Malone 1999-00: **−0.182** | LeBron James 2009-10: **+0.308** |

(elenco completo dei 23 casi in `data/insights/insights.json → voter_fatigue.incumbent_cases`)

**Lettura**: Steve Nash è il personaggio ricorrente — compare come outlier in
**tre** analisi indipendenti (rank peggiore nell'anno di vittoria, §2.2; e
bonus di fiducia più alto di tutti nei due anni successivi qui). È il caso più
solido di "voto guidato da reputazione più che da merito statistico puro" in
tutto il dataset.

---

## 3. Cosa è cambiato nella dashboard

- **Legenda aggiunta** (era mancante — rischio penalità diretta -2 punti da regolamento d'esame).
- **Palette colori delle ere corretta**: la precedente (`#1f77b4`/`#ff7f0e`/`#2ca02c`)
  non supera il controllo di accessibilità daltonici (separazione protanopia
  arancione↔verde quasi nulla, ΔE 0.7). Sostituita con una palette
  colorblind-safe (Okabe-Ito: `#0072B2`/`#E69F00`/`#009E73`), verificata con lo
  script di validazione della color skill.
- **Annotazione persistente** sul punto PCA del caso più anomalo (calcolata
  dai dati, non hard-codata: se il dataset cambia, punta sempre al vincitore
  col peggior rank combinato).
- **Grafico "Affidabilità per metrica ed era"**: barre raggruppate, cliccabili
  → evidenziano l'era corrispondente su PCA e PCP.
- **Grafico "Bonus di fiducia vs voter fatigue"**: barre divergenti (rosso =
  crollo, blu = bonus), cliccabili → selezionano il giocatore/stagione,
  aggiornano la sidebar con la spiegazione testuale del residuo, evidenziano
  il punto sulla PCA.
- **Callout narrativo**, generato dai dati (`insights.json`), non testo statico.

Tutto verificato con un test reale in Chrome (Playwright): nessun errore in
console, click testati (dimming per era, selezione singolo giocatore),
screenshot controllati visivamente.

---

## 4. Limiti noti — dichiarare, non nascondere o "aggiustare"

Nessuno di questi richiede di modificare il dataset di partenza: sono limiti
di scope da **dichiarare onestamente** nel report finale.

1. **WS mancante per 5/9 stagioni Pre-Analytics** (fonte Basketball-Reference
   incompleta prima del 2001). Il dato "WS 75% Pre-Analytics" è calcolato solo
   sulle 4 stagioni valide — da citare con l'asterisco.
2. **Consenso del voto per era non monotono** (65.6% / 81.3% / 77.6%): non
   c'è un trend pulito, dipende più da quanto una singola stagione è stata
   dominata da un giocatore che da un trend strutturale. Non forzare una
   narrativa "i social hanno reso il voto più/meno consensuale" — i numeri
   non la supportano chiaramente.
3. **Il dataset contiene solo candidati che hanno ricevuto voti MVP**, non
   l'intero roster di squadra. Il metodo dell'usage-gap (§2.4) funziona solo
   quando anche il "secondo protagonista" ha ricevuto voti MVP (vero per
   Durant nel 2016-17). **Il confronto Westbrook/Paul George (OKC, 2017-18)
   non è replicabile con questo dataset**: George non fu candidato MVP quella
   stagione, quindi il suo USG_PCT non è nei dati e un gap calcolato solo sui
   candidati sarebbe fuorviante. Per verificarlo servirebbe unire i dati di
   roster completo (grezzi disponibili in `data1/raw/nba_stats_repo/`, non
   ancora integrati) — buon candidato come "future work" nel report, non da
   inventare ora.
4. **L'usage-gap e il modello di voter fatigue sono proxy indiretti**: non ci
   sono dati reali di copertura media/social nel dataset. Va dichiarato
   esplicitamente nel report come scelta metodologica, non presentato come
   misura diretta di "narrativa mediatica".

---

## 5. Cosa resta aperto (non affrontato in questa sessione)

Dalla revisione precedente del progetto, restano da fare, in ordine di priorità:

1. Coordinazione **bidirezionale** reale tra PCA e PCP (oggi il brush esiste
   solo sulla PCA; il PCP non ha interazione propria) — rischio penalità -5
   punti su "coordinated in both ways".
2. **Click sul singolo candidato** in PCA/PCP (oggi solo selezione ad area) —
   promesso nel goal della proposal ("clicking on any candidate triggers a
   detailed comparison").
3. Line Chart e Box Plot da riscrivere per fare quello che la proposal
   promette (selettore statistica + confronto vs media di lega; confronto
   giocatore selezionato vs vincitori storici della stessa era).
4. Pulizia repo: cartelle `Visual Analytics/` e `data1/` sono pipeline
   obsolete, non più usate dall'app — solo `data/mvp_candidates_pca.csv` +
   `analysis/mvp_merit_analysis.py` sono la pipeline "viva".
