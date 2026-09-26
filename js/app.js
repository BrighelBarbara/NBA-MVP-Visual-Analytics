// --- Costanti e Configurazione Colori ---
// Palette categoriale colorblind-safe (Okabe-Ito): la precedente
// (#1f77b4/#ff7f0e/#2ca02c) falliva la separazione protanopia tra
// arancione e verde (Delta E 0.7) alla validazione con dataviz/validate_palette.js.
const ERA_COLORS = {
    "Pre-Analytics": "#0072B2",  // Blu
    "Transition": "#E69F00",     // Arancione
    "Small-Ball": "#009E73"      // Verde-blu
};

// Coppia divergente per i residui del modello voter-fatigue (blu = bonus di
// fiducia, rosso = crollo del voto oltre quanto le statistiche giustificano).
const RESIDUAL_COLORS = { positive: "#2166AC", negative: "#B2182B" };

let globalData = [];
let insightsData = null;

// Riferimenti al grafico PCA riutilizzati dal modulo Insights (annotazioni,
// evidenziazione di un singolo giocatore selezionato dal grafico fatigue).
let pcaG = null;
let pcaXScale = null;
let pcaYScale = null;

// --- Inizializzazione e Caricamento Dati D3 ---
Promise.all([
    d3.csv("data/mvp_candidates_pca.csv"),
    d3.json("data/insights/insights.json")
]).then(([data, insights]) => {
    data.forEach(d => {
        d.PC1 = +d.PC1;
        d.PC2 = +d.PC2;
        d.PTS = +d.PTS;
        d.REB = +d.REB;
        d.AST = +d.AST;
        d.TS_PCT = +d.TS_PCT;
        d.Team_W_PCT = +d.Team_W_PCT;
        d.WS = +d.WS || 0;
        d.PIE = +d.PIE;
        d.MVP_Share = +d.MVP_Share;
        d.Is_MVP_Winner = +d.Is_MVP_Winner;
    });

    globalData = data;
    insightsData = insights;

    // Render di tutti e 4 i quadranti
    renderLegend();
    renderPCAScatterplot(data);
    renderParallelCoordinates(data);
    renderLineChart(data);
    renderBoxPlot(data);
    updateSidebar(data.slice(0, 5), false);

    // Modulo Insights: risultati dell'analisi "chi lo merita davvero?"
    renderNashAnnotation(insights);
    renderReliabilityChart(insights);
    renderFatigueChart(insights);
    renderInsightCallout(insights);
}).catch(err => console.error("Errore nel caricamento dei dati:", err));

// --- LEGENDA (colori era + marcatore vincitore MVP) ---
function renderLegend() {
    const legend = d3.select("#pca-legend");
    legend.selectAll("*").remove();

    Object.entries(ERA_COLORS).forEach(([era, color]) => {
        const item = legend.append("div").attr("class", "legend-item");
        item.append("span").attr("class", "legend-swatch").style("background", color);
        item.append("span").text(era);
    });

    const winnerItem = legend.append("div").attr("class", "legend-item");
    winnerItem.append("span").attr("class", "legend-swatch winner-swatch");
    winnerItem.append("span").text("Vincitore MVP reale (bordo nero)");
}

// --- Tooltip condiviso per i grafici del modulo Insights ---
let sharedTooltip = null;
function getTooltip() {
    if (!sharedTooltip) {
        sharedTooltip = d3.select("body").append("div").attr("class", "chart-tooltip");
    }
    return sharedTooltip;
}
function showTooltip(html, event) {
    getTooltip()
        .html(html)
        .style("left", (event.clientX + 14) + "px")
        .style("top", (event.clientY + 14) + "px")
        .style("opacity", 1);
}
function hideTooltip() {
    if (sharedTooltip) sharedTooltip.style("opacity", 0);
}

