// --- Costanti e Configurazione Colori ---
const ERA_COLORS = {
    "Pre-Analytics": "#1f77b4",  // Blu
    "Transition": "#ff7f0e",     // Arancione
    "Small-Ball": "#2ca02c"      // Verde
};

let globalData = [];

// --- Inizializzazione e Caricamento Dati D3 ---
d3.csv("data/mvp_candidates_pca.csv").then(data => {
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

    // Render di tutti e 4 i quadranti
    renderPCAScatterplot(data);
    renderParallelCoordinates(data);
    renderLineChart(data);
    renderBoxPlot(data);
    updateSidebar(data.slice(0, 5), false);
}).catch(err => console.error("Errore nel caricamento del file CSV:", err));

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

    svg.selectAll(".polyline")
        .data(data)
        .enter()
        .append("path")
        .attr("class", "polyline")
        .attr("d", path)
        .attr("stroke", d => ERA_COLORS[d.Tactical_Era] || "#34495e")
        .attr("opacity", 0.3);

    svg.selectAll(".axis")
        .data(dimensions)
        .enter()
        .append("g")
        .attr("class", "axis")
        .attr("transform", d => `translate(${xScale(d)})`)
        .each(function(d) { d3.select(this).call(d3.axisLeft(yScales[d])); })
        .append("text")
        .style("text-anchor", "middle")
        .attr("y", -10)
        .text(d => d)
        .attr("fill", "#000");
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
function updateSidebar(topPlayers, isSelectionActive) {
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
    `);

    topPlayers.forEach(p => {
        const scoreLabel = isSelectionActive && p.dynamic_score !== undefined ? ` - Score: <strong>${p.dynamic_score.toFixed(2)}</strong>` : '';
        listOl.append("li").html(`${p.Player} (${p.Season}) - ${p.Team}${scoreLabel}`);
    });
}