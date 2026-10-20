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
| **Share attesa** | voto previsto dal modello | asse *Attesa* del PCP, Line Chart (vista iniziale) |
| **Narrativa** | share reale − share attesa | colore del tratto Attesa → Reale nel PCP (blu sale, rosso scende), barre divergenti della sidebar |
| **Scelta statistica** | candidato con la share attesa più alta della stagione | tratteggio e segmenti rossi nella Line Chart, collegamento in PCA al click |

Un **MVP controcorrente** è una stagione in cui ha vinto un candidato diverso
dalla scelta statistica, con uno scarto di share attesa ≥ 0,15. Sotto questa
soglia il caso è trattato come un quasi pari merito.

**Analytics innescata dall'interazione.** Ogni brush (PCA, assi del PCP) o
filtro per era (legenda, Box Plot) **ristima il modello del voto sulla sola
selezione**. Il risultato è disegnato sotto ogni era del Box Plot (barre del
peso del merito e del record) e, nella sidebar di approfondimento, come barre
"selezione" (pesi, R², quota di voti quasi nulli) con la tacca del modello su
tutti i candidati.

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
quelli da **lungo** (PC1 > 0: rimbalzi, stoppate). Disegnando nella PCA una
freccia dalla scelta statistica all'MVP reale per ogni MVP controcorrente:

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
Attesa → Reale diventano quasi tutti rossi e cadono verso lo 0, e nel modello
ristimato su questo gruppo la barra del peso del merito sparisce (conta solo il
record di squadra).

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

Il candidato più snobbato del dataset è **Kevin Durant 2016-17** (narrativa
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

Ogni scenario parte da "↺ azzera tutti i filtri". Ogni grafico porta **un
solo messaggio**; la sidebar è il pannello di approfondimento (dettagli e
valori). Nelle slide vanno obiettivo, dati e visualizzazioni; l'interazione si
mostra solo nella demo.

| Insight | Prova visiva | Grafico |
|---|---|---|
| 1 | segmenti rossi (scarto MVP reale → scelta statistica) lunghi solo tra il 1997 e il 2011 | Line Chart (vista iniziale) |
| 2 | sotto ogni era la barra scura del peso del merito si allunga, quella grigia del record resta uguale | Box Plot |
| 3 | le frecce rosse degli MVP controcorrente puntano tutte verso sinistra (da lunghi a guardie) | PCA |
| 4 | dopo il brush, i tratti Attesa → Reale diventano rossi e cadono verso lo 0 | PCP |
| caso Nash | linea tratteggiata da Nash a Duncan; nella sidebar la ★ di Nash lontana dall'anello della scelta statistica | PCA + sidebar |

**S1 — Quando il voto è andato contro le statistiche (Insight 1)**
- [ ] All'apertura, Line Chart: ★ = share attesa dell'MVP reale, tratteggio =
      scelta statistica. I 6 segmenti rossi lunghi stanno tutti prima del
      2011-12; dopo, ★ e tratteggio coincidono.
- [ ] Click su Nash 2004-05 nella PCA (stella in basso a sinistra): la PCA lo
      collega a Duncan; nella sidebar la stella di Nash è lontana a sinistra
      dell'anello della scelta statistica.

**S2 — Come votano le ere (Insight 2)**
- [ ] Box Plot senza filtri: da Pre-Analytics a Small-Ball la barra del peso
      del merito si allunga, quella del record no (valori nel tooltip).
- [ ] Click su *Small-Ball* in legenda: tutte le viste si filtrano; nella
      Line Chart le stagioni dell'era non hanno segmenti rossi lunghi.

**S2bis — Guardie contro lunghi (Insight 3)**
- [ ] PCA senza filtri: le 6 frecce rosse vanno dalla scelta statistica
      (cerchio) all'MVP reale (stella), e 5 su 6 attraversano la linea
      tratteggiata da destra verso sinistra.
- [ ] Click su *Transition* in legenda: restano accese 3 frecce (Nash
      2005-06, Kobe 2007-08, Rose 2010-11), tutte verso sinistra.
- [ ] Click su *Small-Ball*: tutte le frecce si spengono (nessun MVP
      controcorrente nell'era) e le stelle accese stanno a destra o sulla
      linea tratteggiata (Giannis ×2, Jokic ×2, Embiid); in *Transition* quasi
      tutte stavano a sinistra.

**S3 — La soglia del 55% (Insight 4)**
- [ ] PCP: brush su PIE ≥ 0,17 e su W% ≤ 0,55.
- [ ] I tratti Attesa → Reale sono quasi tutti rossi e cadono a 0; nella
      sidebar la barra "Voto ≈ 0" supera la tacca di tutti i candidati.

**S4 — Chi ha preso più voti delle sue statistiche (Insight 1 e 5)**
- [ ] Sidebar, barre blu: Iverson 00-01, Rose 10-11, Bryant 07-08, tutti MVP
      controcorrente. Click su uno: nel PCP il suo tratto Attesa → Reale sale
      ripido.
- [ ] PCP: brush sull'asse *Reale* sopra 0,7 → restano quasi solo MVP, con
      tratti blu.

**S5 — Il superteam (Insight 6)**
- [ ] Sidebar, barre rosse: Durant 16-17; click → atteso alto, reale ~0.

**Facoltativo — regressione on demand**
- [ ] Click sull'etichetta *PIE* nel PCP, poi brush sulla timeline 2011–2023:
      retta di tendenza di MVP e media di lega.

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
   segnala che la stima è indicativa. Le differenze tra ere dell'Insight 2
   sono accompagnate da intervalli bootstrap; la crescita della share attesa
   media dei vincitori dopo il 2011 (0,46 → 0,59) **non** è significativa da
   sola (Mann-Whitney p = 0,18), quindi l'Insight 1 si basa sulla presenza o
   assenza di MVP controcorrente, non su quella media.