// --- 1. QUADRANTE A: SCATTERPLOT PCA (D3.js) ---
function renderPCAScatterplot(data) {
    const container = d3.select("#pca-plot");
    container.selectAll("*").remove();

    const margin = { top: 20, right: 20, bottom: 40, left: 40 };
    const width = container.node().getBoundingClientRect().width - margin.left - margin.right;
    const height = 330 - margin.top - margin.bottom;

    const svg = container.append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    const xScale = d3.scaleLinear()
        .domain(d3.extent(data, d => d.PC1)).nice()
        .range([0, width]);

    const yScale = d3.scaleLinear()
        .domain(d3.extent(data, d => d.PC2)).nice()
        .range([height, 0]);

    const sizeScale = d3.scaleSqrt()
        .domain([0, d3.max(data, d => d.MVP_Share) || 1])
        .range([3, 12]);

    svg.append("g")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(xScale))
        .append("text")
        .attr("x", width)
        .attr("y", -6)
        .attr("fill", "#000")
        .attr("text-anchor", "end")
        .text("PC1 (Lunghi vs Guardie)");

    svg.append("g")
        .call(d3.axisLeft(yScale))
        .append("text")
        .attr("transform", "rotate(-90)")
        .attr("y", 12)
        .attr("fill", "#000")
        .attr("text-anchor", "end")
        .text("PC2 (Scoring & Impact Volume)");

    const points = svg.selectAll(".point")
        .data(data)
        .enter()
        .append("circle")
        .attr("class", "point")
        .attr("cx", d => xScale(d.PC1))
        .attr("cy", d => yScale(d.PC2))
        .attr("r", d => sizeScale(d.MVP_Share))
        .attr("fill", d => ERA_COLORS[d.Tactical_Era] || "#7f8c8d")
        .attr("stroke", d => d.Is_MVP_Winner === 1 ? "#000" : "none")
        .attr("stroke-width", d => d.Is_MVP_Winner === 1 ? 2 : 0)
        .attr("opacity", 0.85);

    const brush = d3.brush()
        .extent([[0, 0], [width, height]])
        .on("brush end", brushed);

    svg.append("g")
        .attr("class", "brush")
        .call(brush);

    // Espone scale e gruppo SVG al modulo Insights (annotazione persistente,
    // evidenziazione di un giocatore selezionato dal grafico voter-fatigue).
    pcaG = svg;
    pcaXScale = xScale;
    pcaYScale = yScale;

    function brushed(event) {
        if (!event.selection) {
            points.classed("dimmed", false);
            d3.selectAll(".polyline").classed("dimmed", false);
            renderLineChart(globalData);
            renderBoxPlot(globalData);
            updateSidebar(globalData.slice(0, 5), false);
            return;
        }

        const [[x0, y0], [x1, y1]] = event.selection;

        const selected = data.filter(d => {
            const cx = xScale(d.PC1);
            const cy = yScale(d.PC2);
            return cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1;
        });

        points.classed("dimmed", d => {
            const cx = xScale(d.PC1);
            const cy = yScale(d.PC2);
            return !(cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1);
        });

        const selectedIDs = new Set(selected.map(s => `${s.Player}_${s.Season}`));
        d3.selectAll(".polyline")
            .classed("dimmed", d => !selectedIDs.has(`${d.Player}_${d.Season}`));

        if (selected.length > 0) {
            renderLineChart(selected);
            renderBoxPlot(selected);
            computeDynamicMVPScore(selected);
        }
    }
}

