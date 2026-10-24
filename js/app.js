// Tutti i colori vengono da palette di d3 (d3-scale-chromatic); ogni tinta ha un solo significato.
// Ere: categorica Tableau10 (blu, verde, marrone), scelta per restare distinguibile anche con daltonismo.
const ERA_COLORS = {
    "Pre-Analytics": d3.schemeTableau10[0],
    "Transition": d3.schemeTableau10[4],
    "Small-Ball": d3.schemeTableau10[8]
};
const ERAS = Object.keys(ERA_COLORS);

// Voto reale vs atteso: estremi della divergente PuOr (viola = sopra l'atteso, arancione = sotto).
// Le varianti chiare servono solo su sfondo scuro (tooltip).
const RESIDUAL_COLORS = { positive: d3.schemePuOr[9][8], negative: d3.schemePuOr[9][0] };
const RESIDUAL_COLORS_LIGHT = { positive: d3.schemePuOr[9][6], negative: d3.schemePuOr[9][2] };
const SELECT_COLOR = "#000";
// Grigi (d3.schemeGreys) solo per grandezze non categoriche: scuro = merito, chiaro = record squadra.
const MERIT_COLOR = d3.schemeGreys[9][6];
const TEAM_COLOR = d3.schemeGreys[9][3];
const OTHER_BAR_COLOR = d3.schemeGreys[9][4];

const rootStyle = document.documentElement.style;
rootStyle.setProperty("--pos", RESIDUAL_COLORS.positive);
rootStyle.setProperty("--neg", RESIDUAL_COLORS.negative);
rootStyle.setProperty("--merit", MERIT_COLOR);
rootStyle.setProperty("--team", TEAM_COLOR);

const METRIC_LABELS = {
    PTS: "PTS", REB: "REB", AST: "AST", TS_PCT: "TS%", WS: "WS", PIE: "PIE",
    Team_W_PCT: "Team W%", Expected_Share: "Share attesa", MVP_Share: "Share voto", Narrative: "Narrativa",
};
const label = m => METRIC_LABELS[m] || m;
const AXIS_TITLES = {
    PTS: "Punti a partita (PTS)", REB: "Rimbalzi a partita (REB)", AST: "Assist a partita (AST)",
    TS_PCT: "True Shooting % (TS%)", WS: "Win Shares (WS)", PIE: "Player Impact Estimate (PIE)",
    Team_W_PCT: "% vittorie della squadra", Expected_Share: "Share voto MVP attesa (modello)",
    MVP_Share: "Share voto MVP reale", Narrative: "Narrativa (share reale − attesa)",
};
const axisTitle = m => AXIS_TITLES[m] || label(m);
const PCP_SHORT_LABELS = { Team_W_PCT: "W% squadra", Expected_Share: "Share attesa", MVP_Share: "Share reale" };
const PCT_METRICS = ["MVP_Share", "Expected_Share", "Team_W_PCT", "TS_PCT"];

let globalData = [];
let insightsData = null;
let pcaMeta = null;
let leagueAverages = null;
let seasonsSorted = [];
let seasonInfo = {};
let globalVoteModel = null;

let MVP_SCORE_WEIGHTS = {};

const keyOf = d => `${d.Player}_${d.Season}`;
const fmtPct = v => `${(v * 100).toFixed(0)}%`;
const fmtSigned = v => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}`;

const filters = { pca: null, pcp: null, era: null };
let currentSelectionData = [];

let pcaG = null;
let pcaXScale = null;
let pcaYScale = null;

Promise.all([
    d3.csv("data/mvp_candidates_pca.csv"),
    d3.json("data/insights/insights.json"),
    d3.json("data/pca_meta.json"),
    d3.json("data/league_averages.json")
]).then(([data, insights, meta, league]) => {
    data.forEach(d => {
        d.PC1 = +d.PC1;
        d.PC2 = +d.PC2;
        d.PTS = +d.PTS;
        d.REB = +d.REB;
        d.AST = +d.AST;
        d.TS_PCT = +d.TS_PCT;
        d.Team_W_PCT = +d.Team_W_PCT;

        d.WS = d.WS === "" ? null : +d.WS;
        d.PIE = +d.PIE;
        d.MVP_Share = +d.MVP_Share;
        d.Is_MVP_Winner = +d.Is_MVP_Winner;
    });

    globalData = data;
    insightsData = insights;
    pcaMeta = meta;
    leagueAverages = league.seasons;
    MVP_SCORE_WEIGHTS = Object.fromEntries(
        Object.entries(insights.mvp_score_weights.weights).filter(([, w]) => w > 0));

    prepareVoteModel(insights.vote_model);

    renderLegend();
    setupExpandableCards();
    setupDeselectOnEmptyClick();
    renderAllCharts();
    renderScoreWeightsNote(insights.mvp_score_weights);
    d3.select("#reset-all-filters").on("click", (event) => {
        event.preventDefault();
        resetAllFilters();
    });

    let lastSize = `${window.innerWidth}x${window.innerHeight}`;
    let resizeTimer = null;
    window.addEventListener("resize", () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            const size = `${window.innerWidth}x${window.innerHeight}`;
            if (size === lastSize) return;
            lastSize = size;
            renderAllCharts();
        }, 200);
    });
}).catch(err => console.error("Errore nel caricamento dei dati:", err));

function prepareVoteModel(vm) {
    const std = vm.standardization;
    globalData.forEach(d => {
        d.zPIE = (d.PIE - std.PIE.mean) / std.PIE.std;
        d.zW = (d.Team_W_PCT - std.Team_W_PCT.mean) / std.Team_W_PCT.std;
        d.Expected_Share = vm.global.intercept + vm.global.coef.PIE * d.zPIE + vm.global.coef.Team_W_PCT * d.zW;
        d.Narrative = d.MVP_Share - d.Expected_Share;
    });
    globalVoteModel = fitVoteModel(globalData);

    vm.seasons.forEach(s => { seasonInfo[s.season] = s; });
    seasonsSorted = vm.seasons.map(s => s.season);

    seasonsSorted.forEach((season, i) => {
        if (i === 0) return;
        const prevWinner = seasonInfo[seasonsSorted[i - 1]].winner;
        globalData.filter(d => d.Season === season && d.Player === prevWinner)
            .forEach(d => { d.Prev_MVP = true; });
    });
}

function fitVoteModel(rows) {
    const n = rows.length;
    if (n < 6) return null;
    const X = rows.map(d => [1, d.zPIE, d.zW]);
    const y = rows.map(d => d.MVP_Share);
    const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    const b = [0, 0, 0];
    X.forEach((row, i) => {
        for (let r = 0; r < 3; r++) {
            b[r] += row[r] * y[i];
            for (let c = 0; c < 3; c++) A[r][c] += row[r] * row[c];
        }
    });
    const beta = solve3(A, b);
    if (!beta) return null;
    const pred = X.map(row => beta[0] + beta[1] * row[1] + beta[2] * row[2]);
    const meanY = d3.mean(y);
    const ssTot = d3.sum(y, v => (v - meanY) ** 2);
    const ssRes = d3.sum(y, (v, i) => (v - pred[i]) ** 2);
    return { n, intercept: beta[0], bPIE: beta[1], bW: beta[2], r2: ssTot === 0 ? 0 : 1 - ssRes / ssTot };
}

function solve3(A, b) {
    const M = A.map((row, i) => [...row, b[i]]);
    for (let col = 0; col < 3; col++) {
        let pivot = col;
        for (let r = col + 1; r < 3; r++) if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
        if (Math.abs(M[pivot][col]) < 1e-9) return null;
        [M[col], M[pivot]] = [M[pivot], M[col]];
        for (let r = 0; r < 3; r++) {
            if (r === col) continue;
            const f = M[r][col] / M[col][col];
            for (let c = col; c < 4; c++) M[r][c] -= f * M[col][c];
        }
    }
    return M.map((row, i) => row[3] / row[i]);
}

function renderAllCharts() {
    hideTooltip();
    filters.pca = null;
    filters.pcp = null;
    renderPCAScatterplot(globalData);
    renderParallelCoordinates(globalData);
    applyFilters();
    if (selectedCandidateKey) {
        const record = globalData.find(d => keyOf(d) === selectedCandidateKey);
        if (record) selectCandidate(record);
    }
}

const EXPANDABLE_CARDS = ["pca-card", "pcp-card", "line-card", "boxplot-card"];
let expandedCard = null;

function setupExpandableCards() {
    d3.select("body").append("div").attr("class", "modal-backdrop")
        .on("click", () => toggleExpand(null));
    EXPANDABLE_CARDS.forEach(id => {
        d3.select(`#${id}`).append("button")
            .attr("class", "expand-btn")
            .attr("type", "button")
            .attr("title", "Espandi il grafico")
            .attr("aria-label", "Espandi il grafico")
            .text("⤢")
            .on("click", () => toggleExpand(expandedCard === id ? null : id));
    });
    d3.select(window).on("keydown.expand", (event) => {
        if (event.key !== "Escape") return;
        if (expandedCard) toggleExpand(null);
        else resetAllFilters();
    });
}

