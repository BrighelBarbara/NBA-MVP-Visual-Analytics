# Report: "Chi vince l'MVP se lo merita davvero?"

Base per la sezione **Discovered insights** del paper e per le slide.
Dataset: `data/mvp_candidates_pca.csv`, 354 candidati MVP su 27 stagioni
(1996-97 → 2022-23). Tutti i numeri sono riproducibili:

```
python3 analysis/mvp_merit_analysis.py   # -> data/insights/insights.json
python3 analysis/make_figures.py         # -> analysis/figures/*.png
```

La dashboard ricalcola dal vivo gli stessi modelli (stessi coefficienti,
verificati: R² globale 0,459 sia in Python sia in `js/app.js`), quindi ogni
insight qui sotto si **ritrova interagendo** con il sistema (§4, scenari della
demo). Lo storico tecnico delle modifiche è in `analysis/CHANGELOG.md`.
L'interfaccia della dashboard è in inglese: le etichette citate qui sono
riportate come compaiono a schermo, in *corsivo*.

---

## 1. Metodo: separare merito e narrativa

Non esistono dati sulla copertura mediatica, quindi la "narrativa" è misurata
in modo **indiretto e dichiarato**, come parte del voto che le statistiche non
spiegano.

**Modello del voto.** Regressione lineare
`MVP_Share ~ z(PIE) + z(Team_W_PCT)` sui 354 candidati:
- **PIE** (Player Impact Estimate) = merito individuale. È la singola
  statistica che più spesso indica il vincitore (70% delle stagioni, Fig. 5);
- **Team_W_PCT** = contesto di squadra;
- z-score calcolati sull'intero dataset, così i coefficienti stimati su
  sottoinsiemi diversi (ere, selezioni) sono **confrontabili**.

Da qui tre grandezze, per ogni candidato o stagione:

| Grandezza | Definizione | Dove si vede |
|---|---|---|
| **Share attesa** (*Expected share*) | voto previsto dal modello | asse *Expected* del PCP, Line Chart (vista iniziale) |
| **Narrativa** (*Narrative*) | share reale − share attesa | colore del tratto *Expected → Actual* nel PCP (viola = sopra l'atteso, arancione = sotto; legenda *Votes received*), lista *Largest gaps from expected vote* nella sidebar, pannello del giocatore (*"+36 points above expected"*), 4° box del Box Plot (§2ter) |
| **Scelta statistica** (*Statistical pick*) | candidato con la share attesa più alta della stagione | linea tratteggiata nella Line Chart (distanza dalle ★ degli MVP reali), collegamento in PCA al click, verdetto nel pannello del giocatore |

Un **MVP controcorrente** è una stagione in cui ha vinto un candidato diverso
dalla scelta statistica, con uno scarto di share attesa ≥ 0,15. Sotto questa
soglia il caso è trattato come un quasi pari merito. Nel pannello del
giocatore il verdetto corrispondente è *"MVP over the statistical pick"*;
il caso opposto (scelta statistica che non vince) è *"Statistical pick, not
elected"*.

**Analytics innescata dall'interazione.** Ogni brush (PCA, assi del PCP) o
filtro per era (click su un box del Box Plot) **ristima il modello del voto sulla sola
selezione**. Il risultato è nel pannello *How the selection is voted* della
sidebar: quattro barre per la selezione (*Merit weight (PIE)*, *Team weight
(W%)*, *Fit to stats (R²)*, *Vote share < 10%*) con la tacca del modello su
tutti i candidati. Un secondo calcolo è attivato dal brush sulla timeline
della Line Chart: una regressione lineare sul periodo selezionato, con
pendenza e R² sotto il grafico (*"weak trend"* se R² < 0,3).

---

## 2. Insight scoperti

### Insight 1 — Gli MVP "di narrativa" diventano più rari e più piccoli, non più frequenti

*Ipotesi di partenza (diffusa nel dibattito sportivo): con i social media il
voto è diventato più narrativo. I dati dicono il contrario.*

La scelta statistica ha vinto l'MVP in **19 stagioni su 27**. I **6 MVP
controcorrente** cadono tutti tra il 1997 e il 2011:

| Stagione | MVP reale (share attesa) | Scelta statistica (share attesa) | Scarto |
|---|---|---|---|
| 1997-98 | Michael Jordan (35%) | Karl Malone (54%) | 0,19 |
| 2000-01 | Allen Iverson (17%) | Shaquille O'Neal (37%) | 0,20 |
| 2004-05 | Steve Nash (19%) | Tim Duncan (55%) | **0,36** |
| 2005-06 | Steve Nash (23%) | Dirk Nowitzki (54%) | 0,31 |
| 2007-08 | Kobe Bryant (19%) | Kevin Garnett (54%) | 0,35 |
| 2010-11 | Derrick Rose (29%) | LeBron James (50%) | 0,21 |

Dal 2011-12 in poi, per **12 stagioni consecutive**, ha sempre vinto la
scelta statistica o un quasi pari merito. Le uniche due stagioni recenti non
coerenti sono Jokic/Embiid 2020-21 (scarto 0,11) e Embiid/Jokic 2022-23
(0,02), entrambe sotto la soglia.

**Robustezza (§2bis).** Con WS al posto di PIE come misura del merito, i tre
casi più netti (Nash 2005, Nash 2006, Kobe 2008) restano MVP controcorrente.
Dopo il 2011 compaiono due casi di stretta misura, Westbrook 2016-17 (contro
Harden) ed Embiid 2022-23 (contro Jokic), entrambi con scarto 0,16. La
formulazione corretta è quindi: lo **scarto medio** tra MVP e scelta
statistica crolla dopo il 2011, da 0,124 a 0,011 con PIE e da 0,075 a 0,026
con WS (stagioni 2001–2023). Gli MVP controcorrente non spariscono del tutto,
ma diventano rari e piccoli.

> Fig. 1 — `analysis/figures/fig1_mvp_vs_scelta_statistica.png`

### Insight 2 — Cosa è cambiato: il merito individuale pesa di più, il record di squadra no

Stimando il modello separatamente per era (coefficienti standardizzati, IC
95% bootstrap con 2000 ricampionamenti):

| Era | Peso PIE | Peso record di squadra | R² |
|---|---|---|---|
| Pre-Analytics (1996–2004) | 0,132 [0,091; 0,175] | 0,075 [0,033; 0,122] | 0,39 |
| Transition (2005–2015) | 0,176 [0,141; 0,208] | 0,099 [0,063; 0,132] | 0,50 |
| Small-Ball (2016–2023) | **0,223** [0,178; 0,263] | 0,089 [0,041; 0,131] | **0,59** |

- Il peso del merito individuale cresce del **69%**: differenza
  Small-Ball − Pre-Analytics = +0,091, IC 95% [0,029; 0,150], P(Δ ≤ 0) = 0,002.
- Il peso del record di squadra resta **costante**: i votanti non hanno smesso
  di premiare chi vince, hanno iniziato a premiare di più chi domina.
- La quota di voto spiegata dalle statistiche sale dal 39% al 59%.

È il meccanismo dietro l'Insight 1: un voto più ancorato a una misura di
impatto individuale lascia meno spazio a candidature costruite sul racconto
della stagione.

> Fig. 2 — `analysis/figures/fig2_pesi_voto_per_era.png`

### Insight 3 — La "narrativa" premiava le guardie a scapito dei lunghi (ed è finita)

È l'insight che collega la PCA alla domanda del progetto. PC1 separa i
profili da **guardia/esterno** (PC1 < 0: assist, tiro da 3, contropiede) da
quelli da **lungo** (PC1 > 0: rimbalzi, stoppate). Collegando nella PCA la
scelta statistica all'MVP reale per ogni MVP controcorrente (frecce in Fig. 6;
nella dashboard, linea tratteggiata al click su un candidato):

| Stagione | Scelta statistica (PC1) | → MVP reale (PC1) |
|---|---|---|
| 1997-98 | Karl Malone (+0,7) | Michael Jordan (−1,0) |
| 2000-01 | Shaquille O'Neal (+4,1) | Allen Iverson (−3,7) |
| 2004-05 | Tim Duncan (+3,9) | Steve Nash (−1,7) |
| 2005-06 | Dirk Nowitzki (+0,2) | Steve Nash (−1,6) |
| 2007-08 | Kevin Garnett (+3,0) | Kobe Bryant (−1,8) |
| 2010-11 | LeBron James (−1,9) | Derrick Rose (−2,2) |