// --- 2. QUADRANTE B: PARALLEL COORDINATES PLOT (PCP) ---
function renderParallelCoordinates(data) {
    const container = d3.select("#pcp-plot");
    container.selectAll("*").remove();

    const margin = { top: 30, right: 10, bottom: 20, left: 10 };
    const width = container.node().getBoundingClientRect().width - margin.left - margin.right;
    const height = 330 - margin.top - margin.bottom;

    const svg = container.append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    const dimensions = ["PTS", "REB", "AST", "TS_PCT", "Team_W_PCT", "WS", "PIE"];

    // Oggetto per memorizzare i filtri attivi su ciascun asse
    const selections = {};

    const yScales = {};
    dimensions.forEach(dim => {
        yScales[dim] = d3.scaleLinear()
            .domain(d3.extent(globalData, d => d[dim])).nice()
            .range([height, 0]);
    });

    const xScale = d3.scalePoint()
        .range([0, width])
        .padding(1)
        .domain(dimensions);

    function path(d) {
        return d3.line()(dimensions.map(p => [xScale(p), yScales[p](d[p])]));
    }

    // Disegna le polilinee
    const lines = svg.selectAll(".polyline")
        .data(data)
        .enter()
        .append("path")
        .attr("class", "polyline")
        .attr("d", path)
        .attr("stroke", d => ERA_COLORS[d.Tactical_Era] || "#34495e")
        .attr("opacity", 0.3);

    // Disegna gli assi verticali
    const axesG = svg.selectAll(".axis")
        .data(dimensions)
        .enter()
        .append("g")
        .attr("class", "axis")
        .attr("transform", d => `translate(${xScale(d)})`);
    
    axesG.each(function(d) { d3.select(this).call(d3.axisLeft(yScales[d])); })
        .append("text")
        .style("text-anchor", "middle")
        .attr("y", -10)
        .text(d => d)
        .attr("fill", "#000");
    
        // INTEGRAZIONE INTERATTIVA: Aggiunta di d3.brushY per il Brushing su ciascun asse
    axesG.append("g")
        .attr("class", "brush")
        .each(function(dim) {
            d3.select(this).call(
                d3.brushY()
                    .extent([[-12, 0], [12, height]])
                    .on("brush end", function(event) {
                        brushedPCP(event, dim);
                    })
            );
        });

    function brushedPCP(event, dim) {
        if (event.selection) {
            selections[dim] = event.selection;
        } else {
            delete selections[dim];
        }

        const activeDims = Object.keys(selections);

        // Se non c'è alcun intervallo selezionato su nessun asse
        if (activeDims.length === 0) {
            lines.classed("dimmed", false);
            d3.selectAll(".point").classed("dimmed", false);
            renderLineChart(globalData);
            renderBoxPlot(globalData);
            updateSidebar(globalData.slice(0, 5), false);
            return;
        }

        // Filtra i giocatori che rispettano i limiti imposti su TUTTI gli assi spuntati
        const selected = globalData.filter(d => {
            return activeDims.every(p => {
                const y = yScales[p](d[p]);
                const [y0, y1] = selections[p];
                return y >= y0 && y <= y1;
            });
        });

        const selectedIDs = new Set(selected.map(s => `${s.Player}_${s.Season}`));

        // Updating visivo polilinee PCP
        lines.classed("dimmed", d => !selectedIDs.has(`${d.Player}_${d.Season}`));

        // Linking verso la PCA: evidenzia i punti corrispondenti nello Scatterplot
        d3.selectAll(".point")
            .classed("dimmed", d => !selectedIDs.has(`${d.Player}_${d.Season}`));

        // Analytics Trigger: ricalcola l'MVP Score e aggiorna Line Chart e Box Plot
        if (selected.length > 0) {
            renderLineChart(selected);
            renderBoxPlot(selected);
            computeDynamicMVPScore(selected);
        }
    }
}