const DESELECT_CARDS = ["pca-card", "pcp-card", "line-card", "boxplot-card"];
const NO_CLEAR_TARGETS = ".brush, .polyline, .vote-seg, .axis-label, .legend, .era-box, a, button";

function clearBrushes(root) {
    root.selectAll(".brush").each(function() {
        if (this.__brushBehavior && d3.brushSelection(this)) {
            d3.select(this).call(this.__brushBehavior.move, null);
        }
    });
}

function setupDeselectOnEmptyClick() {
    DESELECT_CARDS.forEach(id => {
        const card = document.getElementById(id);
        let downOnEmpty = false;
        card.addEventListener("mousedown", (event) => {
            downOnEmpty = !event.target.closest(NO_CLEAR_TARGETS);
        }, true);
        card.addEventListener("click", (event) => {
            const onEmpty = downOnEmpty && !event.target.closest(NO_CLEAR_TARGETS);
            downOnEmpty = false;
            if (!onEmpty) return;
            clearBrushes(d3.select(card));
            const clearEra = id === "boxplot-card" && filters.era;
            if (clearEra) filters.era = null;
            if (selectedCandidateKey) clearCandidateSelection();
            else if (clearEra) applyFilters();
        }, true);
    });
}

function clearBrushOnClick(brushG, brush, onClear) {
    let down = null;
    brushG.node().addEventListener("mousedown", (event) => {
        down = [event.clientX, event.clientY];
    }, true);
    brush.on("end.clear", (event) => {
        const src = event.sourceEvent;
        const start = down;
        down = null;
        if (!event.selection || !src || !start || src.clientX === undefined) return;
        if (Math.hypot(src.clientX - start[0], src.clientY - start[1]) > 3) return;
        brushG.call(brush.move, null);
        if (onClear) onClear(src);
    });
}

function toggleExpand(id) {
    const previous = expandedCard;
    if (previous) {
        d3.select(`#${previous}`).classed("expanded", false)
            .select(".expand-btn").text("⤢").attr("title", "Espandi il grafico").attr("aria-label", "Espandi il grafico");
    }
    expandedCard = id;
    d3.select("body").classed("modal-open", !!id);
    if (id) {
        d3.select(`#${id}`).classed("expanded", true)
            .select(".expand-btn").text("✕").attr("title", "Chiudi (Esc)").attr("aria-label", "Chiudi");
    }
    [previous, id].filter(Boolean).forEach(rerenderCard);
}

function rerenderCard(id) {
    hideTooltip();
    if (id === "pca-card") {
        filters.pca = null;
        renderPCAScatterplot(globalData);
    } else if (id === "pcp-card") {
        filters.pcp = null;
        renderParallelCoordinates(globalData);
    }
    applyFilters();
    const record = selectedCandidateKey && globalData.find(d => keyOf(d) === selectedCandidateKey);
    if (record) selectCandidate(record);
}

function applyFilters() {
    const active = !!(filters.pca || filters.pcp || filters.era);
    const selected = globalData.filter(d =>
        (!filters.pca || filters.pca.has(keyOf(d))) &&
        (!filters.pcp || filters.pcp.has(keyOf(d))) &&
        (!filters.era || d.Tactical_Era === filters.era));
    const ids = new Set(selected.map(keyOf));

    d3.selectAll(".point").classed("dimmed", d => active && !ids.has(keyOf(d)));
    d3.selectAll(".polyline, .vote-seg").classed("dimmed", d => active && !ids.has(keyOf(d)));

    d3.selectAll(".legend-item[data-era]").classed("active", function() {
        return filters.era === this.getAttribute("data-era");
    });

    currentSelectionData = selected;
    renderLineChart(selected);
    renderBoxPlot(selected);
    renderModelPanel(selected, active);
    renderNarrativePanel(selected);
    computeDynamicMVPScore(selected, active);
    updateResetLink();
}

function updateResetLink() {
    const lineBrush = d3.select("#line-chart .brush").node();
    const active = !!(filters.pca || filters.pcp || filters.era || selectedCandidateKey ||
        (lineBrush && d3.brushSelection(lineBrush)));
    d3.select("#reset-all-filters").style("display", active ? null : "none");
}

function resetAllFilters() {

    d3.selectAll(".brush").each(function() {
        const brushBehavior = this.__brushBehavior;
        if (brushBehavior) d3.select(this).call(brushBehavior.move, null);
    });
    filters.pca = null;
    filters.pcp = null;
    filters.era = null;
    resetCandidateFocus();
    applyFilters();
}

function toggleEra(era) {
    filters.era = (filters.era === era) ? null : era;
    resetCandidateFocus();
    applyFilters();
}

const LEGEND_R = 4.5;

function renderCardLegend(target, items) {
    const legend = d3.select(target);
    legend.selectAll("*").remove();
    items.forEach(item => {
        if (item.type === "eras") {
            legend.append("span").attr("class", "legend-heading legend-shared").text("Era:");
            ERAS.forEach(era => {
                const el = legend.append("div")
                    .attr("class", "legend-item legend-shared")
                    .classed("active", filters.era === era)
                    .attr("data-era", era);
                el.append("span").attr("class", "legend-swatch").style("background", ERA_COLORS[era]);
                el.append("span").text(era);
            });
            return;
        }
        const el = legend.append("div").attr("class", "legend-item").classed("legend-shared", !!item.shared);
        const wide = item.type === "line";
        const icon = el.append("svg").attr("width", wide ? 20 : 14).attr("height", 14);
        if (item.type === "star" || item.type === "circle") {
            const type = item.type === "star" ? d3.symbolStar : d3.symbolCircle;
            const size = item.type === "star" ? (LEGEND_R * LEGEND_R) / 0.89081309152928522810 : Math.PI * LEGEND_R * LEGEND_R * 0.8;
            icon.append("path")
                .attr("transform", "translate(7,7)")
                .attr("d", d3.symbol().type(type).size(size)())
                .attr("fill", item.fill || "#7f8c8d")
                .attr("stroke", item.stroke || "none")
                .attr("stroke-width", item.stroke ? 1 : 0);
        } else if (item.type === "rect") {
            icon.append("rect").attr("x", 2).attr("y", 2).attr("width", 10).attr("height", 10).attr("rx", 1.5)
                .attr("fill", item.fill).attr("fill-opacity", item.opacity ?? 1).attr("stroke", item.stroke || "none");
        } else if (wide) {
            const line = icon.append("line").attr("x1", 1).attr("x2", 19).attr("y1", 7).attr("y2", 7);
            if (item.cls) line.attr("class", item.cls);
            else line.attr("stroke", item.color).attr("stroke-width", item.width || 2)
                .attr("stroke-dasharray", item.dash || null);
            if (item.star) icon.append("path").attr("transform", "translate(10,7)")
                .attr("d", d3.symbol().type(d3.symbolStar).size(30)())
                .attr("fill", "#7f8c8d").attr("stroke", "#000").attr("stroke-width", 0.6);
        }
        el.append("span").text(item.text);
    });
}

// Voci comuni a tutti i grafici: mostrate una volta nella legenda globale in alto;
// nelle card hanno classe .legend-shared e compaiono solo a grafico espanso.
function renderLegend() {
    renderCardLegend("#global-legend", [
        { type: "eras" },
        { type: "star", text: "MVP reale", stroke: "#000" },
    ]);
    renderCardLegend("#pca-legend", [
        { type: "eras" },
        { type: "star", text: "MVP reale", stroke: "#000", shared: true },
        { type: "circle", text: "Candidato (area = share voto)" },
    ]);
    renderCardLegend("#pcp-legend", [
        { type: "eras" },
        { type: "line", color: "#7f8c8d", width: 2.5, text: "MVP reale (spessa)" },
        { type: "line", color: RESIDUAL_COLORS.positive, width: 2.5, text: "Voto reale > atteso" },
        { type: "line", color: RESIDUAL_COLORS.negative, width: 2.5, text: "Voto reale < atteso" },
        { type: "line", color: "#7f8c8d", width: 4, text: "Selezionato (le altre sbiadiscono)" },
    ]);
}

