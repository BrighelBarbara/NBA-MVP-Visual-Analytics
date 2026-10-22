# Registro delle modifiche alla dashboard

Storico tecnico delle revisioni (spostato da INSIGHTS_REPORT.md, che ora contiene solo risultati, metodo e scenari della demo). Le sezioni descrivono lo stato del codice al momento di ciascuna revisione: alcuni elementi citati (grafici del modulo Insights, `renderReliabilityChart`, `renderFatigueChart`, `renderThresholdChart`) sono stati poi rimossi dalla dashboard — vedi la sezione finale.

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
  come possibile "snobbato" (es. **Kevin Garnett 2004-05**: rank 1°/16 su
  PIE ma solo 11° nel voto con l'1,2% dei voti, nell'anno in cui l'MVP andò a
  Steve Nash, 11°/16 su PIE — vedi §2.2). In tutto il dataset gli "snobbati"
  di questo tipo sono 8, uno per ciascuna delle 8 stagioni su 27 in cui il #1
  su PIE non ha vinto.
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

## 8. Aggiornamento: verifica Box Plot promesso, PCP ora bidirezionale, pulizia mvp_score.js

Verificato di nuovo in Chrome reale (non dato per scontato, vista la lezione
dell'hover in §8-vecchia): il Box Plot fa davvero quello che la proposal
promette. Cliccando un candidato (es. Russell Westbrook 2011-12), il titolo
diventa "Russell Westbrook (2011-12) vs Vincitori — Transition", il box mostra
la distribuzione PIE dei vincitori reali dell'era (n=11), e una linea rossa
tratteggiata segna il PIE del candidato selezionato (0.145) — il confronto
"giocatore selezionato vs vincitori storici della sua era" richiesto, già
implementato in §5 e qui ri-confermato ancora funzionante dopo modifiche
esterne alla sessione.

Nel frattempo, fuori da questa sessione, è stato aggiunto un brush verticale
(`d3.brushY()`) su ciascun asse del PCP, collegato bidirezionalmente alla PCA
(`brushedPCP()` in `js/app.js`, commit `c159423 Aggiunta vertical brush PCP
plot`). Verificato: filtrare un asse del PCP dimmera correttamente anche i
punti della PCA. **L'item "coordinazione bidirezionale PCA↔PCP", che era la
priorità #1 rimasta aperta, risulta quindi risolto** (non da questa sessione,
ma confermato funzionante).

Effetto collaterale minore notato durante la verifica: ogni brush per asse
occupa una striscia di 24px (±12px) centrata sull'asse; un click esattamente
su quella striscia viene intercettato dal brush invece che dalla linea
sottostante (stesso principio, in scala ridotta, del brush della PCA).
Cliccare tra due assi funziona sempre — non bloccante, ma da tenere presente
in demo.

Rimosso anche `js/mvp_score.js` (comparso nella stessa ondata di commit,
referenziato in `index.html` ma mai realmente usato): definiva
`onVisualSelection()`, mai invocata da nessuna parte, che a sua volta chiamava
una funzione inesistente (`updateBoxPlot` — la funzione reale si chiama
`renderBoxPlot`). Era una copia della vecchia `Visual Analytics/mvp_score.js`.
Rimosso lo script e il suo `<script>` tag da `index.html`; verificato che la
dashboard carica ancora tutti i 9 grafici SVG senza errori in console.

## 9. Aggiornamento: WS mancante trattato come dato assente, non come 0

Corretto il bug segnalato nel §4 originale: `d.WS = +d.WS || 0` trasformava i
50/354 candidati con WS mancante (tutti Pre-Analytics, 1996-97–2000-01, fonte
Basketball-Reference incompleta) in un falso "Win Shares = 0", distorcendo
visivamente il PCP e falsando qualunque calcolo che usasse WS per quei
candidati. Corretto in `js/app.js` in quattro punti:

1. **Parsing**: `d.WS = d.WS === "" ? null : +d.WS` — `null`, non `0`.
2. **Asse PCP**: il dominio (`d3.extent`) ignora automaticamente i `null`,
   quindi il minimo dell'asse WS ora è il valore reale più basso (2) invece
   di essere trascinato a 0 dai falsi zeri.
3. **Polilinee PCP**: il generatore di linea ora usa `.defined()` per creare
   un'interruzione onesta nei 50 candidati senza WS, invece di attraversare
   un punto inventato. Verificato: esattamente 50 polilinee mostrano
   un'interruzione (contate via numero di comandi `M` nel path).
4. **MVP Score dinamico e rank al click**: un candidato con WS mancante non
   viene più penalizzato come se avesse WS=0 — il termine viene escluso e i
   pesi ridistribuiti sulle metriche disponibili (`computeDynamicMVPScore`);
   il rank su WS mostra onestamente "N/D" invece di un numero falsato
   (`computeSeasonRanks`). Verificato: cliccando Gary Payton (1996-97) la
   sidebar mostra "WS non disponibile per questa stagione" invece di un rank.

Verificate tutte le 21 colonne numeriche del CSV: solo `WS` e `WS48` (stesse
50 righe) hanno valori mancanti; `WS48` non è comunque usato da nessuna parte
nel codice. La correzione non serve altrove.

## 10. Aggiornamento: Line Chart — statistica selezionabile, marcatore, regressione on demand