// --- 3. QUADRANTE C: LINE CHART (SERIE STORICA) ---
function renderLineChart(data) {
    const container = d3.select("#line-chart");
    container.selectAll("*").remove();

    const margin = { top: 20, right: 20, bottom: 40, left: 40 };
    const width = container.node().getBoundingClientRect().width - margin.left - margin.right;
    const height = 240 - margin.top - margin.bottom;

    const svg = container.append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    // Calcolo della media per stagione
    const nested = d3.groups(data, d => d.Season)
        .map(([season, records]) => ({
            Season: season,
            avgPTS: d3.mean(records, r => r.PTS)
        }))
        .sort((a, b) => d3.ascending(a.Season, b.Season));

    const xScale = d3.scalePoint()
        .domain(nested.map(d => d.Season))
        .range([0, width]);

    const yScale = d3.scaleLinear()
        .domain([0, d3.max(nested, d => d.avgPTS) || 35]).nice()
        .range([height, 0]);

    svg.append("g")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(xScale).tickValues(xScale.domain().filter((d, i) => !(i % 4))))
        .selectAll("text")
        .attr("transform", "rotate(-25)")
        .style("text-anchor", "end");

    svg.append("g").call(d3.axisLeft(yScale));

    const line = d3.line()
        .x(d => xScale(d.Season))
        .y(d => yScale(d.avgPTS))
        .curve(d3.curveMonotoneX);

    svg.append("path")
        .datum(nested)
        .attr("fill", "none")
        .attr("stroke", "#e74c3c")
        .attr("stroke-width", 2.5)
        .attr("d", line);
}

// --- 4. QUADRANTE D: BOX PLOT (DISTRIBUZIONE PER ERA) ---
function renderBoxPlot(data) {
    const container = d3.select("#boxplot-chart");
    container.selectAll("*").remove();

    const margin = { top: 20, right: 20, bottom: 40, left: 40 };
    const width = container.node().getBoundingClientRect().width - margin.left - margin.right;
    const height = 240 - margin.top - margin.bottom;

    const svg = container.append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    const eras = ["Pre-Analytics", "Transition", "Small-Ball"];
    const xScale = d3.scaleBand().domain(eras).range([0, width]).padding(0.4);
    const yScale = d3.scaleLinear().domain([0, d3.max(data, d => d.PTS) || 35]).nice().range([height, 0]);

    svg.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(xScale));
    svg.append("g").call(d3.axisLeft(yScale));

    eras.forEach(era => {
        const eraData = data.filter(d => d.Tactical_Era === era).map(d => d.PTS).sort(d3.ascending);
        if (eraData.length === 0) return;

        const q1 = d3.quantile(eraData, 0.25);
        const median = d3.quantile(eraData, 0.5);
        const q3 = d3.quantile(eraData, 0.75);
        const iqr = q3 - q1;
        const min = Math.max(d3.min(eraData), q1 - 1.5 * iqr);
        const max = Math.min(d3.max(eraData), q3 + 1.5 * iqr);

        const x = xScale(era);
        const boxWidth = xScale.bandwidth();

        svg.append("line").attr("x1", x + boxWidth / 2).attr("x2", x + boxWidth / 2).attr("y1", yScale(min)).attr("y2", yScale(max)).attr("stroke", "#000");
        svg.append("rect").attr("x", x).attr("y", yScale(q3)).attr("height", yScale(q1) - yScale(q3)).attr("width", boxWidth).attr("fill", ERA_COLORS[era] || "#ccc").attr("opacity", 0.7).attr("stroke", "#000");
        svg.append("line").attr("x1", x).attr("x2", x + boxWidth).attr("y1", yScale(median)).attr("y2", yScale(median)).attr("stroke", "#000").attr("stroke-width", 2);
    });
}

// --- 5. ANALYTICS TRIGGER: CALCOLO DINAMICO MVP SCORE ---
function computeDynamicMVPScore(selectedPlayers) {
    const n = selectedPlayers.length;
    if (n === 0) return;

    const metrics = ['Team_W_PCT', 'WS', 'PIE', 'PTS', 'TS_PCT'];
    const weights = { Team_W_PCT: 0.35, WS: 0.30, PIE: 0.20, PTS: 0.10, TS_PCT: 0.05 };

    const stats = {};
    metrics.forEach(m => {
        const vals = selectedPlayers.map(p => p[m]);
        const mean = d3.mean(vals) || 0;
        const std = d3.deviation(vals) || 1;
        stats[m] = { mean, std };
    });

    selectedPlayers.forEach(p => {
        let score = 0;
        metrics.forEach(m => {
            const z = (p[m] - stats[m].mean) / stats[m].std;
            score += weights[m] * z;
        });
        p.dynamic_score = score;
    });

    selectedPlayers.sort((a, b) => b.dynamic_score - a.dynamic_score);
    updateSidebar(selectedPlayers.slice(0, 5), true);
}