let sharedTooltip = null;
function getTooltip() {
    if (!sharedTooltip) {
        sharedTooltip = d3.select("body").append("div").attr("class", "chart-tooltip");
    }
    return sharedTooltip;
}
function showTooltip(html, event) {
    const tip = getTooltip().html(html).style("opacity", 1);

    const { width, height } = tip.node().getBoundingClientRect();
    const x = Math.min(event.clientX + 14, window.innerWidth - width - 8);
    const y = event.clientY + 14 + height > window.innerHeight ? event.clientY - height - 10 : event.clientY + 14;
    tip.style("left", x + "px").style("top", y + "px");
}
function hideTooltip() {
    if (sharedTooltip) sharedTooltip.style("opacity", 0);
}

function chartSize(container, margin) {
    const box = container.node().getBoundingClientRect();
    return {
        width: Math.max(120, box.width - margin.left - margin.right),
        height: Math.max(100, box.height - margin.top - margin.bottom),
    };
}

function appendSvg(container, width, height, margin) {
    return container.append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);
}

function renderPCAScatterplot(data) {
    const container = d3.select("#pca-plot");
    container.selectAll("*").remove();

    const margin = { top: 10, right: 15, bottom: 34, left: 40 };
    const { width, height } = chartSize(container, margin);
    const svg = appendSvg(container, width, height, margin);

    const xScale = d3.scaleLinear()
        .domain(d3.extent(data, d => d.PC1)).nice()
        .range([0, width]);

    const yScale = d3.scaleLinear()
        .domain(d3.extent(data, d => d.PC2)).nice()
        .range([height, 0]);

    const sizeScale = d3.scaleSqrt()
        .domain([0, d3.max(data, d => d.MVP_Share) || 1])
        .range([2.5, 10]);

    const STAR_KA = 0.89081309152928522810;
    const symbolGenerator = d3.symbol()
        .type(d => d.Is_MVP_Winner === 1 ? d3.symbolStar : d3.symbolCircle)
        .size(d => {
            const r = sizeScale(d.MVP_Share);
            return d.Is_MVP_Winner === 1 ? (r * r) / STAR_KA : Math.PI * r * r;
        });

    svg.append("g")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(xScale).ticks(6))
        .append("text")
        .attr("x", width)
        .attr("y", 28)
        .attr("fill", "#000")
        .attr("text-anchor", "end")
        .text(`PC1 (${(pcaMeta.explained_variance.PC1 * 100).toFixed(1)}%): ← guardie · lunghi →`);

    svg.append("g")
        .call(d3.axisLeft(yScale).ticks(6))
        .append("text")
        .attr("transform", "rotate(-90)")
        .attr("y", -30)
        .attr("fill", "#000")
        .attr("text-anchor", "end")
        .text(`PC2 (${(pcaMeta.explained_variance.PC2 * 100).toFixed(1)}%): volume offensivo e impatto →`);

    const ordered = [...data].sort((a, b) => a.Is_MVP_Winner - b.Is_MVP_Winner || b.MVP_Share - a.MVP_Share);
    const points = svg.selectAll(".point")
        .data(ordered)
        .enter()
        .append("path")
        .attr("class", "point")
        .attr("transform", d => `translate(${xScale(d.PC1)},${yScale(d.PC2)})`)
        .attr("d", symbolGenerator)
        .attr("fill", d => ERA_COLORS[d.Tactical_Era] || "#7f8c8d")
        .attr("stroke", d => d.Is_MVP_Winner === 1 ? "#000" : "#fff")
        .attr("stroke-width", d => d.Is_MVP_Winner === 1 ? 1.2 : 0.5)
        .attr("opacity", 0.85);

    const shiftLayer = svg.append("g").attr("class", "shift-layer");
    shiftLayer.append("line").attr("class", "pc1-zero")
        .attr("x1", xScale(0)).attr("x2", xScale(0)).attr("y1", 0).attr("y2", height);

    svg.append("g").attr("class", "season-link-layer");

    const brush = d3.brush()
        .extent([[0, 0], [width, height]])
        .on("brush end", brushed);

    const brushG = svg.append("g")
        .attr("class", "brush")
        .call(brush);
    brushG.node().__brushBehavior = brush;
    clearBrushOnClick(brushG, brush, (src) => {
        const clicked = findNearestPoint(data, xScale, yScale, ...d3.pointer(src, brushG.node()), 15);
        if (clicked) selectCandidate(clicked);
    });

    let hovered = null;
    brushG
        .on("mousemove.tooltip", function(event) {
            if (event.buttons) { clearHover(); return; }
            const [mx, my] = d3.pointer(event, this);
            const d = findNearestPoint(data, xScale, yScale, mx, my, 10);
            if (d !== hovered) {
                hovered = d;
                points.classed("hovered", p => p === d);
                brushG.select(".overlay").style("cursor", d ? "pointer" : "crosshair");
            }
            if (d) showTooltip(candidateTooltipHtml(d), event);
            else hideTooltip();
        })
        .on("mouseleave.tooltip", clearHover);

    function clearHover() {
        hovered = null;
        points.classed("hovered", false);
        hideTooltip();
    }

    pcaG = svg;
    pcaXScale = xScale;
    pcaYScale = yScale;

    function brushed(event) {
        if (!event.selection) {

            filters.pca = null;
            const clicked = event.sourceEvent && event.sourceEvent.clientX !== undefined
                ? findNearestPoint(data, xScale, yScale, ...d3.pointer(event.sourceEvent, this), 15)
                : null;
            const previousKey = selectedCandidateKey;
            resetCandidateFocus();
            applyFilters();
            if (clicked && keyOf(clicked) !== previousKey) selectCandidate(clicked);
            return;
        }

        resetCandidateFocus();

        const [[x0, y0], [x1, y1]] = event.selection;
        filters.pca = new Set(data.filter(d => {
            const cx = xScale(d.PC1);
            const cy = yScale(d.PC2);
            return cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1;
        }).map(keyOf));
        applyFilters();
    }
}

function candidateTooltipHtml(d) {
    const fmt = v => (v === null || v === undefined) ? "N/D" : v;
    const narrativeColor = d.Narrative >= 0 ? RESIDUAL_COLORS_LIGHT.positive : RESIDUAL_COLORS_LIGHT.negative;
    return `<strong>${d.Player}</strong> (${d.Season}, ${d.Team})${d.Is_MVP_Winner === 1 ? " ★ MVP" : ""}${d.Prev_MVP ? " · MVP uscente" : ""}<br>` +
        `${d.Tactical_Era} · PTS ${d.PTS} · PIE ${d.PIE} · WS ${fmt(d.WS)} · Team W% ${fmtPct(d.Team_W_PCT)}<br>` +
        `Voto: reale <b>${fmtPct(d.MVP_Share)}</b> · atteso ${fmtPct(Math.max(0, d.Expected_Share))} · ` +
        `narrativa <b style="color:${narrativeColor}">${fmtSigned(d.Narrative)}</b>`;
}

function findNearestPoint(data, xScale, yScale, mx, my, maxDist) {
    let nearest = null;
    let minDist = Infinity;
    data.forEach(d => {
        const dx = xScale(d.PC1) - mx;
        const dy = yScale(d.PC2) - my;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDist) {
            minDist = dist;
            nearest = d;
        }
    });
    return minDist <= maxDist ? nearest : null;
}