Chiuso l'ultimo gap tra proposal e implementazione: la terza analytics
promessa ("Linear regression is computed on demand to quantify statistical
trends across seasons and eras") esisteva solo come script offline
(`Visual Analytics/compute_mvp_model.py`), mai richiamata dalla dashboard.
Riprogettata la Line Chart con tre interazioni visive (nessun menu/radio
button, coerente col vincolo d'esame):

1. **Click su un'etichetta d'asse del PCP** ("PTS", "PIE", "WS"...) cambia la
   statistica mostrata dalla Line Chart — sostituisce il selettore a tendina
   che la proposal implicava, riusando un elemento visivo già esistente
   invece di introdurre un widget.
2. **Selezione di un candidato altrove** (PCA, PCP, grafico fatigue) marca la
   sua stagione sulla Line Chart con un punto e una linea tratteggiata,
   confrontandolo visivamente con la media di lega — il "confronto vs media
   di lega" richiesto dalla proposal, riusando la selezione già esistente
   invece di una quarta interazione nuova.
3. **Brush orizzontale sulla timeline** calcola on demand una regressione
   lineare (minimi quadrati, implementata a mano) solo sul periodo
   trascinato, disegnando la retta di tendenza con pendenza e R² — finalmente
   collega la regressione allo strumento interattivo.

Esempio verificato in Chrome reale: selezionata la statistica PIE, selezionato
Steve Nash (2005-06) dal grafico fatigue (marcatore a 0.17), poi trascinato un
brush su 2012-13/2022-23 → "Trend in crescita: +0.002/stagione (R²=0.62)",
coerente con l'§2.1 (PIE più affidabile nell'era Small-Ball).

Corretta anche una piccola incoerenza collegata: il brush verticale del PCP
(aggiunto fuori da questa sessione, §8) non azzerava lo stato "candidato
selezionato" come già faceva il brush della PCA — aggiunta la stessa chiamata
(`resetCandidateFocus()`) per coerenza, altrimenti il marcatore sulla Line
Chart sarebbe rimasto incoerente dopo un brush sugli assi del PCP.

## 11. Aggiornamento: revisione pre-esame (punti aperti chiusi)

Correzioni emerse dalla revisione complessiva del progetto, in ordine di
priorità.

**Metodologia**
1. **Varianza spiegata visibile**: le etichette degli assi della PCA ora
   riportano la varianza di ciascuna componente (PC1 25,5%, PC2 20,0%,
   cumulata 45,5%), letta da `data/pca_meta.json` e non scritta a mano.
2. **`Team_W_PCT` rimosso dagli input della PCA**
   (`Visual Analytics/compute_pca.py`): è contesto di squadra, non merito
   individuale, e la domanda del progetto è proprio separare le due cose. Il
   record di squadra resta come asse del PCP. Effetto sulla proiezione
   minimo (correlazione 0,999 con le coordinate precedenti), varianza
   cumulata +1,7 punti. Il segno delle componenti è ora fissato (PC1 positivo
   = REB, PC2 positivo = PTS), così le etichette "guardie ↔ lunghi" e "volume
   offensivo" restano valide se si rigenera la PCA.
3. **Pesi dell'MVP Score stimati dai dati**, non più scelti a mano
   (prima 0.35/0.30/0.20/0.10/0.05). `mvp_score_weights()` in
   `analysis/mvp_merit_analysis.py`: Ridge su z-score, target MVP_Share,
   coefficienti vincolati ≥ 0, normalizzati a somma 1 (R² = 0,523, n = 304
   candidati con WS disponibile). Risultato: **PIE 37% · Team_W_PCT 26% ·
   WS 25% · PTS 12% · TS_PCT 0%**. Senza vincolo TS_PCT prende un peso
   negativo solo per collinearità con PIE ("tirare meglio abbassa il
   punteggio"), da cui il vincolo. I pesi sono mostrati nella sidebar.
4. **Titolo della Line Chart corretto**: mostrava "vs League Average", ma la
   media è calcolata sui soli candidati MVP (il dataset non contiene l'intera
   lega).
5. **Esempio di "snobbato" corretto** in §5 (Westbrook 2011-12 non era #1 su
   PIE e quindi non veniva segnalato dal codice; sostituito con Garnett
   2004-05).

**Interazione**
6. **Sidebar all'avvio**: mostrava le prime 5 righe del CSV (candidati
   1996-97). Ora mostra la Top 5 dello score calcolato su tutti i candidati,
   con titolo che indica se lo score è su tutto il dataset o sulla selezione.
7. **Filtri combinati**: brush sulla PCA, brush sugli assi del PCP e filtro
   per era (click sul grafico di affidabilità) ora scrivono in un unico stato
   (`filters` in `js/app.js`) e la selezione è la loro **intersezione**,
   applicata da `applyFilters()` a tutte le viste (dimming, Line Chart, Box
   Plot, MVP Score). Prima ogni filtro sovrascriveva gli altri e il filtro
   per era dimmerava soltanto, senza aggiornare grafici e score. Aggiunto un
   link "↺ azzera tutti i filtri" nella sidebar.
8. **Tooltip sulla PCA (era il punto aperto "hover-pop")**: la causa era la
   stessa già documentata per il click in §5 — l'overlay del brush sta sopra
   i punti e intercetta tutti gli eventi del puntatore, quindi un
   `mouseenter` sui singoli punti non scatta mai (i test headless passavano
   perché sintetizzavano l'evento direttamente sul nodo). Ora il tooltip è
   gestito da un `mousemove` sull'overlay, con ricerca del punto più vicino;
   il punto sotto il cursore viene evidenziato. Tooltip aggiunto anche alle
   linee del PCP.
9. **Box Plot collegato alla statistica attiva**: cliccando un'etichetta del
   PCP cambiano sia la Line Chart sia il Box Plot (per era, oppure
   candidato vs vincitori della sua era). Valori mancanti (WS) gestiti e
   numerosità `n` mostrata per ogni era.
10. **Resize**: i grafici vengono ridisegnati al cambio di larghezza della
    finestra (si conservano filtro per era e candidato selezionato; i brush
    vengono azzerati).

**Repository**
11. Rimossi gli script e gli output obsoleti/incoerenti (vedi README per la
    pipeline aggiornata).

Verificato in Chromium headless (Playwright) con mouse reale: brush PCA →
brush PCP → filtro era (intersezione 73 → 40 → 9 candidati), cambio
statistica, reset, hover e click su Steve Nash, resize; nessun errore in
console.

## 12. Ristrutturazione attorno all'analisi merito vs narrativa

- Rimossi dalla dashboard i 3 grafici del modulo Insights (affidabilità,
  voter fatigue, effetto-soglia) e i relativi callout: non previsti dalla
  proposal e causa dello scroll della pagina (penalità d'esame). I loro
  risultati sono ora figure statiche (`analysis/make_figures.py`) e scenari
  della demo in `INSIGHTS_REPORT.md`, ritrovabili con l'interazione.
- Nuova analytics innescata dall'interazione: ogni brush o filtro per era
  ristima in JS il modello `Share ~ z(PIE) + z(Team_W_PCT)` sulla selezione
  (`fitVoteModel`), con pannello e lettura automatica nella sidebar.
- Nuovi assi del PCP: Share e Narrativa (share reale − attesa).
- Line Chart conforme alla proposal: MVP reale vs vera media di lega
  (`data1/scripts/league_averages.py`), con marcatori delle stagioni in cui
  l'MVP non era la scelta statistica.
- Filtro per era spostato su legenda e Box Plot; collegamento in PCA tra MVP
  reale e scelta statistica della stagione del candidato selezionato.
- Layout a schermo intero, senza scroll fino a 1280×800.

## 13. Evidenza visiva nei grafici, non nel testo

- Line Chart: vista iniziale "Share attesa: MVP reale vs scelta statistica"
  con segmenti rossi per gli MVP controcorrente e fascia verde per il periodo
  senza (calcolata dai dati).
- PCP: nuovo asse *Attesa*; il tratto Attesa → Reale è colorato blu/rosso in
  base al segno della narrativa.
- Box Plot: sotto ogni era, barre del peso del merito, del record e dell'R²
  del modello ristimato sulla selezione.
- PCA: bussola del biplot (loadings di PTS, PIE, AST, REB) e anelli
  blu/rossi sui 3 candidati più sopra/sotto le statistiche.
- Sidebar (approfondimento): frasi sostituite da mini-grafici (barre
  selezione vs tutti, dumbbell atteso → reale, striscia della stagione, barre
  divergenti, MVP Score a barre), con una riga di dettaglio testuale.

## 14. Semplificazione

Un messaggio per grafico. Rimossi: bussola del biplot, anelli e annotazione
fissa sulla PCA; assi TS%, WS e Narrativa dal PCP (7 assi, narrativa resa dal
colore del tratto Attesa → Reale); fascia verde e triangoli duplicati nella
vista iniziale della Line Chart; stelle sopra i box e barra dell'R² sotto le
ere (R² nel tooltip e nella sidebar); barra "share media" dalla sidebar.
Descrizioni delle card ridotte a una riga.

## 15. Guardie vs lunghi e robustezza

- `position_effect()` e `robustness_ws()` in `mvp_merit_analysis.py`;
  figure 6 (PCA con frecce) e 7 (PIE vs WS) in `make_figures.py`.
- PCA: frecce dalla scelta statistica all'MVP reale per gli MVP
  controcorrente (seguono il dimming dei filtri) e linea PC1 = 0.
- Report: nuovo Insight 3 (guardie vs lunghi), Insight 1 riformulato alla
  luce del controllo con WS, sezione 2bis sulla robustezza.

## 16. Vista espansa dei grafici

Pulsante ⤢ in alto a destra di PCA, PCP, Line Chart e Box Plot: la card si
apre quasi a schermo intero (modale con sfondo scuro semitrasparente) e il
grafico viene ridisegnato alla nuova dimensione (`setupExpandableCards`,
`toggleExpand`, `rerenderCard` in `js/app.js`). Chiusura con ✕, click sullo
sfondo o Esc. Filtri delle altre viste e candidato selezionato restano
attivi; il brush della vista ridisegnata (PCA o PCP) viene azzerato.