// --- 6. PANNELLO E: SIDEBAR DETAILS-ON-DEMAND ---
function updateSidebar(topPlayers, isSelectionActive, extraNoteHtml) {
    const infoDiv = d3.select("#selected-player-info");
    const listOl = d3.select("#top-mvp-list");

    listOl.selectAll("*").remove();

    if (!topPlayers || topPlayers.length === 0) return;

    const top = topPlayers[0];

    infoDiv.html(`
        <strong>${top.Player} (${top.Season})</strong><br>
        Squadra: <code>${top.Team}</code> | Era: <em>${top.Tactical_Era}</em><br>
        Punti: <b>${top.PTS}</b> | Assist: <b>${top.AST}</b> | Rimbalzi: <b>${top.REB}</b><br>
        Vittorie Team: <b>${(top.Team_W_PCT * 100).toFixed(1)}%</b> | Share Voti: <b>${(top.MVP_Share * 100).toFixed(1)}%</b>
        ${extraNoteHtml ? `<hr><span>${extraNoteHtml}</span>` : ''}
    `);

    topPlayers.forEach(p => {
        const scoreLabel = isSelectionActive && p.dynamic_score !== undefined ? ` - Score: <strong>${p.dynamic_score.toFixed(2)}</strong>` : '';
        listOl.append("li").html(`${p.Player} (${p.Season}) - ${p.Team}${scoreLabel}`);
    });
}

// --- 7. MODULO INSIGHTS: ANNOTAZIONE PERSISTENTE SUL CASO PIU' ANOMALO ---
// Etichetta calcolata dai dati (analysis/mvp_merit_analysis.py), non
// hard-codata: se il dataset cambia, punta sempre al vincitore reale con il
// peggior rank combinato su PIE+WS tra i candidati della sua stagione.
function renderNashAnnotation(insights) {
    if (!pcaG || !pcaXScale || !pcaYScale) return;
    const top = insights.most_anomalous_winner;
    if (!top) return;

    const point = globalData.find(d => d.Player === top.player && d.Season === top.season);
    if (!point) return;

    const cx = pcaXScale(point.PC1);
    const cy = pcaYScale(point.PC2);
    const labelX = cx + 18;
    const labelY = cy - 18;

    pcaG.append("circle")
        .attr("cx", cx).attr("cy", cy).attr("r", 10)
        .attr("fill", "none").attr("stroke", "#b2182b").attr("stroke-width", 1.5)
        .attr("pointer-events", "none");

    pcaG.append("line")
        .attr("class", "annotation-leader")
        .attr("x1", cx).attr("y1", cy).attr("x2", labelX).attr("y2", labelY)
        .attr("pointer-events", "none");

    pcaG.append("text")
        .attr("class", "annotation-label")
        .attr("x", labelX + 4).attr("y", labelY - 2)
        .attr("pointer-events", "none")
        .text(`${top.player} ${top.season}: rank ${top.PIE_rank}/${top.PIE_n} su PIE`);
}