function drawSeasonLink(season) {
    if (!pcaG) return;
    const layer = pcaG.select(".season-link-layer");
    layer.selectAll("*").remove();
    const info = seasonInfo[season];
    if (!info || info.matches) return;
    const winner = globalData.find(d => d.Season === season && d.Player === info.winner);
    const choice = globalData.find(d => d.Season === season && d.Player === info.statistical_choice);
    if (!winner || !choice) return;

    const [wx, wy] = [pcaXScale(winner.PC1), pcaYScale(winner.PC2)];
    const [cx, cy] = [pcaXScale(choice.PC1), pcaYScale(choice.PC2)];
    layer.append("line").attr("class", "season-link")
        .attr("x1", cx).attr("y1", cy).attr("x2", wx).attr("y2", wy);
    layer.append("circle").attr("class", "season-link-end").attr("cx", cx).attr("cy", cy).attr("r", 9);
    layer.append("text").attr("class", "season-link-label").attr("x", cx + 11).attr("y", cy + 4)
        .text(`scelta statistica: ${choice.Player.split(" ").pop()}`);
    layer.append("text").attr("class", "season-link-label").attr("x", wx + 11).attr("y", wy + 4)
        .text(`MVP reale: ${winner.Player.split(" ").pop()}`);
}

const PCP_DIMENSIONS = ["PTS", "REB", "AST", "PIE", "Team_W_PCT", "Expected_Share", "MVP_Share"];
const VOTE_DIMENSIONS = ["Expected_Share", "MVP_Share"];

function renderParallelCoordinates(data) {
    const container = d3.select("#pcp-plot");
    container.selectAll("*").remove();

    const margin = { top: 22, right: 8, bottom: 16, left: 8 };
    const { width, height } = chartSize(container, margin);
    const svg = appendSvg(container, width, height, margin);

    const dimensions = PCP_DIMENSIONS;

    const selections = {};

    const yScales = {};
    dimensions.forEach(dim => {
        yScales[dim] = d3.scaleLinear()
            .domain(d3.extent(globalData, d => d[dim])).nice()
            .range([height, 0]);
    });

    const xScale = d3.scalePoint()
        .range([0, width])
        .padding(0.5)
        .domain(dimensions);

    const step = xScale.step();
    const voteX0 = xScale(VOTE_DIMENSIONS[0]) - step / 2;
    svg.append("rect").attr("class", "vote-band")
        .attr("x", voteX0).attr("y", -20)
        .attr("width", width - voteX0 + margin.right).attr("height", height + 34);
    svg.append("text").attr("class", "vote-band-label")
        .attr("x", voteX0 + 4).attr("y", height + 14).text("VOTO");

    const lineGenerator = d3.line()
        .defined(p => p[1] !== null && !Number.isNaN(p[1]))
        .x(p => p[0])
        .y(p => p[1]);

    function path(d) {
        return lineGenerator(dimensions.map(p => [
            xScale(p),
            d[p] === null ? null : yScales[p](d[p]),
        ]));
    }

    const ordered = [...data].sort((a, b) => a.Is_MVP_Winner - b.Is_MVP_Winner);
    const lines = svg.selectAll(".polyline")
        .data(ordered)
        .enter()
        .append("path")
        .attr("class", d => `polyline ${d.Is_MVP_Winner === 1 ? "winner" : ""}`)
        .attr("d", path)
        .attr("stroke", d => ERA_COLORS[d.Tactical_Era] || "#34495e")
        .on("click", (_event, d) => toggleCandidate(d))
        .on("mouseenter mousemove", (event, d) => showTooltip(candidateTooltipHtml(d), event))
        .on("mouseleave", hideTooltip);

    svg.selectAll(".vote-seg")
        .data(ordered)
        .enter()
        .append("line")
        .attr("class", d => `vote-seg ${d.Is_MVP_Winner === 1 ? "winner" : ""}`)
        .attr("x1", xScale("Expected_Share")).attr("x2", xScale("MVP_Share"))
        .attr("y1", d => yScales.Expected_Share(d.Expected_Share))
        .attr("y2", d => yScales.MVP_Share(d.MVP_Share))
        .attr("stroke", d => d.Narrative >= 0 ? RESIDUAL_COLORS.positive : RESIDUAL_COLORS.negative);

    const axesG = svg.selectAll(".axis")
        .data(dimensions)
        .enter()
        .append("g")
        .attr("class", "axis")
        .attr("transform", d => `translate(${xScale(d)})`);

    axesG.each(function(d) {
        const fmt = PCT_METRICS.includes(d) ? d3.format(".0%")
            : ["PIE", "Narrative"].includes(d) ? d3.format(".2~f") : d3.format("~s");
        d3.select(this).call(d3.axisLeft(yScales[d]).ticks(5).tickFormat(fmt));
    })
        .append("text")
        .attr("class", "axis-label")
        .classed("active-metric", d => d === currentMetric)
        .style("text-anchor", "middle")
        .style("cursor", "pointer")
        .attr("y", -9)
        .text(d => PCP_SHORT_LABELS[d] || label(d))
        .attr("fill", "#000")
        .attr("text-decoration", "underline")
        .on("click", (_event, dim) => setMetric(dim))
        .append("title").text(d => `${axisTitle(d)} · click per mostrarla in Line Chart e Box Plot`);

    axesG.append("g")
        .attr("class", "brush")
        .each(function(dim) {
            const brush = d3.brushY()
                .extent([[-10, 0], [10, height]])
                .on("brush end", function(event) {
                    brushedPCP(event, dim);
                });
            d3.select(this).call(brush);
            this.__brushBehavior = brush;
            clearBrushOnClick(d3.select(this), brush);
        });

    function brushedPCP(event, dim) {

        resetCandidateFocus();

        if (event.selection) {
            selections[dim] = event.selection;
        } else {
            delete selections[dim];
        }

        const activeDims = Object.keys(selections);

        filters.pcp = activeDims.length === 0 ? null : new Set(globalData.filter(d =>
            activeDims.every(p => {
                if (d[p] === null) return false;
                const y = yScales[p](d[p]);
                const [y0, y1] = selections[p];
                return y >= y0 && y <= y1;
            })
        ).map(keyOf));

        applyFilters();
    }
}

function linearRegression(points) {
    const n = points.length;
    if (n < 2) return null;
    const meanX = d3.mean(points, p => p[0]);
    const meanY = d3.mean(points, p => p[1]);
    let num = 0, den = 0;
    points.forEach(([x, y]) => {
        num += (x - meanX) * (y - meanY);
        den += (x - meanX) ** 2;
    });
    const slope = den === 0 ? 0 : num / den;
    const intercept = meanY - slope * meanX;
    const predict = x => slope * x + intercept;
    const totalSS = d3.sum(points, p => (p[1] - meanY) ** 2);
    const residSS = d3.sum(points, p => (p[1] - predict(p[0])) ** 2);
    const r2 = totalSS === 0 ? 1 : 1 - residSS / totalSS;
    return { slope, intercept, r2, predict };
}

let currentMetric = "Expected_Share";

function setMetric(metric) {
    currentMetric = metric;
    d3.selectAll(".axis-label").classed("active-metric", d => d === metric);
    renderLineChart(currentSelectionData);
    const record = selectedCandidateKey && globalData.find(d => keyOf(d) === selectedCandidateKey);
    if (record) renderPlayerVsWinnersBoxPlot(record);
    else renderBoxPlot(currentSelectionData);
}

function addYAxisTitle(svg, height, marginLeft, text) {
    svg.append("text")
        .attr("class", "axis-title")
        .attr("transform", "rotate(-90)")
        .attr("x", -height / 2)
        .attr("y", -marginLeft + 11)
        .attr("text-anchor", "middle")
        .text(text);
}

function formatMetric(metric, v) {
    if (v === null || v === undefined || Number.isNaN(v)) return "N/D";
    if (metric === "Narrative") return fmtSigned(v);
    if (PCT_METRICS.includes(metric)) return fmtPct(v);
    return Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(3);
}