**In 5 casi su 6 il voto si sposta da un lungo a una guardia**; l'eccezione
(Rose contro LeBron) è tra due esterni. Su tutti i 354 candidati:

| | Guardie (PC1 < 0) | Lunghi (PC1 ≥ 0) | Differenza | p (Welch) |
|---|---|---|---|---|
| Tutte le ere | +0,028 (n=213) | −0,042 (n=141) | +0,070 | 0,002 |
| Pre-Analytics | | | +0,071 | 0,09 |
| Transition | | | **+0,120** | **< 0,001** |
| Small-Ball | | | +0,027 | 0,56 |

(valori = narrativa media, share reale − attesa)

- Il premio di narrativa per le guardie è **forte nell'era Transition**, in cui
  10 MVP su 11 sono guardie o esterni, e coincide con il periodo degli MVP
  controcorrente.
- Nell'era Small-Ball il premio **sparisce** (differenza non significativa) e
  tornano a vincere i lunghi: 3 MVP su 7 hanno profilo da lungo (Giannis ×2,
  Jokic 2021-22), e Jokic 2020-21 ed Embiid 2022-23, due centri, cadono sulla
  linea (PC1 ≈ 0) perché il loro gioco include molti passaggi. Nell'era
  Transition era 1 su 11. Ironia del nome: proprio l'era "small-ball" riporta
  l'MVP ai lunghi, perché le statistiche d'impatto, ora pesate di più
  (Insight 2), li valorizzano.
- La correlazione tra PC1 e narrativa è debole (−0,17): il ruolo spiega una
  parte della narrativa, non tutta.

> Fig. 6 — `analysis/figures/fig6_pca_spostamento_guardie.png`

### Insight 4 — Sotto il 55% di vittorie il merito individuale non basta

Tra i 135 candidati già statisticamente da MVP (top 5 su PIE nella propria
stagione), la quota con voto quasi azzerato (share < 10%) in base al record
di squadra:

| Record di squadra | n | Voto crollato | Share media |
|---|---|---|---|
| < 55% | 19 | **89,5%** | 0,068 |
| 55–65% | 34 | 32,4% | 0,283 |
| ≥ 65% | 82 | 18,3% | 0,512 |

L'ipotesi iniziale (soglia al 60–65%, nata da 4 casi aneddotici: Garnett,
Nowitzki, Nash, Curry) è stata **corretta** dalla verifica sul campione
completo: il fenomeno era giusto, il punto di rottura no. Nella dashboard si
vede filtrando nel PCP i candidati con PIE alto e record sotto il 55%: i tratti
*Expected → Actual* diventano quasi tutti arancioni e cadono verso lo 0, e nel
modello ristimato su questo gruppo (n = 21) la barra *Merit weight* sparisce
(0,009 contro 0,165 su tutti), *Fit to stats* scende a 0,06 e *Vote share <
10%* sale all'86%: conta solo il record di squadra.

> Fig. 3 — `analysis/figures/fig3_soglia_record_squadra.png`

### Insight 5 — L'MVP uscente riceve un bonus di fiducia, salvo crollo della squadra

Per i 23 candidati che avevano vinto l'MVP l'anno prima, la narrativa media è
**+0,111** contro −0,008 per tutti gli altri: in media un *bonus*, non la
"voter fatigue" spesso citata. La media nasconde due gruppi opposti:

| Bonus (narrativa più alta) | Crollo (narrativa più bassa) |
|---|---|
| Steve Nash 2005-06: +0,51 | Kevin Garnett 2004-05: −0,41 |
| Steve Nash 2006-07: +0,48 | Dirk Nowitzki 2007-08: −0,25 |
| Stephen Curry 2015-16: +0,37 | Russell Westbrook 2017-18: −0,20 |

Garnett e Nowitzki hanno un PIE quasi invariato rispetto all'anno dell'MVP
(−4%, −12%), ma la squadra scende al 54% e al 64% di vittorie, le due fasce
in cui il voto dei candidati forti crolla nell'89% e nel 32% dei casi
(Insight 4), e il loro voto va a zero. Nash vince due volte di fila senza
essere la scelta statistica di nessuna delle due stagioni: è il caso più
solido di voto guidato dalla reputazione.