// --- 8. MODULO INSIGHTS: AFFIDABILITA' PER METRICA E PER ERA ---
function renderReliabilityChart(insights) {
    const container = d3.select("#reliability-chart");
    container.selectAll("*").remove();

    const metrics = ["PIE", "WS", "Team_W_PCT", "PTS"];
    const eras = Object.keys(ERA_COLORS);

    const margin = { top: 10, right: 10, bottom: 34, left: 34 };
    const width = container.node().getBoundingClientRect().width - margin.left - margin.right;
    const height = 230 - margin.top - margin.bottom;

    const svg = container.append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    const x0 = d3.scaleBand().domain(metrics).range([0, width]).paddingInner(0.35);
    const x1 = d3.scaleBand().domain(eras).range([0, x0.bandwidth()]).padding(0.12);
    const y = d3.scaleLinear().domain([0, 100]).range([height, 0]);

    svg.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x0));
    svg.append("g").call(d3.axisLeft(y).ticks(5).tickFormat(d => d + "%"));

    const groups = svg.selectAll(".metric-group")
        .data(metrics)
        .enter()
        .append("g")
        .attr("transform", d => `translate(${x0(d)},0)`);

    groups.selectAll(".bar-group")
        .data(metric => eras.map(era => ({
            metric, era,
            entry: insights.top1_reliability.by_era[era][metric]
        })))
        .enter()
        .append("g")
        .attr("class", d => `bar-group ${activeEra === d.era ? 'era-active' : ''}`)
        .attr("data-era", d => d.era)
        .each(function(d) {
            const pct = d.entry.pct || 0;
            d3.select(this).append("rect")
                .attr("x", x1(d.era))
                .attr("y", y(pct))
                .attr("width", x1.bandwidth())
                .attr("height", height - y(pct))
                .attr("rx", 2)
                .attr("fill", ERA_COLORS[d.era]);
        })
        .on("mouseenter", (event, d) => {
            const e = d.entry;
            showTooltip(`<strong>${d.metric}</strong> — ${d.era}<br>${e.hit}/${e.total} stagioni (${e.pct ?? 'n/d'}%)`, event);
        })
        .on("mousemove", (event) => showTooltip(getTooltip().html(), event))
        .on("mouseleave", hideTooltip)
        .on("click", (event, d) => highlightEra(d.era));
}

// Stato del filtro-per-era attivato cliccando il grafico di affidabilità.
let activeEra = null;
function highlightEra(era) {
    activeEra = (activeEra === era) ? null : era;

    d3.selectAll(".point").classed("dimmed", d => activeEra && d.Tactical_Era !== activeEra);
    d3.selectAll(".polyline").classed("dimmed", d => activeEra && d.Tactical_Era !== activeEra);
    d3.selectAll(".bar-group").classed("era-active", function() {
        return activeEra && d3.select(this).attr("data-era") === activeEra;
    });
}

// --- 9. MODULO INSIGHTS: BONUS DI FIDUCIA vs VOTER FATIGUE ---
function renderFatigueChart(insights) {
    const container = d3.select("#fatigue-chart");
    container.selectAll("*").remove();

    const cases = insights.voter_fatigue.incumbent_cases;

    const margin = { top: 10, right: 55, bottom: 30, left: 110 };
    const width = container.node().getBoundingClientRect().width - margin.left - margin.right;
    const height = 230 - margin.top - margin.bottom;

    const svg = container.append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    const y = d3.scaleBand()
        .domain(cases.map(c => `${c.player} ${c.season}`))
        .range([0, height])
        .padding(0.25);

    const extent = d3.extent(cases, c => c.residual);
    const maxAbs = Math.max(Math.abs(extent[0]), Math.abs(extent[1]));
    const x = d3.scaleLinear().domain([-maxAbs, maxAbs]).nice().range([0, width]);

    svg.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x).ticks(5));
    svg.append("g").call(d3.axisLeft(y).tickSize(0)).select(".domain").remove();
    svg.selectAll(".tick text").style("font-size", "0.68rem");

    svg.append("line")
        .attr("x1", x(0)).attr("x2", x(0)).attr("y1", 0).attr("y2", height)
        .attr("stroke", "#999");

    svg.selectAll(".fatigue-bar")
        .data(cases)
        .enter()
        .append("rect")
        .attr("class", "fatigue-bar")
        .attr("data-key", c => `${c.player}|${c.season}`)
        .attr("y", c => y(`${c.player} ${c.season}`))
        .attr("height", y.bandwidth())
        .attr("x", c => c.residual >= 0 ? x(0) : x(c.residual))
        .attr("width", c => Math.abs(x(c.residual) - x(0)))
        .attr("rx", 2)
        .attr("fill", c => c.residual >= 0 ? RESIDUAL_COLORS.positive : RESIDUAL_COLORS.negative)
        .on("mouseenter", (event, c) => {
            const dir = c.residual >= 0 ? "bonus di fiducia" : "voto sotto le attese (voter fatigue / crollo squadra)";
            showTooltip(`<strong>${c.player} (${c.season})</strong><br>Residuo: ${c.residual >= 0 ? '+' : ''}${c.residual} — ${dir}<br>PIE ${c.pie} · Team W% ${(c.team_w_pct*100).toFixed(0)}%`, event);
        })
        .on("mousemove", (event) => showTooltip(getTooltip().html(), event))
        .on("mouseleave", hideTooltip)
        .on("click", (event, c) => selectFatigueCase(c));
}