function renderLineChart(data) {
    const metric = currentMetric;
    const choiceMode = metric === "Expected_Share";
    const hasLeague = leagueAverages[seasonsSorted[0]][metric] !== undefined;
    const refLabel = choiceMode ? "scelta statistica" : hasLeague ? "media di lega" : "media dei candidati";
    d3.select("#linechart-title").text(`${label(metric)}: MVP reale vs ${refLabel}`);

    const filtered = data.length !== globalData.length;
    const candidate = selectedCandidateKey && globalData.find(d => keyOf(d) === selectedCandidateKey);
    const legendItems = [
        { type: "eras" },
        { type: "line", cls: "series-winner", star: true, text: "MVP reale" },
        { type: "line", cls: "series-reference", text: refLabel.charAt(0).toUpperCase() + refLabel.slice(1) },
    ];
    if (filtered) legendItems.push({ type: "line", cls: "series-selection", text: "Media selezione" });
    renderCardLegend("#line-legend", legendItems);

    const container = d3.select("#line-chart");
    container.selectAll("*").remove();

    const margin = { top: 14, right: 12, bottom: 34, left: 54 };
    const { width, height } = chartSize(container, margin);
    const plotH = height;
    const svg = appendSvg(container, width, height, margin);

    const winners = seasonsSorted.map(season => {
        const w = globalData.find(d => d.Season === season && d.Is_MVP_Winner === 1);
        return { season, record: w, value: w ? w[metric] : null };
    });
    const reference = seasonsSorted.map(season => ({
        season,
        value: choiceMode
            ? seasonInfo[season].choice_expected
            : hasLeague
                ? leagueAverages[season][metric]
                : d3.mean(globalData.filter(d => d.Season === season), d => d[metric]),
    }));
    const selection = filtered ? seasonsSorted.map(season => ({
        season,
        value: d3.mean(data.filter(d => d.Season === season), d => d[metric]),
    })) : [];

    const valid = v => v !== null && v !== undefined && !Number.isNaN(v);
    const allValues = [...winners, ...reference, ...selection].map(p => p.value).filter(valid);
    if (candidate && valid(candidate[metric])) allValues.push(candidate[metric]);
    if (allValues.length < 2) {
        container.append("p").attr("class", "card-desc").text("Dati insufficienti per questa statistica.");
        return;
    }

    const xScale = d3.scalePoint().domain(seasonsSorted).range([0, width]).padding(0.3);
    const yScale = d3.scaleLinear().domain(d3.extent([0, ...allValues])).nice().range([plotH, 0]);

    svg.append("g")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(xScale).tickValues(seasonsSorted.filter((d, i) => !(i % 3))))
        .selectAll("text")
        .attr("transform", "rotate(-25)")
        .style("text-anchor", "end");
    svg.append("g").call(d3.axisLeft(yScale).ticks(5).tickFormat(v => formatMetric(metric, v)));
    addYAxisTitle(svg, plotH, margin.left, axisTitle(metric));
    svg.append("text")
        .attr("class", "axis-title")
        .attr("x", width)
        .attr("y", height + 30)
        .attr("text-anchor", "end")
        .text("Stagione");
    if (metric === "Narrative") {
        svg.append("line").attr("class", "zero-line")
            .attr("x1", 0).attr("x2", width).attr("y1", yScale(0)).attr("y2", yScale(0));
    }

    const lineOf = series => d3.line()
        .defined(p => valid(p.value))
        .x(p => xScale(p.season))
        .y(p => yScale(p.value))(series);

    svg.append("path").attr("class", "series-reference").attr("d", lineOf(reference));
    if (filtered) {
        svg.append("path").attr("class", "series-selection").attr("d", lineOf(selection));

        svg.selectAll(".selection-dot")
            .data(selection.filter(p => valid(p.value)))
            .enter().append("circle")
            .attr("class", "selection-dot")
            .attr("cx", p => xScale(p.season)).attr("cy", p => yScale(p.value)).attr("r", 2.5);
        const last = selection.filter(p => valid(p.value)).pop();
        if (last) {
            svg.append("text").attr("class", "direct-label")
                .attr("x", xScale(last.season)).attr("y", yScale(last.value) + 14)
                .attr("text-anchor", "end")
                .text("media selezione");
        }
    }
    svg.append("path").attr("class", "series-winner").attr("d", lineOf(winners));

    const star = d3.symbol().type(d3.symbolStar).size(55);
    svg.selectAll(".winner-star")
        .data(winners.filter(p => valid(p.value)))
        .enter().append("path")
        .attr("class", "winner-star")
        .attr("transform", p => `translate(${xScale(p.season)},${yScale(p.value)})`)
        .attr("d", star)
        .attr("fill", p => ERA_COLORS[p.record.Tactical_Era])
        .attr("stroke", "#000").attr("stroke-width", 0.6);

    if (candidate && valid(candidate[metric])) {
        const cx = xScale(candidate.Season), cy = yScale(candidate[metric]);
        svg.append("line")
            .attr("x1", cx).attr("x2", cx).attr("y1", 0).attr("y2", plotH)
            .attr("stroke", SELECT_COLOR).attr("stroke-width", 1).attr("stroke-dasharray", "3,3");
        svg.append("circle").attr("cx", cx).attr("cy", cy).attr("r", 7)
            .attr("fill", "none").attr("stroke", SELECT_COLOR).attr("stroke-width", 2);
        svg.append("text")
            .attr("x", cx + (cx > width * 0.75 ? -7 : 7)).attr("y", cy - 7)
            .attr("text-anchor", cx > width * 0.75 ? "end" : "start")
            .attr("class", "direct-label").style("fill", SELECT_COLOR)
            .text(`${candidate.Player} (${formatMetric(metric, candidate[metric])})`);
    }


    let hadTrend = false;
    const brush = d3.brushX()
        .extent([[0, 0], [width, plotH]])
        .on("end", (event) => {
            svg.selectAll(".trend-line, .trend-label").remove();
            updateResetLink();
            const wasTrend = hadTrend;
            hadTrend = !!event.selection;
            if (!event.selection) {
                if (event.sourceEvent && !wasTrend && selectedCandidateKey) clearCandidateSelection();
                return;
            }

            const [x0, x1] = event.selection;
            const inRange = s => seasonsSorted.map((season, idx) => ({ season, idx, value: s[idx].value }))
                .filter(p => xScale(p.season) >= x0 && xScale(p.season) <= x1 && valid(p.value));
            const fits = [
                { name: "MVP", pts: inRange(winners), cls: "trend-winner" },
                { name: choiceMode ? "Scelta stat." : hasLeague ? "Lega" : "Candidati", pts: inRange(reference), cls: "trend-reference" },
            ].map(f => ({ ...f, reg: linearRegression(f.pts.map(p => [p.idx, p.value])) }))
                .filter(f => f.reg && f.pts.length >= 3);
            if (fits.length === 0) return;

            fits.forEach(f => {
                svg.append("path")
                    .attr("class", `trend-line ${f.cls}`)
                    .attr("d", d3.line().x(p => xScale(p.season)).y(p => yScale(f.reg.predict(p.idx)))(f.pts));
            });
            const perSeason = v => (PCT_METRICS.includes(metric)
                ? `${d3.format("+.2r")(v * 100)} pt%`
                : d3.format("+.2r")(v));
            svg.append("text")
                .attr("class", "trend-label")
                .attr("x", Math.min(Math.max((x0 + x1) / 2, 120), width - 120)).attr("y", 10)
                .attr("text-anchor", "middle")
                .text(fits.map(f => `${f.name} ${perSeason(f.reg.slope)}/stag. (R²=${f.reg.r2.toFixed(2)})`).join(" · "));
        });
    const lineBrushG = svg.append("g").attr("class", "brush").call(brush);
    lineBrushG.node().__brushBehavior = brush;
    clearBrushOnClick(lineBrushG, brush);
}