> Fig. 4 — `analysis/figures/fig4_mvp_uscenti.png`

### Insight 6 — Due stelle nella stessa squadra si dividono (e perdono) il voto

Il candidato con la narrativa più negativa del dataset è **Kevin Durant 2016-17** (narrativa
−0,48, share 0,2%): è la stagione del suo arrivo ai Warriors. Nella stessa
stagione anche il voto di Curry, MVP uscente all'unanimità, crolla (share
1,00 → 0,05, narrativa −0,20). Il divario di utilizzo offensivo tra Curry e il
secondo violino passa da 0,130 (Draymond Green, 2015-16) a 0,015 (Durant): i
votanti non premiano nessuno dei due protagonisti di un superteam.
È un **caso singolo**: va presentato come esempio, non come regola (vedi
limiti).

### Caso di studio — Steve Nash 2004-05, il vincitore più anomalo

Il vincitore con il rank peggiore su PIE + WS tra i candidati della propria
stagione (individuato in modo algoritmico): 11°/16 su PIE, 11°/16 su WS, ma
1°/16 per record di squadra. Share attesa 19%, reale 84% (narrativa +0,65);
la scelta statistica era Tim Duncan (55%). Lo stesso anno il candidato 1° su
PIE, Kevin Garnett, prende l'1,2% dei voti. Nella dashboard, cliccando Nash
nella PCA, una linea tratteggiata lo collega a Duncan.

### 2bis. Controllo di robustezza: WS al posto di PIE

Lo stesso modello è stato ristimato con **WS** (Win Shares) come misura del
merito individuale, sulle 22 stagioni in cui tutti i candidati hanno WS
(2001-02 → 2022-23; R² = 0,39).

| Verifica | Con PIE | Con WS | Regge? |
|---|---|---|---|
| Stessa scelta statistica | — | 18/22 stagioni | sì |
| MVP controcorrente 2005–2008 (Nash ×2, Kobe) | sì | sì | **sì** |
| Rose 2010-11 | 0,21 | 0,09 (sotto soglia) | no |
| MVP controcorrente dopo il 2011 | nessuno | Westbrook 2016-17, Embiid 2022-23 (0,16) | in parte |
| Scarto medio MVP–scelta, fino al 2010 → dal 2011 | 0,124 → 0,011 | 0,075 → 0,026 | **sì** |
| Peso del merito per era (Pre → Trans → Small) | 0,13 → 0,18 → 0,22 | 0,10 → 0,17 → 0,21 | **sì** |
| Peso del record per era | 0,08 → 0,10 → 0,09 | 0,06 → 0,07 → 0,07 | **sì** (piatto) |

**Lettura.** Le conclusioni principali (merito sempre più pesante, record
costante, scarto medio in forte calo) non dipendono dalla metrica scelta. La
frase "nessun MVP controcorrente dopo il 2011" vale solo con PIE: con WS
compaiono due casi di stretta misura. Per questo l'Insight 1 parla di MVP
controcorrente "più rari e più piccoli".

> Fig. 7 — `analysis/figures/fig7_robustezza_pie_ws.png`

### 2ter. La narrativa nel Box Plot (4° box)

Accanto ai tre box per era (statistica attiva, PIE di default) il Box Plot ha
un **quarto box** con la distribuzione della **Narrativa = share reale −
share attesa** dei candidati selezionati.

