import numpy as np
import pandas as pd
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler


def compute_mvp_pca(
    input_cleaned_file="mvp_candidates_cleaned.csv",
    output_pca_file="mvp_candidates_pca.csv",
):
    # 1. Caricamento del dataset pulito
    df = pd.read_csv(input_cleaned_file)

    # 2. Selezione delle feature numeriche per la PCA
    features_pca = [
        "GP",
        "MIN",
        "PTS",
        "REB",
        "AST",
        "STL",
        "BLK",
        "TOV",
        "FG_PCT",
        "FG3_PCT",
        "FT_PCT",
        "TS_PCT",
        "Team_W_PCT",
        "Plus_Minus",
        "Off_Rating",
        "Def_Rating",
        "Net_Rating",
        "USG_PCT",
        "PIE",
        "PCT_PTS",
        "PCT_AST",
        "PCT_REB",
        "PTS_Paint",
        "PTS_FastBreak",
        "PTS_Off_TOV",
    ]

    X = df[features_pca].values

    # 3. Standardizzazione Z-Score
    scaler = StandardScaler()
    X_std = scaler.fit_transform(X)

    # 4. PCA su 2 Componenti Principali
    pca = PCA(n_components=2)
    X_pca = pca.fit_transform(X_std)

    # 5. Varianza Spiegata
    var_pc1 = pca.explained_variance_ratio_[0]
    var_pc2 = pca.explained_variance_ratio_[1]

    print(f"Varianza Spiegata PC1: {var_pc1:.4f} ({var_pc1*100:.2f}%)")
    print(f"Varianza Spiegata PC2: {var_pc2:.4f} ({var_pc2*100:.2f}%)")
    print(
        f"Varianza Cumulata R^2: "
        f"{var_pc1 + var_pc2:.4f} "
        f"({(var_pc1 + var_pc2)*100:.2f}%)"
    )

    # 6. Aggiunta delle coordinate PC1 e PC2
    df["PC1"] = X_pca[:, 0]
    df["PC2"] = X_pca[:, 1]

    # 7. Salvataggio
    df.to_csv(output_pca_file, index=False)

    print(f"Dataset PCA salvato in: '{output_pca_file}'")


if __name__ == "__main__":
    compute_mvp_pca()