function renderBoxPlot(data) {

    const metric = currentMetric === "Expected_Share" ? "PIE" : currentMetric;
    d3.select("#boxplot-title").text(`${label(metric)} per era · come vota ogni era`);
    d3.select("#boxplot-desc").html(`Sotto ogni era: <strong>peso del merito</strong> vs <strong>peso del record di squadra</strong> nel voto (ristimati sulla selezione). Click su un box per filtrare l'era.`);

    renderCardLegend("#boxplot-legend", [
        { type: "eras" },
        { type: "rect", fill: MERIT_COLOR, text: "Peso merito (PIE)" },
        { type: "rect", fill: TEAM_COLOR, text: "Peso record squadra" },
    ]);

    const container = d3.select("#boxplot-chart");
    container.selectAll("*").remove();

    const valid = v => v !== null && v !== undefined && !Number.isNaN(v);
    const values = data.map(d => d[metric]).filter(valid);
    if (values.length === 0) {
        container.append("p").attr("class", "card-desc")
            .text(`Nessun valore di ${label(metric)} nella selezione corrente.`);
        return;
    }

    const margin = { top: 10, right: 15, bottom: 50, left: 57 };
    const { width, height } = chartSize(container, margin);
    const svg = appendSvg(container, width, height, margin);

    const xScale = d3.scaleBand().domain(ERAS).range([0, width]).padding(0.45);
    const yScale = d3.scaleLinear().domain(d3.extent(values)).nice().range([height, 0]);

    svg.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(xScale));
    renderEraVoteModels(svg, data, xScale, height);
    svg.append("g").call(d3.axisLeft(yScale).ticks(5).tickFormat(v => formatMetric(metric, v)));
    addYAxisTitle(svg, height, margin.left, axisTitle(metric));
    if (metric === "Narrative" && yScale.domain()[0] < 0) {
        svg.append("line").attr("class", "zero-line")
            .attr("x1", 0).attr("x2", width).attr("y1", yScale(0)).attr("y2", yScale(0));
    }

    ERAS.forEach(era => {
        const eraRows = data.filter(d => d.Tactical_Era === era && valid(d[metric]));
        const eraData = eraRows.map(d => d[metric]).sort(d3.ascending);
        if (eraData.length === 0) return;

        const q1 = d3.quantile(eraData, 0.25);
        const median = d3.quantile(eraData, 0.5);
        const q3 = d3.quantile(eraData, 0.75);
        const iqr = q3 - q1;
        const min = Math.max(d3.min(eraData), q1 - 1.5 * iqr);
        const max = Math.min(d3.max(eraData), q3 + 1.5 * iqr);

        const x = xScale(era);
        const boxWidth = xScale.bandwidth();
        const g = svg.append("g")
            .attr("class", `era-box ${filters.era === era ? "active" : ""}`)
            .on("click", () => toggleEra(era))
            .on("mouseenter mousemove", (event) => showTooltip(
                `<strong>${era}</strong> (n=${eraData.length})<br>Mediana ${formatMetric(metric, median)} · ` +
                `IQR ${formatMetric(metric, q1)}–${formatMetric(metric, q3)}<br>Click per filtrare l'era`, event))
            .on("mouseleave", hideTooltip);

        g.append("line").attr("x1", x + boxWidth / 2).attr("x2", x + boxWidth / 2).attr("y1", yScale(min)).attr("y2", yScale(max)).attr("stroke", "#000");
        [min, max].forEach(v => g.append("line")
            .attr("x1", x + boxWidth / 4).attr("x2", x + boxWidth * 3 / 4)
            .attr("y1", yScale(v)).attr("y2", yScale(v)).attr("stroke", "#000"));
        g.append("rect").attr("x", x).attr("y", yScale(q3)).attr("height", Math.max(1, yScale(q1) - yScale(q3))).attr("width", boxWidth).attr("fill", ERA_COLORS[era]).attr("opacity", 0.7).attr("stroke", "#000");
        g.append("line").attr("x1", x).attr("x2", x + boxWidth).attr("y1", yScale(median)).attr("y2", yScale(median)).attr("stroke", "#000").attr("stroke-width", 2);
    });
}

const COEF_SCALE_MAX = 0.3;
function renderEraVoteModels(svg, data, xScale, height) {
    const barMax = xScale.step() * 0.62;
    const coef = d3.scaleLinear().domain([0, COEF_SCALE_MAX]).range([0, barMax]).clamp(true);
    const y0 = height + 24;

    ERAS.forEach(era => {
        const x0 = xScale(era) + xScale.bandwidth() / 2 - barMax / 2;
        const g = svg.append("g").attr("class", "era-model");
        const model = fitVoteModel(data.filter(d => d.Tactical_Era === era));
        g.append("rect").attr("class", "era-model-track").attr("x", x0).attr("y", y0).attr("width", barMax).attr("height", 9);
        g.append("rect").attr("class", "era-model-track").attr("x", x0).attr("y", y0 + 12).attr("width", barMax).attr("height", 9);
        if (!model) return;
        g.append("rect").attr("class", "era-model-pie").attr("x", x0).attr("y", y0)
            .attr("height", 9).attr("width", coef(Math.max(0, model.bPIE))).attr("rx", 1);
        g.append("rect").attr("class", "era-model-team").attr("x", x0).attr("y", y0 + 12)
            .attr("height", 9).attr("width", coef(Math.max(0, model.bW))).attr("rx", 1);
        g.append("title").text(`${era} (n=${model.n}): peso merito ${model.bPIE.toFixed(3)} · peso squadra ${model.bW.toFixed(3)} · R² ${fmtPct(Math.max(0, model.r2))}`);
    });

}

function compareBars(panel, rows, faded) {
    const w = panel.node().getBoundingClientRect().width || 260;
    const labelW = 96, barW = w - labelW - 6, rowH = 15;
    const svg = panel.append("svg").attr("width", w).attr("height", rows.length * rowH + 2);
    rows.forEach((r, i) => {
        const x = d3.scaleLinear().domain([0, r.max]).range([0, barW]).clamp(true);
        const g = svg.append("g").attr("transform", `translate(0,${i * rowH})`);
        g.append("text").attr("class", "model-label").attr("x", 0).attr("y", 10).text(r.name);
        g.append("rect").attr("class", "bar-track").attr("x", labelW).attr("y", 3).attr("width", barW).attr("height", 9).attr("rx", 1.5);
        g.append("rect").attr("x", labelW).attr("y", 3)
            .attr("width", x(Math.max(0, r.sel))).attr("height", 9).attr("rx", 1.5)
            .attr("fill", r.color || "#1a252f").attr("opacity", faded ? 0.45 : 1);
        g.append("line").attr("class", "model-ref")
            .attr("x1", labelW + x(r.all)).attr("x2", labelW + x(r.all)).attr("y1", 0).attr("y2", 15);
        g.append("title").text(`${r.name}: selezione ${r.fmt(r.sel)} · tutti ${r.fmt(r.all)}`);
    });
}

function renderModelPanel(selected, isFiltered) {
    const panel = d3.select("#model-panel");
    panel.selectAll("*").remove();
    d3.select("#model-title").text(isFiltered
        ? `Come vota la selezione (n=${selected.length})`
        : `Come votano i giornalisti (n=${selected.length})`);

    const model = fitVoteModel(selected);
    const all = globalVoteModel;
    if (!model) {
        panel.append("p").attr("class", "panel-note warn").text("n < 6: modello non stimabile");
        return;
    }
    const collapse = rows => rows.filter(d => d.MVP_Share < 0.10).length / rows.length;
    const coefFmt = v => v.toFixed(3);
    compareBars(panel, [
        { name: "Peso merito (PIE)", sel: model.bPIE, all: all.bPIE, max: COEF_SCALE_MAX, fmt: coefFmt, color: MERIT_COLOR },
        { name: "Peso squadra (W%)", sel: model.bW, all: all.bW, max: COEF_SCALE_MAX, fmt: coefFmt, color: TEAM_COLOR },
        { name: "R² statistiche", sel: model.r2, all: all.r2, max: 1, fmt: fmtPct, color: OTHER_BAR_COLOR },
        { name: "Voto ≈ 0 (<10%)", sel: collapse(selected), all: collapse(globalData), max: 1, fmt: fmtPct, color: OTHER_BAR_COLOR },
    ], model.n < 25);
    panel.append("p").attr("class", "legend-note")
        .html(`barra = selezione · <b>|</b> = tutti i candidati${model.n < 25 ? " · barre chiare = campione piccolo" : ""}`);
}

function narrativeExtremes(selected) {
    const sorted = [...selected].sort((a, b) => b.Narrative - a.Narrative);
    return {
        pos: sorted.slice(0, 3).filter(d => d.Narrative > 0),
        neg: sorted.slice(-3).reverse().filter(d => d.Narrative < 0),
    };
}