**Scelte di progetto.**
- **Un solo box per due share.** La richiesta era un boxplot che mostrasse la
  share, che i tre box per era non mostrano. Share attesa e reale sono
  sintetizzate in un **valore derivato**, la loro differenza (il boxplot stesso
  è un "derived value", teoria p. 263; "deriving new values from the dataset
  for ad-hoc visualization", p. 406). È un grafico di **deviazione** (p. 173):
  la baseline è la share attesa, la linea dello 0 indica "votato quanto
  previsto dalle statistiche".
- **Asse proprio.** Unità diversa dalla statistica delle ere, quindi una vista
  affiancata con scala indipendente, non un doppio asse sovrapposto ("shared
  for comparability or independent for clarity", pratica P07, slide 9 e 19).
- **Dominio fisso** sull'intero dataset (da −0,48 a +0,73): con i filtri si
  sposta il box, non l'asse, così selezioni diverse restano confrontabili.
- **Viste coordinate.** Il box si ricalcola a ogni brush (PCA, PCP) e filtro
  per era. Con un filtro attivo, dietro resta il **box dell'intero dataset**
  (solo contorno grigio, mediana tratteggiata): il sottoinsieme si legge
  sempre rispetto al totale (multiple coordinated views, teoria pp. 322–325).
- **Forma standard** (teoria pp. 263–264): quartili, baffi all'ultimo dato
  entro 1,5×IQR, outlier in colonna sull'asse del box, affiancati solo se si
  sovrapporrebbero.

**Cosa mostra** (mediana; IQR; quota di candidati sopra lo 0):

| Selezione | n | Mediana | IQR | Sopra lo 0 |
|---|---|---|---|---|
| Tutti i candidati | 354 | −0,037 | −0,145 / +0,116 | 42% |
| Era Pre-Analytics | 113 | **+0,015** | −0,107 / +0,187 | 51% |
| Era Transition | 153 | −0,039 | −0,139 / +0,099 | 42% |
| Era Small-Ball | 88 | **−0,069** | −0,194 / +0,056 | 32% |
| Guardie (PC1 < 0) | 213 | −0,016 | −0,116 / +0,128 | — |
| Lunghi (PC1 ≥ 0) | 141 | **−0,080** | −0,164 / +0,081 | — |
| Alto volume offensivo (PC2 > 1) | 118 | −0,010 | **−0,193 / +0,231** | 49% |
| Basso volume (PC2 < −1) | 111 | −0,016 | −0,100 / +0,073 | 47% |
| MVP reali | 27 | **+0,318** | +0,259 / +0,512 | 100% |

**Lettura.**
- **Ere (conferma visiva degli Insight 1 e 2).** Con la sola share le tre ere
  sembrano uguali (mediane 2–5%, perché ogni stagione distribuisce lo stesso
  totale di punti). Con la narrativa la mediana scende da Pre-Analytics a
  Small-Ball e la quota di candidati votati sopra le statistiche passa dal 51%
  al 32%: il voto è sempre più ancorato al merito misurato.
- **Ruolo (conferma dell'Insight 3).** Il box dei lunghi sta più in basso di
  quello delle guardie (mediana −0,080 contro −0,016), coerente con le medie
  dell'Insight 3 (+0,028 contro −0,042).
- **Volume offensivo.** Per i candidati ad alto volume la mediana è circa 0 (il
  modello prevede bene la loro share, attesa mediana 33%), ma l'IQR è il più
  largo di tutti: tra i candidati "da MVP" la narrativa non sposta il voto in
  media, **decide chi sale e chi scende**.
- **MVP reali.** Tutti sopra lo 0 (mediana +0,32): effetto del modello lineare
  su una variabile limitata, vedi Limite 2 (§5).

---

## 3. Figure per report e slide

| Figura | Insight | File |
|---|---|---|
| MVP reale vs scelta statistica, 1996–2023 | 1 | `fig1_mvp_vs_scelta_statistica.png` |
| Pesi del voto per era con IC 95% | 2 | `fig2_pesi_voto_per_era.png` |
| Crollo del voto per fascia di record | 4 | `fig3_soglia_record_squadra.png` |
| Narrativa degli MVP uscenti | 5 | `fig4_mvp_uscenti.png` |
| Affidabilità delle singole statistiche | metodo (§1) | `fig5_affidabilita_metriche.png` |
| PCA: frecce scelta statistica → MVP controcorrente | 3 | `fig6_pca_spostamento_guardie.png` |
| Robustezza PIE vs WS | 2bis | `fig7_robustezza_pie_ws.png` |

---

## 4. Scenari della demo (checklist)

Ogni scenario parte da *"↺ clear all filters"* (o `Esc`). Ogni grafico porta **un
solo messaggio**; la sidebar è il pannello di approfondimento (dettagli e
valori). Nelle slide vanno obiettivo, dati e visualizzazioni; l'interazione si
mostra solo nella demo.

| Insight | Prova visiva | Grafico |
|---|---|---|
| 1 | distanza grande tra ★ (MVP reale) e tratteggio (scelta statistica) solo tra il 1997 e il 2011 | Line Chart (vista iniziale) |
| 2 | filtrando un'era alla volta, nella sidebar la barra *Merit weight* si allunga da Pre-Analytics a Small-Ball, *Team weight* resta uguale | Box Plot + sidebar |
| 3 | cliccando un MVP controcorrente, la linea tratteggiata lo collega a una scelta statistica più a destra (da lunghi a guardie); con il brush sulle guardie le ★ piene della Line Chart si concentrano nell'era Transition | PCA + Line Chart |
| 4 | dopo il brush, i tratti *Expected → Actual* diventano arancioni e cadono verso lo 0 | PCP + sidebar |
| caso Nash | linea tratteggiata da Nash a Duncan; nel pannello del giocatore *"+65 points above expected"* e il verdetto *MVP over the statistical pick (Tim Duncan)* | PCA + sidebar |
| 2ter | filtrando le ere una alla volta, la mediana del 4° box (narrativa) passa da sopra a sotto quella del box grigio di riferimento, da Pre-Analytics a Small-Ball; con il brush sui lunghi il box sta più in basso che sulle guardie | Box Plot (4° box) |

**S1 — Quando il voto è andato contro le statistiche (Insight 1)**
- [ ] All'apertura, Line Chart: ★ = share attesa dell'MVP reale, tratteggio =
      scelta statistica. I 6 scarti grandi tra ★ e tratteggio stanno tutti
      prima del 2011-12; dopo, ★ e tratteggio coincidono.
- [ ] Click su Nash 2004-05 nella PCA (stella in basso a sinistra): la PCA lo
      collega a Duncan; nel pannello del giocatore la riga *vote* va da 19% a
      84% (*"+65 points above expected"*) e nella riga *season, expected* la ★
      di Nash sta a sinistra di molti altri candidati della stagione.

**S2 — Come votano le ere (Insight 2)**
- [ ] Click sul box di ogni era, una alla volta: nella sidebar (*How the
      selection is voted*) da Pre-Analytics a Small-Ball la barra *Merit
      weight* si allunga (0,13 → 0,18 → 0,22) e *Fit to stats (R²)* sale
      (0,39 → 0,50 → 0,59); *Team weight* resta circa uguale (valori nel
      tooltip).
- [ ] Click sul box *Small-Ball* nel Box Plot: tutte le viste si filtrano;
      nella Line Chart, nelle stagioni dell'era ★ e tratteggio quasi
      coincidono.

**S2bis — Guardie contro lunghi (Insight 3)**
- [ ] PCA senza filtri: click uno alla volta sui 6 MVP controcorrente
      (stelle). La linea tratteggiata li collega alla scelta statistica della
      stagione: in 5 casi su 6 la scelta statistica sta più a destra (lunghi)
      e l'MVP reale a sinistra della linea verticale PC1 = 0 (guardie).
- [ ] Click sul box *Transition* nel Box Plot: nella PCA restano evidenziati
      i candidati dell'era; Nash 2005-06, Kobe 2007-08 e Rose 2010-11 stanno
      a sinistra della loro scelta statistica.
- [ ] Click sul box *Small-Ball*: nessun MVP controcorrente nell'era, e le
      stelle evidenziate stanno a destra o sulla linea PC1 = 0 (Giannis ×2,
      Jokic ×2, Embiid); in *Transition* quasi tutte stavano a sinistra.
- [ ] PCA: brush sulla metà sinistra (PC1 < 0, profilo da guardia). Nella
      Line Chart restano piene solo le ★ degli MVP selezionati e il titolo
      riporta *"MVPs in selection: 17/27"*: MVP guardie 3/9 in Pre-Analytics,
      10/11 in Transition, 4/7 in Small-Ball. Brush sulla metà destra (lunghi)
      per il quadro opposto.

**S2ter — La narrativa nel 4° box (§2ter)**
- [ ] Senza filtri: il 4° box (narrativa) ha la mediana poco sotto lo 0 e
      gli MVP come outlier in alto.
- [ ] Click sui box *Pre-Analytics*, poi *Small-Ball*: il 4° box (teal =
      selezione) riporta il nome dell'era sotto l'asse; in Pre-Analytics la
      mediana sta sopra quella del contorno grigio (*Full dataset*), in
      Small-Ball sotto.
- [ ] PCA: brush su PC1 > 0 (lunghi), poi su PC1 < 0 (guardie): il box dei
      lunghi sta più in basso.
- [ ] PCA: brush in alto (PC2 > 1): mediana vicino allo 0 ma box molto più
      largo del riferimento, cioè narrativa che decide tra i candidati forti.

**S3 — La soglia del 55% (Insight 4)**
- [ ] PCP: brush su PIE ≥ 0,17 e su W% ≤ 0,55.
- [ ] I tratti *Expected → Actual* sono quasi tutti arancioni e cadono a 0;
      nella sidebar *Merit weight* è quasi nullo (0,009), *Fit to stats (R²)*
      scende a 0,06 e *Vote share < 10%* (86%) supera la tacca di tutti i
      candidati (63%).

**S4 — Chi ha preso più voti delle sue statistiche (Insight 1 e 5)**
- [ ] Sidebar, lista *Largest gaps from expected vote*, barre viola: Iverson
      00-01, Rose 10-11, Bryant 07-08, tutti MVP controcorrente. Click su uno:
      nel PCP il suo tratto *Expected → Actual* sale ripido.
- [ ] PCP: brush sull'asse *Actual* sopra 0,7 → restano quasi solo MVP, con
      tratti viola.

**S5 — Il superteam (Insight 6)**
- [ ] Sidebar, lista *Largest gaps from expected vote*, barre arancioni:
      Durant 16-17; click → pannello del giocatore *"−48 points below
      expected"*.

**Facoltativo — regressione on demand**
- [ ] Click sull'etichetta *PIE* nel PCP, poi brush sulla timeline 2011–2023:
      rette di tendenza di MVP (continua) e media di lega (tratteggiata);
      pendenza per stagione e R² nelle due righe sotto il grafico, con
      *"weak trend"* se R² < 0,3.

---

## 5. Limiti da dichiarare

1. **La narrativa è un proxy.** È la parte di voto non spiegata da PIE e
   record di squadra, non una misura della copertura mediatica. Include anche
   tutto ciò che il modello non vede: difesa, infortuni, storia personale.
2. **Modello lineare su una variabile limitata [0, 1].** I vincitori hanno
   sempre una narrativa positiva (il modello non prevede mai share vicine a
   1). Per questo l'Insight 1 confronta le **share attese** (vincitore vs
   scelta statistica), non l'ampiezza dei residui dei vincitori.
3. **Un solo indicatore di merito individuale (PIE).** Scelto perché è il più
   affidabile tra quelli disponibili (Fig. 5); WS manca per 50 candidati
   Pre-Analytics.
4. **Solo candidati con almeno un voto.** Il dataset non contiene i
   giocatori senza voti, quindi l'Insight 6 è verificabile solo quando
   entrambe le stelle sono candidate (vero per Curry e Durant nel 2016-17; non
   per Westbrook e George nel 2017-18).
5. **Campioni piccoli.** Con selezioni sotto i 25 candidati la dashboard
   schiarisce le barre del modello (*"light bars = small sample"*); sotto i 6
   candidati il modello non viene stimato. Nella Line Chart la media della
   selezione è mostrata solo per le stagioni con almeno 2 candidati. Le differenze tra ere dell'Insight 2
   sono accompagnate da intervalli bootstrap; la crescita della share attesa
   media dei vincitori dopo il 2011 (0,46 → 0,59) **non** è significativa da
   sola (Mann-Whitney p = 0,18), quindi l'Insight 1 si basa sulla presenza o
   assenza di MVP controcorrente, non su quella media.
6. **Narrativa per era nel 4° box: lettura descrittiva.** La narrativa è
   calcolata con il modello globale (stessi coefficienti per tutte le ere).
   Lo spostamento del box tra le ere riflette anche il cambiamento dei pesi
   dell'Insight 2 e non è accompagnato da un test di significatività: va
   presentato come conferma visiva degli Insight 1–3, non come insight
   indipendente.