function selectFatigueCase(fatigueCase) {
    d3.selectAll(".fatigue-bar").classed("selected", function(d) {
        return d3.select(this).attr("data-key") === `${fatigueCase.player}|${fatigueCase.season}`;
    });

    const record = globalData.find(d => d.Player === fatigueCase.player && d.Season === fatigueCase.season);
    if (!record) return;

    d3.selectAll(".point").classed("selected-highlight", d =>
        d.Player === fatigueCase.player && d.Season === fatigueCase.season);

    const dir = fatigueCase.residual >= 0
        ? `ha ricevuto un voto <strong>più alto</strong> di quanto PIE e record di squadra da soli giustifichino (+${fatigueCase.residual}) — un possibile "bonus di fiducia" dopo aver già vinto l'MVP l'anno prima (${fatigueCase.previous_mvp_season}).`
        : `ha ricevuto un voto <strong>più basso</strong> di quanto PIE e record di squadra da soli giustifichino (${fatigueCase.residual}) rispetto all'anno del suo MVP (${fatigueCase.previous_mvp_season}) — un possibile effetto "voter fatigue" o crollo del contesto di squadra.`;

    updateSidebar([record], false, `Rispetto al modello Share ~ PIE + Team_W_PCT (R²=${insightsData.voter_fatigue.r2}), ${fatigueCase.player} nel ${fatigueCase.season} ${dir}`);
}

// --- 10. MODULO INSIGHTS: CALLOUT NARRATIVO ---
function renderInsightCallout(insights) {
    const el = d3.select("#insight-callout");
    const top = insights.most_anomalous_winner;
    const gap = insights.narrative_cases.usage_gap;
    const before = gap.gap[0], after = gap.gap[1];

    el.html(`
        <p><strong>${top.player} (${top.season})</strong> è il vincitore più anomalo del dataset:
        rank <strong>${top.PIE_rank}°/${top.PIE_n}</strong> su PIE e <strong>${top.WS_rank}°/${top.WS_n}</strong> su Win Shares
        tra i candidati, ma <strong>1°/${top.Team_W_PCT_n}</strong> per vittorie di squadra — ha vinto per il contesto, non per il dominio statistico individuale.</p>
        <hr>
        <p style="margin-top:8px">Nel ${gap.year}, il divario di utilizzo offensivo tra ${gap.player} e il compagno successivo (${before.second[0]}) era
        <strong>${before.gap}</strong>. Nel ${gap.next_year}, con l'arrivo di ${after.second[0]}, il divario crolla a <strong>${after.gap}</strong> —
        la firma numerica dell'arrivo di un secondo protagonista offensivo.</p>
        <p style="margin-top:8px; font-size:0.75rem; color:#7f8c8d">Nota: lo stesso confronto per Westbrook/George (OKC) non è verificabile con questo dataset, perché George non ricevette voti MVP nel ${insights.narrative_cases.usage_gap_not_verifiable.next_year} e quindi non compare tra i candidati.</p>
    `);
}