const NARRATIVE_MAX = 0.75;
function renderNarrativePanel(selected) {
    const panel = d3.select("#narrative-panel");
    panel.selectAll("*").remove();
    if (selected.length === 0) {
        panel.append("p").attr("class", "panel-note warn").text("nessun candidato nella selezione");
        return;
    }
    const { pos, neg } = narrativeExtremes(selected);
    const rows = [...pos, ...neg];
    const w = panel.node().getBoundingClientRect().width || 260;
    const labelW = 104, rowH = 14, barW = w - labelW - 4;
    const x = d3.scaleLinear().domain([-NARRATIVE_MAX, NARRATIVE_MAX]).range([0, barW]).clamp(true);
    const svg = panel.append("svg").attr("width", w).attr("height", rows.length * rowH + 4);
    svg.append("line").attr("class", "zero-line")
        .attr("x1", labelW + x(0)).attr("x2", labelW + x(0)).attr("y1", 0).attr("y2", rows.length * rowH + 2);
    rows.forEach((d, i) => {
        const g = svg.append("g").attr("class", "narrative-row").attr("transform", `translate(0,${i * rowH + 2})`)
            .on("click", () => toggleCandidate(d));
        g.append("rect").attr("class", "row-hit").attr("width", w).attr("height", rowH);
        g.append("text").attr("class", "model-label").attr("x", 0).attr("y", 10)
            .text(`${d.Player.split(" ").pop()} ${d.Season.slice(2)}${d.Is_MVP_Winner === 1 ? " ★" : ""}${d.Prev_MVP ? " ↺" : ""}`);
        g.append("rect")
            .attr("x", labelW + Math.min(x(0), x(d.Narrative))).attr("y", 2)
            .attr("width", Math.abs(x(d.Narrative) - x(0))).attr("height", 9).attr("rx", 1.5)
            .attr("fill", d.Narrative >= 0 ? RESIDUAL_COLORS.positive : RESIDUAL_COLORS.negative);
        g.append("title").text(`${d.Player} ${d.Season}: share reale ${fmtPct(d.MVP_Share)}, attesa ${fmtPct(Math.max(0, d.Expected_Share))} (${fmtSigned(d.Narrative)})`);
    });
    panel.append("p").attr("class", "legend-note")
        .html(`<span class="pos">■</span> voto sopra le statistiche · <span class="neg">■</span> sotto · ★ MVP · ↺ MVP l'anno prima`);
}

function computeDynamicMVPScore(selectedPlayers, isFiltered) {
    const n = selectedPlayers.length;
    const listOl = d3.select("#top-mvp-list");
    listOl.selectAll("*").remove();
    d3.select("#top-mvp-title").text(isFiltered ? `Top 5 MVP Score (selezione)` : `Top 5 MVP Score (tutti)`);
    if (n === 0) return;

    const metrics = Object.keys(MVP_SCORE_WEIGHTS);
    const weights = MVP_SCORE_WEIGHTS;

    const stats = {};
    metrics.forEach(m => {
        const vals = selectedPlayers.map(p => p[m]);
        const mean = d3.mean(vals) || 0;
        const std = d3.deviation(vals) || 1;
        stats[m] = { mean, std };
    });

    selectedPlayers.forEach(p => {

        let score = 0;
        let usedWeight = 0;
        metrics.forEach(m => {
            if (p[m] === null || p[m] === undefined) return;
            const z = (p[m] - stats[m].mean) / stats[m].std;
            score += weights[m] * z;
            usedWeight += weights[m];
        });
        p.dynamic_score = usedWeight > 0 ? score / usedWeight : 0;
    });

    const ranked = [...selectedPlayers].sort((a, b) => b.dynamic_score - a.dynamic_score).slice(0, 5);
    const w = listOl.node().getBoundingClientRect().width || 260;
    const labelW = 104, rowH = 14, barW = w - labelW - 4;
    const x = d3.scaleLinear().domain([0, Math.max(2.5, d3.max(ranked, p => p.dynamic_score))]).range([0, barW]);
    const svg = listOl.append("svg").attr("width", w).attr("height", ranked.length * rowH + 2);
    ranked.forEach((p, i) => {
        const g = svg.append("g").attr("class", "narrative-row").attr("transform", `translate(0,${i * rowH})`)
            .on("click", () => toggleCandidate(p));
        g.append("rect").attr("class", "row-hit").attr("width", w).attr("height", rowH);
        g.append("text").attr("class", "model-label").attr("x", 0).attr("y", 10)
            .text(`${p.Player.split(" ").pop()} ${p.Season.slice(2)}${p.Is_MVP_Winner === 1 ? " ★" : ""}`);
        g.append("rect").attr("x", labelW).attr("y", 2).attr("height", 9).attr("rx", 1.5)
            .attr("width", x(Math.max(0, p.dynamic_score))).attr("fill", ERA_COLORS[p.Tactical_Era]);
        g.append("title").text(`${p.Player} ${p.Season}: MVP Score ${p.dynamic_score.toFixed(2)}`);
    });
}

function renderScoreWeightsNote(scoreModel) {
    const parts = Object.entries(MVP_SCORE_WEIGHTS)
        .sort((a, b) => b[1] - a[1])
        .map(([m, w]) => `${label(m)} ${(w * 100).toFixed(0)}%`);
    d3.select("#score-weights").html(
        `Media pesata degli z-score sulla selezione; pesi stimati (Ridge non negativa, R²=${scoreModel.r2}): ${parts.join(" · ")}.`);
}

let selectedCandidateKey = null;

function resetCandidateFocus() {
    selectedCandidateKey = null;
    d3.selectAll(".point").classed("selected-highlight", false);
    d3.selectAll(".polyline, .vote-seg").classed("candidate-focus", false);
    if (pcaG) {
        pcaG.select(".season-link-layer").selectAll("*").remove();
    }
    d3.select("#selected-player-info").html(
        "<p class=\"muted\"><em>Click su un candidato per il dettaglio: voto atteso vs reale e confronto con la sua stagione.</em></p>");
}

function clearCandidateSelection() {
    resetCandidateFocus();
    applyFilters();
}

function renderCandidatePanel(d) {
    const box = d3.select("#selected-player-info");
    box.selectAll("*").remove();
    box.append("button")
        .attr("class", "close-candidate")
        .attr("type", "button")
        .attr("title", "Deseleziona (Esc)")
        .attr("aria-label", "Deseleziona il candidato")
        .text("✕")
        .on("click", clearCandidateSelection);
    box.append("div").html(
        `<strong>${d.Player} (${d.Season})</strong>${d.Is_MVP_Winner === 1 ? " ★" : ""}${d.Prev_MVP ? ` <span class="badge">↺ MVP uscente</span>` : ""}` +
        ` <span class="muted">${d.Team} · ${d.Tactical_Era}</span>`);

    const w = box.node().getBoundingClientRect().width - 18 || 250;
    const labelW = 52, plotW = w - labelW - 8;
    const x = d3.scaleLinear().domain([0, 1]).range([0, plotW]).clamp(true);
    const svg = box.append("svg").attr("width", w).attr("height", 64);
    const g = svg.append("g").attr("transform", `translate(${labelW},0)`);

    const yv = 12;
    const exp = Math.max(0, d.Expected_Share);
    svg.append("text").attr("class", "model-label").attr("x", 0).attr("y", yv + 4).text("voto");
    g.append("line").attr("class", "bar-track-line").attr("x1", 0).attr("x2", plotW).attr("y1", yv).attr("y2", yv);
    g.append("line").attr("x1", x(exp)).attr("x2", x(d.MVP_Share)).attr("y1", yv).attr("y2", yv)
        .attr("stroke", d.Narrative >= 0 ? RESIDUAL_COLORS.positive : RESIDUAL_COLORS.negative).attr("stroke-width", 4);
    g.append("circle").attr("cx", x(exp)).attr("cy", yv).attr("r", 4.5).attr("class", "dot-expected");
    g.append("circle").attr("cx", x(d.MVP_Share)).attr("cy", yv).attr("r", 4.5)
        .attr("fill", d.Narrative >= 0 ? RESIDUAL_COLORS.positive : RESIDUAL_COLORS.negative);
    svg.append("title").text(`Share attesa ${fmtPct(exp)} → reale ${fmtPct(d.MVP_Share)} (narrativa ${fmtSigned(d.Narrative)})`);

    const ys = 34;
    const info = seasonInfo[d.Season];
    const season = globalData.filter(p => p.Season === d.Season);
    svg.append("text").attr("class", "model-label").attr("x", 0).attr("y", ys + 4).text("stagione");
    g.append("line").attr("class", "bar-track-line").attr("x1", 0).attr("x2", plotW).attr("y1", ys).attr("y2", ys);
    season.forEach(p => {
        if (p.Is_MVP_Winner === 1) return;
        g.append("circle").attr("cx", x(Math.max(0, p.Expected_Share))).attr("cy", ys).attr("r", 2.6)
            .attr("class", "dot-season").append("title").text(`${p.Player}: attesa ${fmtPct(Math.max(0, p.Expected_Share))}`);
    });
    const choice = season.find(p => p.Player === info.statistical_choice);
    const winner = season.find(p => p.Is_MVP_Winner === 1);
    if (choice) g.append("circle").attr("cx", x(Math.max(0, choice.Expected_Share))).attr("cy", ys).attr("r", 7).attr("class", "dot-choice");
    if (!info.matches && choice && winner) {
        g.append("line").attr("class", "gap-line")
            .attr("x1", x(Math.max(0, winner.Expected_Share))).attr("x2", x(Math.max(0, choice.Expected_Share)))
            .attr("y1", ys + 10).attr("y2", ys + 10);
    }
    if (winner) {
        g.append("path").attr("transform", `translate(${x(Math.max(0, winner.Expected_Share))},${ys})`)
            .attr("d", d3.symbol().type(d3.symbolStar).size(80)())
            .attr("fill", ERA_COLORS[winner.Tactical_Era]).attr("stroke", "#000").attr("stroke-width", 0.7);
    }
    if (d.Is_MVP_Winner !== 1) {
        g.append("circle").attr("cx", x(Math.max(0, d.Expected_Share))).attr("cy", ys).attr("r", 3.8).attr("fill", SELECT_COLOR);
    }
    [0, 0.5, 1].forEach(t => g.append("text").attr("class", "tick-mini").attr("x", x(t)).attr("y", 60)
        .attr("text-anchor", t === 0 ? "start" : t === 1 ? "end" : "middle").text(fmtPct(t)));

    box.append("p").attr("class", "legend-note").html(
        `○ attesa → ● reale · ★ MVP · ◯ scelta statistica · — scarto${d.Is_MVP_Winner !== 1 ? ` · ● ${d.Player.split(" ").pop()}` : ""}`);

    let verdict;
    if (info.matches) {
        verdict = d.Player === info.winner ? "Era la scelta statistica e ha vinto." : `Ha vinto la scelta statistica, ${info.winner}.`;
    } else if (d.Player === info.winner) {
        verdict = info.merit_gap >= 0.15
            ? `<b>MVP controcorrente</b>: la scelta statistica era ${info.statistical_choice}.`
            : `Ha vinto su ${info.statistical_choice}, quasi a pari merito statistico.`;
    } else if (d.Player === info.statistical_choice) {
        verdict = `<b class="neg">Snobbato</b>: era la scelta statistica, ha vinto ${info.winner}.`;
    } else {
        verdict = `MVP ${info.winner}, scelta statistica ${info.statistical_choice}.`;
    }
    const score = currentSelectionData.includes(d) && d.dynamic_score !== undefined ? ` · MVP Score ${d.dynamic_score.toFixed(2)}` : "";
    box.append("p").attr("class", "panel-note").html(
        `PIE ${d.PIE} · W% ${fmtPct(d.Team_W_PCT)} · voto ${fmtPct(d.MVP_Share)} (atteso ${fmtPct(Math.max(0, d.Expected_Share))})${score}<br>${verdict}`);
}

