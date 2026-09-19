import pandas as pd

# Carica il dataset
df = pd.read_csv("mvp_candidates_final.csv")

# Inserisci qui i nomi delle due colonne da confrontare
colonna1 = "FTpct"
colonna2 = "FT_PCT"

# Controlla che le colonne esistano
if colonna1 not in df.columns:
    print(f"Errore: la colonna '{colonna1}' non esiste nel dataset.")
elif colonna2 not in df.columns:
    print(f"Errore: la colonna '{colonna2}' non esiste nel dataset.")
else:
    # Confronto riga per riga
    uguali = df[colonna1] == df[colonna2]

    # Numero di righe uguali e diverse
    numero_uguali = uguali.sum()
    numero_diverse = (~uguali).sum()

    print(f"Confronto tra '{colonna1}' e '{colonna2}':")
    print(f"  - Righe uguali:  {numero_uguali}")
    print(f"  - Righe diverse: {numero_diverse}")