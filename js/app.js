// Colors: d3 palettes only, one meaning per color. Eras = Tableau10 (categorical).
const ERA_COLORS = {
    "Pre-Analytics": d3.schemeTableau10[0],
    "Transition": d3.schemeTableau10[4],
    "Small-Ball": d3.schemeTableau10[8]
};
const ERAS = Object.keys(ERA_COLORS);

// Narrative (actual − expected vote): diverging PuOr, purple = above expected, orange = below.
const RESIDUAL_COLORS = { positive: d3.schemePuOr[9][0], negative: d3.schemePuOr[9][8] };
const RESIDUAL_COLORS_LIGHT = { positive: d3.schemePuOr[9][2], negative: d3.schemePuOr[9][6] };
const residualColor = d => (d.Narrative >= 0 ? RESIDUAL_COLORS.positive : RESIDUAL_COLORS.negative);

// d3.schemeGreys greys + Tableau10 selection color; exposed to CSS as --c-* variables.
const GREYS = d3.schemeGreys[9];
const COLORS = {
    select: GREYS[8],                   // selected candidate
    ink: GREYS[7],                      // text, axes, outlines
    mvp: GREYS[6],                      // actual MVP series (line chart)
    context: GREYS[5],                  // other candidates of the season
    choice: GREYS[4],                   // statistical pick / league average
    all: GREYS[3],                      // full dataset (reference)
    grid: GREYS[2],                     // separators (UI)
    bg: GREYS[1],                       // backgrounds (UI)
    white: GREYS[0],
    selection: d3.schemeTableau10[3],   // current selection (brush / filters)
};
const SELECT_COLOR = COLORS.select;

const rootStyle = document.documentElement.style;
Object.entries(COLORS).forEach(([k, v]) => rootStyle.setProperty(`--c-${k}`, v));
rootStyle.setProperty("--c-text-muted", GREYS[6]);

const METRIC_LABELS = {
    PTS: "PTS", REB: "REB", AST: "AST", TS_PCT: "TS%", WS: "WS", PIE: "PIE",
    Team_W_PCT: "Team W%", Expected_Share: "Expected share", MVP_Share: "Vote share", Narrative: "Narrative",
};
const label = m => METRIC_LABELS[m] || m;
const AXIS_TITLES = {
    PTS: "Points per game (PTS)", REB: "Rebounds per game (REB)", AST: "Assists per game (AST)",
    TS_PCT: "True Shooting % (TS%)", WS: "Win Shares (WS)", PIE: "Player Impact Estimate (PIE)",
    Team_W_PCT: "Team win %", Expected_Share: "Expected MVP vote share (model)",
    MVP_Share: "Actual MVP vote share", Narrative: "Narrative (actual − expected share)",
};
const axisTitle = m => AXIS_TITLES[m] || label(m);
const PCP_SHORT_LABELS = { Team_W_PCT: "Team W%", Expected_Share: "Expected", MVP_Share: "Actual" };
const PCT_METRICS = ["MVP_Share", "Expected_Share", "Team_W_PCT", "TS_PCT"];

let globalData = [];
let insightsData = null;
let pcaMeta = null;
let leagueAverages = null;
let seasonsSorted = [];
let seasonInfo = {};
let globalVoteModel = null;

