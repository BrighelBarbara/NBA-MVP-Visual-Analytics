// Funzione attivata dall'evento di Brushing visivo sullo Scatterplot PCA
function onVisualSelection(selectedPlayers) {
    if (!selectedPlayers || selectedPlayers.length === 0) return;

    // 1. Calcolo di media e deviazione standard per il sottoinsieme selezionato
    const n = selectedPlayers.length;
    const metrics = ['Team_W_PCT', 'WS', 'PIE', 'PTS', 'TS_PCT'];
  
    let stats = {};
    metrics.forEach(m => {
        const values = selectedPlayers.map(p => p[m]);
        const mean = values.reduce((a, b) => a + b, 0) / n;
        const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n;
        stats[m] = { mean: mean, std: Math.sqrt(variance) || 1 };
    });

    // 2. Calcolo dinamico dell'MVP Score per ciascun giocatore selezionato
    const weights = { Team_W_PCT: 0.35, WS: 0.30, PIE: 0.20, PTS: 0.10, TS_PCT: 0.05 };

    selectedPlayers.forEach(p => {
        let score = 0;
        metrics.forEach(m => {
            const zScore = (p[m] - stats[m].mean) / stats[m].std;
            score += weights[m] * zScore;
        });
        p.dynamic_mvp_score = score;
    });

    // 3. Ordina il sottoinsieme selezionato per MVP Score decrescente
    selectedPlayers.sort((a, b) => b.dynamic_mvp_score - a.dynamic_mvp_score);

    // 4. Aggiorna visivamente il Sidebar (D), il Line Chart e il Box Plot
    updateSidebar(selectedPlayers); // Mostra il candidato top del selection
    updateBoxPlot(selectedPlayers);   // Ridisegna i quartili sul sottoinsieme
}