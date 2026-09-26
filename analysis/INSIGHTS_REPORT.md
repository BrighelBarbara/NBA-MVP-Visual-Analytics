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

### 2.6 Effetto-soglia sul record di squadra: la vera soglia è ~55%, non 60-65%

Le note originali ipotizzavano una soglia critica al 60-65% di vittorie,
basandosi su soli 4 casi aneddotici (Garnett, Nowitzki, Nash, Curry — §2.3).
Verificato quantitativamente su tutto il campione: filtrando ai **135
candidati già statisticamente forti** (rank ≤5 su PIE nella propria stagione,
così un voto basso non si spiega con "non era abbastanza bravo"), % con voto
quasi azzerato (Share < 0.10) in base al record di squadra:

| Record di squadra | n | % voto crollato | Share media |
|---|---|---|---|
| < 55% | 19 | **89.5%** | 0.068 |
| 55–65% | 34 | **32.4%** | 0.283 |
| ≥ 65% | 82 | **18.3%** | 0.512 |

**Lettura**: l'ipotesi originale non era sbagliata (60-65% resta dentro la
"zona di rischio"), ma il salto più netto avviene prima, verso il **55%**: da
quel punto in giù, quasi 9 candidati su 10 statisticamente da MVP vengono
comunque azzerati nel voto. Sopra il 65% il rischio scende sotto il 20%. È un
buon esempio di come i 4 casi aneddotici avessero individuato il fenomeno
giusto ma non il punto esatto — verificarlo su tutto il campione ha corretto
la stima, non il fenomeno.

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

## 5. Aggiornamento: click sul singolo candidato implementato

Aggiunta successiva a questa sessione: **click su un punto della PCA, su una
linea del PCP, o su una barra del grafico voter-fatigue** ora seleziona quel
candidato e attiva un confronto dettagliato — esattamente quanto promesso nel
goal della proposal ("clicking on any candidate triggers a detailed
comparison against historical winners, exposing overlooked players").

Cosa succede al click:
- Il punto/linea viene evidenziato (bordo rosso in PCA, linea rossa spessa in PCP).
- La sidebar mostra il rank del candidato tra **tutti** i candidati della sua
  stagione (non solo tra i vincitori) su PIE, WS, Team_W_PCT — se il
  candidato non ha vinto ma era #1 su PIE, viene segnalato esplicitamente
  come possibile "snobbato" (es. **Russell Westbrook 2011-12**: rank 11°/14
  su PIE, MVP vinto da LeBron James).
- Il Box Plot passa dalla vista "per era" (tutti i candidati, statistica PTS)
  a un confronto **PIE del candidato selezionato vs distribuzione dei
  vincitori MVP reali della sua stessa era**, con un link per tornare alla
  vista precedente.

Nota tecnica: in D3 il rettangolo trasparente del brush (`overlay`, usato per
il brushing ad area sulla PCA) intercetta *tutti* i click prima dei cerchi
sottostanti. Il click-to-select sulla PCA sfrutta quindi l'evento `brush end`
con selezione nulla: se il click coincide con un punto (entro 15px), seleziona
quel candidato; altrimenti resetta la vista. Sul PCP, che non ha un brush
proprio, il click è collegato direttamente alle linee.

Verificato in Chrome reale (Playwright): click su punto PCA, click su linea
PCP, click su barra fatigue, e reset via click su area vuota — tutti
funzionanti, nessun errore in console.

## 6. Aggiornamento: codifica a forma per i vincitori MVP

La proposal prometteva "shape distinguishes MVP winners from non-winners"; era
implementato invece solo come bordo nero su cerchi identici — nessuna vera
forma diversa. Corretto: i vincitori reali sono ora disegnati come **stelle**
(`d3.symbolStar`), i non vincitori restano **cerchi** (`d3.symbolCircle`),
generati con `d3.symbol()` invece di `<circle>`. Il bordo nero è stato
mantenuto insieme alla forma (codifica ridondante forma+bordo, utile per
l'accessibilità a chi ha difficoltà a distinguere piccole differenze di
forma). Legenda aggiornata con le icone reali.

Nota tecnica: la `size` di `d3.symbol()` è un'area, ma cerchio e stella la
convertono in raggio "esterno" con formule diverse (cerchio: `r=√(size/π)`;
stella: `r=√(size·ka)` con `ka≈0.891`, costante interna di d3-shape). Usare la
stessa area per entrambe le forme fa apparire la stella ~1.67 volte più
grande della sua "vote share" reale — errore in cui siamo incappati nella
prima implementazione (verificato via screenshot, poi corretto invertendo
la formula per ciascuna forma così il raggio esterno percepito coincide).

Nessun'altra logica (brushing, click-to-select, dimming) dipende dagli
attributi `cx`/`cy`/`r` dei cerchi — tutte le funzioni ricalcolano le
coordinate da `xScale(d.PC1)`/`yScale(d.PC2)`, quindi il passaggio da
`<circle>` a `<path>` non ha richiesto altre modifiche. Rivalidato in Chrome
reale: click su stella, filtro per era, click fatigue, brush ad area — tutti
ancora funzionanti dopo il cambio.

## 7. Aggiornamento: quinta analisi — effetto-soglia sul record di squadra

Aggiunta allo script (`win_rate_threshold_effect()` in
`analysis/mvp_merit_analysis.py`) la verifica quantitativa descritta in §2.6,
con relativo modulo visivo nella dashboard: un grafico a barre "Effetto-soglia:
quando il voto crolla quasi certamente" (3 barre, palette sequenziale
rosso chiaro→scuro proporzionale al tasso di crollo, non scelta a mano) più
un pannello di testo che spiega la correzione rispetto all'ipotesi originale
(55% invece di 60-65%). Dati in `insights.json → win_rate_threshold`.

Con questa aggiunta, tutte e 5 le analisi elencate nelle note originali sono
ora script riproducibili + elementi visivi nella dashboard, non più solo testo
di chat: affidabilità per metrica (§2.1), caso Nash (§2.2), crollo di
squadra/voter fatigue (§2.3, §2.5), usage-gap Curry/Durant (§2.4), ed
effetto-soglia (§2.6).

Rivalidato in Chrome reale: 3 barre renderizzate, callout con i numeri
corretti, nessun errore in console.

## 8. Cosa resta aperto (non affrontato in questa sessione)

Dalla revisione precedente del progetto, restano da fare, in ordine di priorità:

1. Coordinazione **bidirezionale** reale tra PCA e PCP tramite brushing
   (oggi il brush ad area esiste solo sulla PCA; il PCP non ha un proprio
   brush sugli assi, anche se ora supporta il click su singola linea) —
   rischio penalità -5 punti su "coordinated in both ways".
2. Line Chart da riscrivere per fare quello che la proposal promette
   (selettore statistica + confronto vs media di lega — oggi mostra solo la
   media PTS di lega, fissa).
3. Pulizia repo: cartelle `Visual Analytics/` e `data1/` sono pipeline
   obsolete, non più usate dall'app — solo `data/mvp_candidates_pca.csv` +
   `analysis/mvp_merit_analysis.py` sono la pipeline "viva".
4. Hover-pop dell'opacità sui punti PCA: tentato e **rimosso** — passava i
   test automatici in Chrome (Playwright) ma non funzionava nell'uso reale
   nel browser dell'utente (si vedeva solo il cursore a crocetta del brush,
   nessun cambiamento di opacità). Causa non ancora diagnosticata; da
   riprendere con debug diretto nel browser dell'utente invece di fidarsi
   solo dei test automatici headless.