const keyOf = d => `${d.Player}_${d.Season}`;
const fmtPct = v => `${(v * 100).toFixed(0)}%`;
const fmtPctPrecise = v => `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`;
// d3.symbolStar: outer radius = sqrt(size · STAR_KA).
const STAR_KA = 0.89081309152928522810;
const fmtSigned = v => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}`;
const swatch = (color, glyph) => `<span style="color:${color}">${glyph}</span>`;

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
    // Size by 5 share classes: area proportional to the class midpoint,
    // thresholds fixed on the full dataset (filters do not change sizes).
    const maxShare = d3.max(data, d => d.MVP_Share) || 1;
    const areaScale = d3.scaleSqrt().domain([0, maxShare]).range([0, SHARE_R_MAX]);
    const edges = [0, ...SHARE_BINS, maxShare];
    const radii = d3.range(edges.length - 1)
        .map(i => Math.max(SHARE_R_MIN, areaScale((edges[i] + edges[i + 1]) / 2)));
    shareSizeScale = d3.scaleThreshold().domain(SHARE_BINS).range(radii);
    insightsData = insights;
    pcaMeta = meta;
    leagueAverages = league.seasons;
    prepareVoteModel(insights.vote_model);

    renderLegend();
    setupEscapeReset();
    setupDeselectOnEmptyClick();
    renderAllCharts();
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
}).catch(err => console.error("Error loading data:", err));

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

function setupEscapeReset() {
    d3.select(window).on("keydown.reset", (event) => {
        if (event.key === "Escape") resetAllFilters();
    });
}

const DESELECT_CARDS = ["pca-card", "pcp-card", "line-card", "boxplot-card"];
const NO_CLEAR_TARGETS = ".brush, .polyline, .vote-seg, .axis-label, .legend, .era-box, .share-box, .box-outlier, .winner-star, .selection-mean, a, button";

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
let shareSizeScale;
const SHARE_BINS = [0.05, 0.25, 0.5, 0.75];
const SHARE_R_MIN = 2.5;
const SHARE_R_MAX = 8.5;
function shareRadius(v) {
    return Number.isFinite(v) ? shareSizeScale(v) : SHARE_R_MIN;
}
function shareClassLabels() {
    const b = SHARE_BINS.map(fmtPct);
    return [`< ${b[0]}`, ...b.slice(1).map((v, i) => `${b[i]}–${v}`), `≥ ${b[b.length - 1]}`];
}

function renderCardLegend(target, items) {
    const legend = d3.select(target);
    legend.selectAll("*").remove();
    items.forEach(item => {
        if (item.type === "eras") {
            if (item.heading !== false) {
                legend.append("span").attr("class", "legend-heading legend-shared")
                    .text(typeof item.heading === "string" ? item.heading : "Era:");
            }
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
        if (item.type === "sizes") {
            legend.append("span").attr("class", "legend-heading").text(item.heading);
            item.scale.range().forEach((r, i) => {
                const el = legend.append("div").attr("class", "legend-item");
                el.append("svg").attr("width", 2 * r + 2).attr("height", 2 * r + 2)
                    .append("circle").attr("cx", r + 1).attr("cy", r + 1).attr("r", r)
                    .attr("fill", COLORS.white).attr("stroke", COLORS.ink).attr("stroke-width", 0.8);
                el.append("span").text(item.labels[i]);
            });
            return;
        }
        const el = legend.append("div").attr("class", "legend-item").classed("legend-shared", !!item.shared);
        const wide = item.type === "line";
        const iconRadius = item.radius ?? LEGEND_R;
        const iconSize = 2 * iconRadius + 5;
        const isSymbol = item.type === "star" || item.type === "circle";
        const icon = el.append("svg")
            .attr("width", wide ? 20 : isSymbol ? iconSize : 14)
            .attr("height", isSymbol ? iconSize : 14);
        if (item.type === "star" || item.type === "circle") {
            if (item.type === "circle" && item.exactCircle) {
                icon.append("circle")
                    .attr("cx", iconSize / 2)
                    .attr("cy", iconSize / 2)
                    .attr("r", iconRadius)
                    .attr("fill", item.fill || COLORS.white)
                    .attr("stroke", item.stroke || COLORS.ink)
                    .attr("stroke-width", item.strokeWidth ?? 1)
                    .attr("opacity", item.opacity ?? 1);
                el.append("span").text(item.text);
                return;
            }
            const type = item.type === "star" ? d3.symbolStar : d3.symbolCircle;
            const size = item.type === "star" ? (iconRadius * iconRadius) / STAR_KA : Math.PI * iconRadius * iconRadius * 0.8;
            icon.append("path")
                .attr("transform", `translate(${iconSize / 2},${iconSize / 2})`)
                .attr("d", d3.symbol().type(type).size(size)())
                .attr("fill", item.fill || COLORS.white)
                .attr("stroke", item.stroke || COLORS.ink)
                .attr("stroke-width", item.strokeWidth ?? 1)
                .attr("opacity", item.opacity ?? 1);
        } else if (item.type === "rect") {
            icon.append("rect").attr("x", 2).attr("y", 2).attr("width", 10).attr("height", 10).attr("rx", 1.5)
                .attr("fill", item.fill).attr("fill-opacity", item.opacity ?? 1)
                .attr("stroke", item.stroke || "none").attr("stroke-width", item.strokeWidth ?? 1);
        } else if (wide) {
            const line = icon.append("line").attr("x1", 1).attr("x2", 19).attr("y1", 7).attr("y2", 7);
            if (item.cls) line.attr("class", item.cls);
            else line.attr("stroke", item.color).attr("stroke-width", item.width || 2)
                .attr("stroke-dasharray", item.dash || null).attr("stroke-opacity", item.opacity ?? 1);
        }
        el.append("span").text(item.text);
    });
}

// Items shared by all charts: shown only in the sidebar legend.
function renderLegend() {
    renderCardLegend("#era-legend", [
        { type: "eras", heading: false },
    ]);
    renderCardLegend("#symbol-legend", [
        { type: "star", text: "Actual MVP (color = era)", radius: 6 },
        { type: "circle", text: "Selected candidate", stroke: COLORS.select, strokeWidth: 2.5, radius: 5 },
        { type: "rect", fill: COLORS.selection, opacity: 0.7, text: "Current selection (brush / filters)" },
    ]);
    renderCardLegend("#vote-legend", [
        { type: "circle", text: "Below expectations", fill: RESIDUAL_COLORS.negative, stroke: "none", radius: 5.5, exactCircle: true },
        { type: "circle", text: "Above expectations", fill: RESIDUAL_COLORS.positive, stroke: "none", radius: 5.5, exactCircle: true },
    ]);
    renderCardLegend("#pca-legend", [
        { type: "eras" },
        { type: "star", text: "Actual MVP (color = era)", shared: true },
        { type: "circle", text: "Selected", stroke: COLORS.select, strokeWidth: 2.5, shared: true },
        { type: "sizes", heading: "Area = MVP vote share (% of points received):",
          scale: shareSizeScale, labels: shareClassLabels() },
    ]);
    renderCardLegend("#pcp-legend", [
        { type: "eras" },
        { type: "line", color: COLORS.ink, width: 2.5, text: "Actual MVP (thick, color = era)" },
        { type: "line", color: COLORS.ink, width: 4, text: "Selected (others fade)" },
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

    // Area proportional to share, same for star (MVP) and circle.
    const symbolGenerator = d3.symbol()
        .type(d => d.Is_MVP_Winner === 1 ? d3.symbolStar : d3.symbolCircle)
        .size(d => {
            const r = shareRadius(d.MVP_Share);
            return Math.PI * r * r;
        });

    svg.append("g")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(xScale).ticks(6))
        .append("text")
        .attr("x", width)
        .attr("y", 28)
        .attr("fill", COLORS.ink)
        .attr("text-anchor", "end")
        .text(`PC1 (${(pcaMeta.explained_variance.PC1 * 100).toFixed(1)}%): ← guards · bigs →`);

    svg.append("g")
        .call(d3.axisLeft(yScale).ticks(6))
        .append("text")
        .attr("transform", "rotate(-90)")
        .attr("y", -30)
        .attr("fill", COLORS.ink)
        .attr("text-anchor", "end")
        .text(`PC2 (${(pcaMeta.explained_variance.PC2 * 100).toFixed(1)}%): offensive volume and impact →`);

    const ordered = [...data].sort((a, b) => a.Is_MVP_Winner - b.Is_MVP_Winner || b.MVP_Share - a.MVP_Share);
    const points = svg.selectAll(".point")
        .data(ordered)
        .enter()
        .append("path")
        .attr("class", "point")
        .attr("transform", d => `translate(${xScale(d.PC1)},${yScale(d.PC2)})`)
        .attr("d", symbolGenerator)
        .attr("fill", d => ERA_COLORS[d.Tactical_Era])
        .attr("stroke", COLORS.white)
        .attr("stroke-width", d => d.Is_MVP_Winner === 1 ? 1 : 0.5)
        .attr("opacity", 0.7);

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
    return `<strong>${d.Player}</strong> (${d.Season}, ${d.Team})${d.Is_MVP_Winner === 1 ? " ★ MVP" : ""}${d.Prev_MVP ? " · defending MVP" : ""}<br>` +
        `${d.Tactical_Era} · PTS ${d.PTS} · PIE ${d.PIE} · WS ${fmt(d.WS)} · Team W% ${fmtPct(d.Team_W_PCT)}<br>` +
        `Vote: actual <b>${fmtPctPrecise(d.MVP_Share)}</b> · expected ${fmtPctPrecise(Math.max(0, d.Expected_Share))} · ` +
        `narrative <b style="color:${narrativeColor}">${fmtSigned(d.Narrative)}</b>`;
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
        .text(`statistical pick: ${choice.Player.split(" ").pop()}`);
    layer.append("text").attr("class", "season-link-label").attr("x", wx + 11).attr("y", wy + 4)
        .text(`actual MVP: ${winner.Player.split(" ").pop()}`);
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

    const voteDomain = [
        d3.min(globalData, d => Math.min(d.Expected_Share, d.MVP_Share)),
        d3.max(globalData, d => Math.max(d.Expected_Share, d.MVP_Share)),
    ];
    const yScales = {};
    dimensions.forEach(dim => {
        yScales[dim] = d3.scaleLinear()
            .domain(VOTE_DIMENSIONS.includes(dim) ? voteDomain : d3.extent(globalData, d => d[dim])).nice()
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
        .attr("x", voteX0 + 4).attr("y", height + 14).text("VOTE");

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
        .attr("stroke", d => ERA_COLORS[d.Tactical_Era])
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
        .attr("stroke", residualColor);

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
        .attr("fill", COLORS.ink)
        .attr("text-decoration", "underline")
        .on("click", (_event, dim) => setMetric(dim))
        .append("title").text(d => `${axisTitle(d)} · click to show it in the Line Chart and Box Plot`);

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

const SEL_MEAN_MIN_N = 2;
const SEL_MEAN_R = 4.5;
// Minimum R² for a trend not to be flagged as weak.
const TREND_R2_MIN = 0.3;

function renderLineChart(data) {
    const metric = currentMetric;
    const choiceMode = metric === "Expected_Share";
    const hasLeague = leagueAverages[seasonsSorted[0]][metric] !== undefined;
    const refLabel = choiceMode ? "statistical pick" : hasLeague ? "league average" : "candidate average";
    const filtered = data.length !== globalData.length;
    // Coordination with the PCA: MVPs outside the selection are faded.
    const selectedKeys = new Set(data.map(keyOf));
    const inSelection = rec => !filtered || selectedKeys.has(keyOf(rec));
    const mvpTotal = globalData.filter(d => d.Is_MVP_Winner === 1).length;
    const mvpIn = data.filter(d => d.Is_MVP_Winner === 1).length;
    d3.select("#linechart-title").text(`${label(metric)}: actual MVP vs ${refLabel}` +
        (filtered ? ` · MVPs in selection: ${mvpIn}/${mvpTotal}` : ""));
    const candidate = selectedCandidateKey && globalData.find(d => keyOf(d) === selectedCandidateKey);
    const legendItems = [
        { type: "eras" },
        { type: "line", cls: "series-winner", text: "Actual MVP" },
        { type: "line", cls: "series-reference", text: refLabel.charAt(0).toUpperCase() + refLabel.slice(1) },
        { type: "line", color: COLORS.mvp, width: 4, opacity: 0.5, text: "Trend (same stroke as its series)" },
    ];
    if (filtered) legendItems.push(
        { type: "star", fill: COLORS.ink, stroke: "none", opacity: 0.3, text: "MVP outside the selection (faded)" },
        { type: "circle", fill: COLORS.selection, stroke: COLORS.white, radius: SEL_MEAN_R,
          exactCircle: true, text: "Selection mean per season" });
    if (candidate) legendItems.push({ type: "circle", stroke: COLORS.select, strokeWidth: 2, fill: "none", text: `${candidate.Player} (selected)` });
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
    const valid = v => v !== null && v !== undefined && !Number.isNaN(v);
    // Per-season mean as points, not a line: with few candidates per season a line
    // would suggest a continuous trend. Seasons with fewer than SEL_MEAN_MIN_N are omitted.
    const selectionMeans = filtered ? seasonsSorted.map(season => {
        const vals = data.filter(d => d.Season === season).map(d => d[metric]).filter(valid);
        return { season, n: vals.length, value: d3.mean(vals) };
    }).filter(p => p.n >= SEL_MEAN_MIN_N) : [];
    const allValues = [...winners, ...reference, ...selectionMeans].map(p => p.value).filter(valid);
    if (candidate && valid(candidate[metric])) allValues.push(candidate[metric]);
    if (allValues.length < 2) {
        container.append("p").attr("class", "card-desc").text("Not enough data for this statistic.");
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
        .text("Season");
    if (metric === "Narrative") {
        svg.append("line").attr("class", "zero-line")
            .attr("x1", 0).attr("x2", width).attr("y1", yScale(0)).attr("y2", yScale(0));
    }

    const lineOf = series => d3.line()
        .defined(p => valid(p.value))
        .x(p => xScale(p.season))
        .y(p => yScale(p.value))(series);

    // Below the brush: non-interactive elements.
    svg.append("path").attr("class", "series-reference").attr("d", lineOf(reference));
    svg.append("path").attr("class", "series-winner").attr("d", lineOf(winners));
    const hasCandidate = candidate && valid(candidate[metric]);
    if (hasCandidate) {
        const cx = xScale(candidate.Season);
        svg.append("line").attr("class", "candidate-guide")
            .attr("x1", cx).attr("x2", cx).attr("y1", 0).attr("y2", plotH)
            .attr("stroke", SELECT_COLOR).attr("stroke-width", 1).attr("stroke-dasharray", "3,3");
    }

    const trendReadout = d3.select("#line-trend").html("");
    let hadTrend = false;
    const brush = d3.brushX()
        .extent([[0, 0], [width, plotH]])
        .on("end", (event) => {
            svg.selectAll(".trend-line").remove();
            trendReadout.html("");
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
            const refName = choiceMode ? "Stat. pick" : hasLeague ? "League" : "Candidates";
            const fits = [
                { name: "MVP", pts: inRange(winners), cls: "trend-winner" },
                { name: refName, pts: inRange(reference), cls: "trend-reference" },
            ].map(f => ({ ...f, reg: linearRegression(f.pts.map(p => [p.idx, p.value])) }))
                .filter(f => f.reg && f.pts.length >= 3)
                .map(f => ({ ...f, weak: f.reg.r2 < TREND_R2_MIN }));
            if (fits.length === 0) return;

            // Linear regression on the selected period: same stroke as its series, lighter if R² is low.
            const perSeason = v => (PCT_METRICS.includes(metric)
                ? `${d3.format("+.2r")(v * 100)} pt%`
                : d3.format("+.2r")(v));
            fits.forEach(f => {
                svg.insert("path", ".line-marks")
                    .attr("class", `trend-line ${f.cls}`)
                    .classed("weak", f.weak)
                    .attr("d", d3.line().x(p => xScale(p.season)).y(p => yScale(f.reg.predict(p.idx)))(f.pts));
            });
            const pts0 = fits[0].pts;
            const period = `${pts0[0].season} → ${pts0[pts0.length - 1].season}`;
            const sample = cls => `<svg width="22" height="8"><line class="trend-line ${cls}" x1="1" x2="21" y1="4" y2="4"/></svg>`;
            trendReadout.html(fits.map(f =>
                `<div>${sample(f.cls)} <b>${f.name}</b> ${perSeason(f.reg.slope)} per season ` +
                `<span class="muted">(${period} · R² ${f.reg.r2.toFixed(2)}${f.weak ? ", weak trend" : ""})</span></div>`).join(""));
        });
    const lineBrushG = svg.append("g").attr("class", "brush").call(brush);
    lineBrushG.node().__brushBehavior = brush;
    clearBrushOnClick(lineBrushG, brush);

    // Above the brush: clickable elements.
    const marks = svg.append("g").attr("class", "line-marks");
    const bindCandidate = (sel, rec) => sel
        .on("click", (event, d) => { event.stopPropagation(); toggleCandidate(rec(d)); })
        .on("mouseenter mousemove", (event, d) => showTooltip(candidateTooltipHtml(rec(d)), event))
        .on("mouseleave", hideTooltip);

    marks.selectAll(".selection-mean")
        .data(selectionMeans)
        .enter().append("circle")
        .attr("class", "selection-mean")
        .attr("cx", p => xScale(p.season)).attr("cy", p => yScale(p.value))
        .attr("r", SEL_MEAN_R)
        .on("click", event => event.stopPropagation())
        .on("mouseenter mousemove", (event, p) => showTooltip(
            `<strong>Selection mean · ${p.season}</strong><br>${label(metric)} ${formatMetric(metric, p.value)} · n=${p.n} candidates`, event))
        .on("mouseleave", hideTooltip);

    const star = d3.symbol().type(d3.symbolStar).size(85);
    bindCandidate(marks.selectAll(".winner-star")
        .data(winners.filter(p => valid(p.value)))
        .enter().append("path")
        .attr("class", "winner-star")
        .attr("transform", p => `translate(${xScale(p.season)},${yScale(p.value)})`)
        .attr("d", star)
        .attr("fill", p => ERA_COLORS[p.record.Tactical_Era])
        .attr("stroke", COLORS.white).attr("stroke-width", 0.8)
        .classed("out-of-selection", p => !inSelection(p.record)), p => p.record);

    if (hasCandidate) {
        const cx = xScale(candidate.Season), cy = yScale(candidate[metric]);
        marks.append("circle").attr("class", "candidate-ring").attr("cx", cx).attr("cy", cy).attr("r", 8.5)
            .attr("fill", "none").attr("stroke", SELECT_COLOR).attr("stroke-width", 2);
        marks.append("text")
            .attr("x", cx + (cx > width * 0.75 ? -9 : 9)).attr("y", cy - 9)
            .attr("text-anchor", cx > width * 0.75 ? "end" : "start")
            .attr("class", "direct-label")
            .text(`${candidate.Player} (${formatMetric(metric, candidate[metric])})`);
    }
}

// Tukey statistics: whiskers reach the last value within 1.5×IQR, beyond = outlier.
function boxStats(sorted) {
    const q1 = d3.quantile(sorted, 0.25);
    const median = d3.quantile(sorted, 0.5);
    const q3 = d3.quantile(sorted, 0.75);
    const iqr = q3 - q1;
    const lo = d3.min(sorted.filter(v => v >= q1 - 1.5 * iqr));
    const hi = d3.max(sorted.filter(v => v <= q3 + 1.5 * iqr));
    return { q1, median, q3, lo, hi };
}

function drawWhiskers(g, cx, capW, yScale, { lo, q1, q3, hi }) {
    [[lo, q1], [q3, hi]].forEach(([a, b]) => g.append("line")
        .attr("x1", cx).attr("x2", cx).attr("y1", yScale(a)).attr("y2", yScale(b)).attr("stroke", COLORS.ink));
    [lo, hi].forEach(v => g.append("line")
        .attr("x1", cx - capW / 2).attr("x2", cx + capW / 2)
        .attr("y1", yScale(v)).attr("y2", yScale(v)).attr("stroke", COLORS.ink));
}

const OUTLIER_R = 2.5;
// Outliers in a column on the box axis, shifted sideways only when they overlap.
function dodgeOutliers(ys, maxSpread) {
    const minDist = 2 * OUTLIER_R + 0.5;
    const step = minDist;
    const maxK = Math.max(0, Math.floor(maxSpread / 2 / step));
    const placed = [];
    return ys.map(y => {
        let best = 0;
        for (let k = 0; k <= maxK; k++) {
            const candidates = k === 0 ? [0] : [k * step, -k * step];
            const free = candidates.find(dx =>
                placed.every(p => Math.hypot(p.dx - dx, p.y - y) >= minDist));
            if (free !== undefined) { best = free; break; }
            best = candidates[candidates.length - 1];
        }
        placed.push({ dx: best, y });
        return best;
    });
}

function drawOutliers(svg, rows, metric, cx, yScale, lo, hi, spread = 0) {
    const out = rows.filter(d => d[metric] < lo || d[metric] > hi)
        .sort((a, b) => a[metric] - b[metric]);
    const dx = dodgeOutliers(out.map(d => yScale(d[metric])), spread);
    svg.selectAll(null)
        .data(out)
        .enter().append("circle")
        .attr("class", "box-outlier")
        .attr("cx", (d, i) => cx + dx[i]).attr("cy", d => yScale(d[metric])).attr("r", OUTLIER_R)
        .on("click", (event, d) => { event.stopPropagation(); toggleCandidate(d); })
        .on("mouseenter mousemove", (event, d) => showTooltip(
            `<strong>${d.Player}</strong> (${d.Season})<br>${label(metric)} ${formatMetric(metric, d[metric])} · outlier`, event))
        .on("mouseleave", hideTooltip);
}

function renderBoxPlot(data) {

    const metric = currentMetric === "Expected_Share" ? "PIE" : currentMetric;
    const shareMetric = fourthBoxMetric(metric);
    d3.select("#boxplot-title").text(`${label(metric)} by era · ${label(shareMetric)}`);
    d3.select("#boxplot-desc").text(`Click a box to filter the era · right: ${label(shareMetric).toLowerCase()} of the selection`);

    renderCardLegend("#boxplot-legend", [
        { type: "eras" },
        { type: "rect", fill: COLORS.selection, opacity: 0.7, stroke: COLORS.ink,
          text: `${label(shareMetric)} (selection${filters.era ? `, ${filters.era}` : ""})` },
        ...(data.length < globalData.length
            ? [{ type: "rect", fill: "none", stroke: COLORS.all, strokeWidth: 1.5, text: "Full dataset (reference)" }]
            : []),
        { type: "circle", text: "Outlier (beyond 1.5×IQR)", radius: 3 },
    ]);

    const container = d3.select("#boxplot-chart");
    container.selectAll("*").remove();

    const valid = v => v !== null && v !== undefined && !Number.isNaN(v);
    const values = data.map(d => d[metric]).filter(valid);
    if (values.length === 0) {
        container.append("p").attr("class", "card-desc")
            .text(`No ${label(metric)} values in the current selection.`);
        return;
    }

    const margin = { top: 10, right: 15, bottom: 24, left: 57 };
    const { width, height } = chartSize(container, margin);
    const svg = appendSvg(container, width, height, margin);

    // 4th box: own y axis, since its unit differs from the era metric.
    const SHARE_AXIS_W = 44, SHARE_GAP = 14;
    const sharePanelW = Math.max(50, width * 0.2);
    const mainW = Math.max(60, width - SHARE_GAP - SHARE_AXIS_W - sharePanelW);

    const xScale = d3.scaleBand().domain(ERAS).range([0, mainW]).padding(0.45);
    const yScale = d3.scaleLinear().domain(d3.extent(values)).nice().range([height, 0]);

    svg.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(xScale));
    svg.append("g").call(d3.axisLeft(yScale).ticks(5).tickFormat(v => formatMetric(metric, v)));
    addYAxisTitle(svg, height, margin.left, axisTitle(metric));
    if (metric === "Narrative" && yScale.domain()[0] < 0) {
        svg.append("line").attr("class", "zero-line")
            .attr("x1", 0).attr("x2", mainW).attr("y1", yScale(0)).attr("y2", yScale(0));
    }

    ERAS.forEach(era => {
        const eraRows = data.filter(d => d.Tactical_Era === era && valid(d[metric]));
        const eraData = eraRows.map(d => d[metric]).sort(d3.ascending);
        if (eraData.length === 0) return;

        const { q1, median, q3, lo: min, hi: max } = boxStats(eraData);

        const x = xScale(era);
        const boxWidth = xScale.bandwidth();
        const g = svg.append("g")
            .attr("class", `era-box ${filters.era === era ? "active" : ""}`)
            .on("click", () => toggleEra(era))
            .on("mouseenter mousemove", (event) => showTooltip(
                `<strong>${era}</strong> (n=${eraData.length})<br>Median ${formatMetric(metric, median)} · ` +
                `IQR ${formatMetric(metric, q1)}–${formatMetric(metric, q3)}<br>Click to filter the era`, event))
            .on("mouseleave", hideTooltip);

        drawWhiskers(g, x + boxWidth / 2, boxWidth / 2, yScale, { lo: min, q1, q3, hi: max });
        g.append("rect").attr("x", x).attr("y", yScale(q3)).attr("height", Math.max(1, yScale(q1) - yScale(q3))).attr("width", boxWidth).attr("fill", ERA_COLORS[era]).attr("opacity", 0.7).attr("stroke", COLORS.ink);
        g.append("line").attr("x1", x).attr("x2", x + boxWidth).attr("y1", yScale(median)).attr("y2", yScale(median)).attr("stroke", COLORS.ink).attr("stroke-width", 2);
        drawOutliers(svg, eraRows, metric, x + boxWidth / 2, yScale, min, max, boxWidth * 0.6);
    });

    renderShareBox(svg, data, {
        metric, x0: mainW + SHARE_GAP + SHARE_AXIS_W, panelW: sharePanelW,
        axisW: SHARE_AXIS_W, height, boxWidth: xScale.bandwidth(),
    });
}

// 4th box: Narrative of the selection (actual share if the eras already show Narrative).
function fourthBoxMetric(metric) {
    return metric === "Narrative" ? "MVP_Share" : "Narrative";
}

function renderShareBox(svg, data, { metric, x0, panelW, axisW, height, boxWidth }) {
    const shareMetric = fourthBoxMetric(metric);
    const fmt = v => formatMetric(shareMetric, v);
    const valid = v => v !== null && v !== undefined && !Number.isNaN(v);

    // Domain fixed on the full dataset: different selections stay comparable.
    const yShare = d3.scaleLinear()
        .domain([Math.min(0, d3.min(globalData, d => d[shareMetric])), d3.max(globalData, d => d[shareMetric])])
        .nice().range([height, 0]);

    const panel = svg.append("g").attr("class", "share-panel").attr("transform", `translate(${x0},0)`);
    panel.append("line").attr("class", "share-divider")
        .attr("x1", -axisW - 7).attr("x2", -axisW - 7).attr("y1", 0).attr("y2", height + 20);
    const tickFmt = shareMetric === "Narrative"
        ? v => (v === 0 ? "0" : `${v > 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}`)
        : v => formatMetric(shareMetric, v);
    panel.append("g").call(d3.axisLeft(yShare).ticks(4).tickFormat(tickFmt));
    addYAxisTitle(panel, height, axisW,
        shareMetric === "Narrative" ? "Narrative (actual − expected)" : axisTitle(shareMetric));
    if (yShare.domain()[0] < 0) {
        panel.append("line").attr("class", "zero-line")
            .attr("x1", 0).attr("x2", panelW).attr("y1", yShare(0)).attr("y2", yShare(0));
    }

    const cx = panelW / 2;
    const scopeLabel = filters.era || "All eras";
    panel.append("text").attr("class", "share-box-label")
        .attr("x", cx).attr("y", height + 16).attr("text-anchor", "middle").text(scopeLabel);

    const rows = data.filter(d => valid(d[shareMetric]));
    const values = rows.map(d => d[shareMetric]).sort(d3.ascending);
    if (values.length === 0) return;

    // Full-dataset reference box, drawn below the selection box.
    const isFiltered = data.length < globalData.length;
    const refValues = globalData.map(d => d[shareMetric]).filter(valid).sort(d3.ascending);
    const ref = boxStats(refValues);
    if (isFiltered) {
        const refW = boxWidth * 1.5;
        const rg = panel.append("g").attr("class", "share-ref-box");
        rg.append("line").attr("x1", cx).attr("x2", cx).attr("y1", yShare(ref.lo)).attr("y2", yShare(ref.q1));
        rg.append("line").attr("x1", cx).attr("x2", cx).attr("y1", yShare(ref.q3)).attr("y2", yShare(ref.hi));
        [ref.lo, ref.hi].forEach(v => rg.append("line")
            .attr("x1", cx - refW / 4).attr("x2", cx + refW / 4).attr("y1", yShare(v)).attr("y2", yShare(v)));
        rg.append("rect").attr("x", cx - refW / 2).attr("y", yShare(ref.q3))
            .attr("width", refW).attr("height", Math.max(1, yShare(ref.q1) - yShare(ref.q3)));
        rg.append("line").attr("class", "share-ref-median")
            .attr("x1", cx - refW / 2).attr("x2", cx + refW / 2)
            .attr("y1", yShare(ref.median)).attr("y2", yShare(ref.median));
    }

    const { q1, median, q3, lo, hi } = boxStats(values);
    const x = cx - boxWidth / 2;
    const refLine = isFiltered
        ? `<br><span style="opacity:0.75">Full dataset: median ${fmt(ref.median)} · IQR ${fmt(ref.q1)} / ${fmt(ref.q3)}</span>`
        : "";
    const g = panel.append("g").attr("class", "share-box")
        .on("mouseenter mousemove", (event) => showTooltip(
            `<strong>${label(shareMetric)}</strong> · ${isFiltered ? "selection" : "full dataset"}, ${scopeLabel} (n=${values.length})<br>` +
            `Median ${fmt(median)} · IQR ${fmt(q1)} / ${fmt(q3)}${refLine}`, event))
        .on("mouseleave", hideTooltip);

    drawWhiskers(g, cx, boxWidth / 2, yShare, { lo, q1, q3, hi });
    g.append("rect").attr("x", x).attr("y", yShare(q3)).attr("height", Math.max(1, yShare(q1) - yShare(q3)))
        .attr("width", boxWidth).attr("fill", COLORS.selection).attr("opacity", 0.7).attr("stroke", COLORS.ink);
    g.append("line").attr("x1", x).attr("x2", x + boxWidth).attr("y1", yShare(median)).attr("y2", yShare(median))
        .attr("stroke", COLORS.ink).attr("stroke-width", 2);
    drawOutliers(panel, rows, shareMetric, cx, yShare, lo, hi, boxWidth * 0.6);
}

const COEF_SCALE_MAX = 0.3;

// Out-of-scale values flagged with "<0" or "›" instead of being clipped.
function boundedBar(g, x0, y, h, value, scale) {
    const [d0, d1] = scale.domain();
    const bar = g.append("rect").attr("x", x0).attr("y", y).attr("height", h).attr("rx", 1.5)
        .attr("width", scale(Math.min(Math.max(value, d0), d1)) - scale(d0));
    const out = value < d0 || value > d1;
    if (out) {
        g.append("text").attr("class", "out-of-scale")
            .attr("x", value < d0 ? x0 + 2 : x0 + scale(d1) - scale(d0) - 2).attr("y", y + h - 1)
            .attr("text-anchor", value < d0 ? "start" : "end")
            .text(value < d0 ? "<0" : "›");
    }
    return { bar, out };
}

function compareBars(panel, rows, faded) {
    const w = panel.node().getBoundingClientRect().width || 260;
    const labelW = 96, barW = w - labelW - 6, rowH = 15;
    const svg = panel.append("svg").attr("width", w).attr("height", rows.length * rowH + 2);
    let anyOut = false;
    rows.forEach((r, i) => {
        const x = d3.scaleLinear().domain([0, r.max]).range([0, barW]).clamp(true);
        const g = svg.append("g").attr("transform", `translate(0,${i * rowH})`);
        g.append("text").attr("class", "model-label").attr("x", 0).attr("y", 10).text(r.name);
        g.append("rect").attr("class", "bar-track").attr("x", labelW).attr("y", 3).attr("width", barW).attr("height", 9).attr("rx", 1.5);
        const { bar, out } = boundedBar(g, labelW, 3, 9, r.sel, x);
        bar.attr("fill", COLORS.selection).attr("opacity", faded ? 0.45 : 1);
        anyOut = anyOut || out;
        g.append("line").attr("class", "model-ref")
            .attr("x1", labelW + x(r.all)).attr("x2", labelW + x(r.all)).attr("y1", 0).attr("y2", 15);
        g.append("title").text(`${r.name}: selection ${r.fmt(r.sel)} · all ${r.fmt(r.all)}`);
    });
    return anyOut;
}

function renderModelPanel(selected, isFiltered) {
    const panel = d3.select("#model-panel");
    panel.selectAll("*").remove();
    d3.select("#model-title").text(isFiltered
        ? `How the selection is voted (n=${selected.length})`
        : `How the media votes (n=${selected.length})`);

    const model = fitVoteModel(selected);
    const all = globalVoteModel;
    if (!model) {
        panel.append("p").attr("class", "panel-note warn").text("n < 6: model cannot be estimated");
        return;
    }
    const collapse = rows => rows.filter(d => d.MVP_Share < 0.10).length / rows.length;
    const coefFmt = v => v.toFixed(3);
    const anyOut = compareBars(panel, [
        { name: "Merit weight (PIE)", sel: model.bPIE, all: all.bPIE, max: COEF_SCALE_MAX, fmt: coefFmt },
        { name: "Team weight (W%)", sel: model.bW, all: all.bW, max: COEF_SCALE_MAX, fmt: coefFmt },
        { name: "Fit to stats (R²)", sel: model.r2, all: all.r2, max: 1, fmt: fmtPct },
        { name: "Vote share < 10%", sel: collapse(selected), all: collapse(globalData), max: 1, fmt: fmtPct },
    ], model.n < 25);
    panel.append("p").attr("class", "legend-note")
        .html(`${swatch(COLORS.selection, "■")} bar = selection · ${swatch(COLORS.all, "<b>|</b>")} = all candidates${model.n < 25 ? " · light bars = small sample" : ""}` +
            `${anyOut ? " · <b>&lt;0</b> = negative weight · <b>›</b> = beyond scale" : ""}`);
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
        panel.append("p").attr("class", "panel-note warn").text("no candidates in the selection");
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
            .text(`${d.Player.split(" ").pop()} ${d.Season.slice(2)}${d.Is_MVP_Winner === 1 ? " ★" : ""}`);
        g.append("rect")
            .attr("x", labelW + Math.min(x(0), x(d.Narrative))).attr("y", 2)
            .attr("width", Math.abs(x(d.Narrative) - x(0))).attr("height", 9).attr("rx", 1.5)
            .attr("fill", residualColor(d));
        g.append("title").text(`${d.Player} ${d.Season}: actual share ${fmtPct(d.MVP_Share)}, expected ${fmtPct(Math.max(0, d.Expected_Share))} (${fmtSigned(d.Narrative)})`);
    });
}

let selectedCandidateKey = null;

function resetCandidateFocus() {
    selectedCandidateKey = null;
    d3.selectAll(".point").classed("selected-highlight", false);
    d3.selectAll(".polyline, .vote-seg").classed("candidate-focus", false);
    if (pcaG) {
        pcaG.select(".season-link-layer").selectAll("*").remove();
    }
    d3.select("#selected-player-info").property("hidden", true).html("");
}

function clearCandidateSelection() {
    resetCandidateFocus();
    applyFilters();
}

function renderCandidatePanel(d) {
    const box = d3.select("#selected-player-info").property("hidden", false);
    box.selectAll("*").remove();
    box.append("button")
        .attr("class", "close-candidate")
        .attr("type", "button")
        .attr("title", "Deselect (Esc)")
        .attr("aria-label", "Deselect the candidate")
        .text("✕")
        .on("click", clearCandidateSelection);
    box.append("div").html(
        `<strong>${d.Player} (${d.Season})</strong>${d.Is_MVP_Winner === 1 ? " ★" : ""}${d.Prev_MVP ? ` <span class="badge">Defending MVP</span>` : ""}` +
        ` <span class="muted">· ${d.Tactical_Era}</span>`);

    const exp = Math.max(0, d.Expected_Share);

    // "vote" row: player's expected → actual. "season, expected" row: expected vote of
    // the same season's candidates, to place the player among rivals.
    const w = box.node().getBoundingClientRect().width - 18 || 250;
    const labelW = 84, plotW = w - labelW - 8;
    const x = d3.scaleLinear().domain([0, 1]).range([0, plotW]).clamp(true);
    const svg = box.append("svg").attr("width", w).attr("height", 64);
    const g = svg.append("g").attr("transform", `translate(${labelW},0)`);

    const yv = 12;
    svg.append("text").attr("class", "model-label").attr("x", 0).attr("y", yv + 4).text("vote");
    g.append("line").attr("class", "bar-track-line").attr("x1", 0).attr("x2", plotW).attr("y1", yv).attr("y2", yv);
    g.append("line").attr("x1", x(exp)).attr("x2", x(d.MVP_Share)).attr("y1", yv).attr("y2", yv)
        .attr("stroke", residualColor(d)).attr("stroke-width", 4);
    g.append("circle").attr("cx", x(exp)).attr("cy", yv).attr("r", 4.5).attr("class", "dot-expected");
    g.append("circle").attr("cx", x(d.MVP_Share)).attr("cy", yv).attr("r", 4.5).attr("fill", residualColor(d));

    const ys = 34;
    const info = seasonInfo[d.Season];
    const season = globalData.filter(p => p.Season === d.Season);
    const winner = season.find(p => p.Is_MVP_Winner === 1);
    svg.append("text").attr("class", "model-label").attr("x", 0).attr("y", ys + 4).text("season, expected");
    g.append("line").attr("class", "bar-track-line").attr("x1", 0).attr("x2", plotW).attr("y1", ys).attr("y2", ys);
    season.forEach(p => {
        if (p.Is_MVP_Winner === 1 || p === d) return;
        g.append("circle").attr("cx", x(Math.max(0, p.Expected_Share))).attr("cy", ys).attr("r", 3.2)
            .attr("class", "dot-season").append("title").text(`${p.Player}: expected ${fmtPct(Math.max(0, p.Expected_Share))}`);
    });
    if (winner) {
        g.append("path").attr("class", "winner-star")
            .attr("transform", `translate(${x(Math.max(0, winner.Expected_Share))},${ys})`)
            .attr("d", d3.symbol().type(d3.symbolStar).size(110)())
            .attr("fill", ERA_COLORS[winner.Tactical_Era]).attr("stroke", COLORS.white).attr("stroke-width", 0.7)
            .on("click", () => { if (keyOf(winner) !== selectedCandidateKey) selectCandidate(winner); })
            .append("title").text(`${winner.Player}: MVP ${winner.Season} · click for details`);
    }
    // Selected player: same ring as "Selected candidate" in the main legend, drawn on top, with a direct label.
    if (d.Is_MVP_Winner !== 1) {
        const px = x(exp);
        g.append("circle").attr("cx", px).attr("cy", ys).attr("r", 5.5)
            .attr("fill", COLORS.white).attr("stroke", SELECT_COLOR).attr("stroke-width", 2.5);
        g.append("text").attr("class", "player-tag").attr("x", px).attr("y", ys - 9)
            .attr("text-anchor", px < 20 ? "start" : px > plotW - 20 ? "end" : "middle")
            .text(d.Player.split(" ").pop());
    }
    [0, 0.5, 1].forEach(t => g.append("text").attr("class", "tick-mini").attr("x", x(t)).attr("y", 60)
        .attr("text-anchor", t === 0 ? "start" : t === 1 ? "end" : "middle").text(fmtPct(t)));

    box.append("p").attr("class", "legend-note").html(
        `○ expected · ${swatch(residualColor(d), "●")} actual · ★ MVP` +
        `${d.Is_MVP_Winner !== 1 ? " · <b>◯</b> selected player" : ""}` +
        ` · ${swatch(COLORS.context, "●")} other candidates`);

    const gap = Math.round(d.Narrative * 100);
    box.append("p").attr("class", "panel-note").html(
        `<b style="color:${residualColor(d)}">${gap >= 0 ? "+" : "−"}${Math.abs(gap)} points ${gap >= 0 ? "above" : "below"} expected</b>` +
        ` (${fmtPct(exp)} → ${fmtPct(d.MVP_Share)})`);

    let verdict;
    if (info.matches) {
        verdict = d.Player === info.winner ? "Was the statistical pick and won." : `The statistical pick, ${info.winner}, won.`;
    } else if (d.Player === info.winner) {
        verdict = info.merit_gap >= 0.15
            ? `<b>MVP over the statistical pick</b> (${info.statistical_choice}).`
            : `Won over ${info.statistical_choice}, nearly tied on the numbers.`;
    } else if (d.Player === info.statistical_choice) {
        verdict = `<b>Statistical pick, not elected</b>: ${info.winner} won.`;
    } else {
        verdict = `MVP ${info.winner}, statistical pick ${info.statistical_choice}.`;
    }
    box.append("p").attr("class", "panel-note").html(
        `${verdict}<br><span class="muted">PIE ${d3.format(".3f")(d.PIE)} (average ${d3.format(".3f")(d3.mean(globalData, p => p.PIE))}) · team ${fmtPct(d.Team_W_PCT)} wins</span>`);
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
    d3.select("#boxplot-desc").html(hasPlayerVal
        ? `${label(metric)} of ${winnerVals.length} MVP winners of the era`
        : `${label(metric)} not available for <strong>${player.Player}</strong>`);

    renderCardLegend("#boxplot-legend", [
        { type: "rect", fill: ERA_COLORS[era], opacity: 0.6, stroke: COLORS.ink, text: `${era} MVP winners (box)` },
        { type: "line", color: SELECT_COLOR, width: 1.5, dash: "4,3", text: `${player.Player} (selected)` },
        { type: "circle", text: "Outlier (beyond 1.5×IQR)", radius: 3 },
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
        const { q1, median, q3, lo, hi } = boxStats(winnerVals);
        const bx = xScale(era), bw = xScale.bandwidth();

        drawWhiskers(svg, bx + bw / 2, bw / 2, yScale, { lo, q1, q3, hi });
        svg.append("rect").attr("x", bx).attr("y", yScale(q3))
            .attr("height", Math.max(1, yScale(q1) - yScale(q3))).attr("width", bw)
            .attr("fill", ERA_COLORS[era]).attr("opacity", 0.6).attr("stroke", COLORS.ink);
        svg.append("line").attr("x1", bx).attr("x2", bx + bw)
            .attr("y1", yScale(median)).attr("y2", yScale(median))
            .attr("stroke", COLORS.ink).attr("stroke-width", 2);
        drawOutliers(svg, winners.filter(w => w[metric] !== null), metric, bx + bw / 2, yScale, lo, hi, bw * 0.6);
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
