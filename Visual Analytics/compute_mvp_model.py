import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge
from sklearn.preprocessing import StandardScaler

# 1. Caricamento del dataset pulito
df = pd.read_csv('mvp_candidates_cleaned.csv')

# 2. Selezione delle feature chiave per spiegare le votazioni MVP
features = [
    'Team_W_PCT',
    'WS',
    'PIE',
    'USG_PCT',
    'AST',
    'REB',
    'PTS',
    'TS_PCT',
]

# 3. Rimozione delle righe con valori mancanti
df_model = df[features + ['MVP_Share']].dropna()

X = df_model[features]
y = df_model['MVP_Share']

print(f"Righe totali nel dataset: {len(df)}")
print(f"Righe utilizzate nel modello: {len(df_model)}")
print(f"Righe escluse: {len(df) - len(df_model)}")

# 4. Standardizzazione Z-Score
scaler = StandardScaler()
X_std = scaler.fit_transform(X)

# 5. Fit del modello di Regressione Ridge
model = Ridge(alpha=1.0)
model.fit(X_std, y)

# 6. R²
print(
    f'\nR^2 Score del modello MVP Share: '
    f'{model.score(X_std, y):.4f}'
)

# 7. Coefficienti
print('\nPesi (Coefficients) identificati:')
for feat, coef in zip(features, model.coef_):
    print(f'  - {feat:12s}: {coef:.4f}')