function toggleCandidate(d) {
    if (keyOf(d) === selectedCandidateKey) clearCandidateSelection();
    else selectCandidate(d);
}

function selectCandidate(d) {
    selectedCandidateKey = keyOf(d);

    d3.selectAll(".point").classed("selected-highlight", p => keyOf(p) === selectedCandidateKey);
    d3.selectAll(".polyline")
        .classed("candidate-focus", p => keyOf(p) === selectedCandidateKey)
        .classed("dimmed", p => keyOf(p) !== selectedCandidateKey);
    d3.selectAll(".vote-seg")
        .classed("candidate-focus", p => keyOf(p) === selectedCandidateKey)
        .classed("dimmed", p => keyOf(p) !== selectedCandidateKey);

    renderCandidatePanel(d);
    drawSeasonLink(d.Season);
    renderPlayerVsWinnersBoxPlot(d);
    renderLineChart(currentSelectionData);
    updateResetLink();
}

function renderPlayerVsWinnersBoxPlot(player) {
    const metric = currentMetric;
    const era = player.Tactical_Era;
    const winners = globalData.filter(p => p.Is_MVP_Winner === 1 && p.Tactical_Era === era);
    const playerVal = player[metric];
    const hasPlayerVal = playerVal !== null && playerVal !== undefined && !Number.isNaN(playerVal);
    const winnerVals = winners.map(w => w[metric]).filter(v => v !== null && !Number.isNaN(v)).sort(d3.ascending);

    d3.select("#boxplot-title").text(`${player.Player} (${player.Season}) vs MVP — ${era}`);
    d3.select("#boxplot-desc").html(
        `Box = ${label(metric)} dei vincitori MVP dell'era (n=${winnerVals.length}); ` +
        (hasPlayerVal
            ? `linea nera tratteggiata = <strong>${player.Player}</strong>. `
            : `${label(metric)} non disponibile per <strong>${player.Player}</strong>. `) +
        `<a id="reset-candidate-focus">↺ torna al confronto per era</a>`
    );
    d3.select("#reset-candidate-focus").on("click", (event) => {
        event.preventDefault();
        clearCandidateSelection();
    });

    renderCardLegend("#boxplot-legend", [
        { type: "rect", fill: ERA_COLORS[era] || "#ccc", opacity: 0.6, stroke: "#000", text: `Vincitori MVP ${era} (box)` },
        { type: "line", color: SELECT_COLOR, width: 1.5, dash: "4,3", text: player.Player },
    ]);

    const container = d3.select("#boxplot-chart");
    container.selectAll("*").remove();

    const margin = { top: 10, right: 110, bottom: 30, left: 57 };
    const { width, height } = chartSize(container, margin);
    const svg = appendSvg(container, width, height, margin);

    const allVals = hasPlayerVal ? winnerVals.concat([playerVal]) : winnerVals;
    if (allVals.length === 0) return;
    const yScale = d3.scaleLinear().domain(d3.extent(allVals)).nice().range([height, 0]);
    const xScale = d3.scaleBand().domain([era]).range([0, width]).padding(0.55);

    svg.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(xScale));
    svg.append("g").call(d3.axisLeft(yScale).ticks(5).tickFormat(v => formatMetric(metric, v)));
    addYAxisTitle(svg, height, margin.left, axisTitle(metric));

    if (winnerVals.length > 0) {
        const q1 = d3.quantile(winnerVals, 0.25);
        const median = d3.quantile(winnerVals, 0.5);
        const q3 = d3.quantile(winnerVals, 0.75);
        const iqr = q3 - q1;
        const lo = Math.max(d3.min(winnerVals), q1 - 1.5 * iqr);
        const hi = Math.min(d3.max(winnerVals), q3 + 1.5 * iqr);
        const bx = xScale(era), bw = xScale.bandwidth();

        svg.append("line").attr("x1", bx + bw / 2).attr("x2", bx + bw / 2)
            .attr("y1", yScale(lo)).attr("y2", yScale(hi)).attr("stroke", "#000");
        [lo, hi].forEach(v => svg.append("line")
            .attr("x1", bx + bw / 4).attr("x2", bx + bw * 3 / 4)
            .attr("y1", yScale(v)).attr("y2", yScale(v)).attr("stroke", "#000"));
        svg.append("rect").attr("x", bx).attr("y", yScale(q3))
            .attr("height", Math.max(1, yScale(q1) - yScale(q3))).attr("width", bw)
            .attr("fill", ERA_COLORS[era] || "#ccc").attr("opacity", 0.6).attr("stroke", "#000");
        svg.append("line").attr("x1", bx).attr("x2", bx + bw)
            .attr("y1", yScale(median)).attr("y2", yScale(median))
            .attr("stroke", "#000").attr("stroke-width", 2);
    }

    if (!hasPlayerVal) return;
    const py = yScale(playerVal);
    svg.append("line").attr("x1", 0).attr("x2", width).attr("y1", py).attr("y2", py)
        .attr("stroke", SELECT_COLOR).attr("stroke-width", 1.5).attr("stroke-dasharray", "4,3");
    svg.append("circle").attr("cx", width + 8).attr("cy", py).attr("r", 4.5).attr("fill", SELECT_COLOR);
    svg.append("text").attr("x", width + 16).attr("y", py + 4)
        .attr("font-size", "0.68rem").attr("fill", SELECT_COLOR)
        .text(`${player.Player.split(" ").pop()} (${formatMetric(metric, playerVal)})`);
}
