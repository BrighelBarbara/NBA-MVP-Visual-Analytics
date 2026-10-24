import json
from pathlib import Path

import pandas as pd
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent

def compute_mvp_pca(
    input_cleaned_file=HERE / "mvp_candidates_cleaned.csv",
    output_pca_file=ROOT / "data" / "mvp_candidates_pca.csv",
    output_meta_file=ROOT / "data" / "pca_meta.json",
):

    df = pd.read_csv(input_cleaned_file)

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

    scaler = StandardScaler()
    X_std = scaler.fit_transform(X)

    pca = PCA(n_components=2)
    X_pca = pca.fit_transform(X_std)

    loadings = pd.DataFrame(pca.components_.T, index=features_pca, columns=["PC1", "PC2"])
    for pc, anchor in (("PC1", "REB"), ("PC2", "PTS")):
        if loadings.loc[anchor, pc] < 0:
            loadings[pc] *= -1
            X_pca[:, int(pc[-1]) - 1] *= -1

    var_pc1 = pca.explained_variance_ratio_[0]
    var_pc2 = pca.explained_variance_ratio_[1]

    print(f"Varianza Spiegata PC1: {var_pc1:.4f} ({var_pc1*100:.2f}%)")
    print(f"Varianza Spiegata PC2: {var_pc2:.4f} ({var_pc2*100:.2f}%)")
    print(
        f"Varianza Cumulata: "
        f"{var_pc1 + var_pc2:.4f} "
        f"({(var_pc1 + var_pc2)*100:.2f}%)"
    )

    df["PC1"] = X_pca[:, 0]
    df["PC2"] = X_pca[:, 1]

    df.to_csv(output_pca_file, index=False)

    meta = {
        "features": features_pca,
        "explained_variance": {"PC1": round(float(var_pc1), 4), "PC2": round(float(var_pc2), 4)},
        "loadings": {
            f: {"PC1": round(float(loadings.loc[f, "PC1"]), 3), "PC2": round(float(loadings.loc[f, "PC2"]), 3)}
            for f in features_pca
        },
    }
    with open(output_meta_file, "w") as f:
        json.dump(meta, f, indent=2)

    print(f"Dataset PCA salvato in: '{output_pca_file}'")
    print(f"Metadati PCA salvati in: '{output_meta_file}'")

if __name__ == "__main__":
    compute_mvp_pca()
