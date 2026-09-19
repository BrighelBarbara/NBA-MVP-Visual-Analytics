import pandas as pd


def clean_mvp_dataset(input_path: str, output_path: str):
  # 1. Carica il dataset grezzo originale
  df = pd.read_csv(input_path)

  # 2. Pulisci la colonna Rank (es. trasforma '16T' con pareggio nel numero intero 16)
  df['MVP_Rank'] = df['Rank'].astype(str).str.replace('T', '').astype(int)

  # 3. Definizione della mappatura: seleziona le colonne ufficiali (NBA API) ed elimina i duplicati
  columns_mapping = {
      # --- Anagrafica, Identificativi e Contesto ---
      'Season': 'Season',
      'PLAYER_NAME': 'Player',
      'PLAYER_ID': 'Player_ID',
      'TEAM_ABBREVIATION': 'Team',
      'AGE': 'Age',
      'tactical_era': 'Tactical_Era',
      'is_mvp_winner': 'Is_MVP_Winner',
      # --- Votazioni MVP e Consenso ---
      'MVP_Rank': 'MVP_Rank',
      'First': 'MVP_First_Votes',
      'PtsWon': 'MVP_Pts_Won',
      'PtsMax': 'MVP_Pts_Max',
      'Share': 'MVP_Share',
      # --- Statistiche Box-Score Tradizionali (Fonte NBA API) ---
      'GP': 'GP',
      'MIN': 'MIN',
      'PTS': 'PTS',
      'REB': 'REB',
      'AST': 'AST',
      'STL': 'STL',
      'BLK': 'BLK',
      'TOV': 'TOV',
      'FG_PCT': 'FG_PCT',
      'FG3_PCT': 'FG3_PCT',
      'FT_PCT': 'FT_PCT',
      'TS_PCT': 'TS_PCT',
      'WS': 'WS',
      'WS48': 'WS48',
      # --- Analytics Avanzate e Impatto Tattico ---
      'W_PCT': 'Team_W_PCT',
      'PLUS_MINUS': 'Plus_Minus',
      'OFF_RATING': 'Off_Rating',
      'DEF_RATING': 'Def_Rating',
      'NET_RATING': 'Net_Rating',
      'USG_PCT': 'USG_PCT',
      'PIE': 'PIE',
      'PCT_PTS': 'PCT_PTS',
      'PCT_AST': 'PCT_AST',
      'PCT_REB': 'PCT_REB',
      'PTS_PAINT': 'PTS_Paint',
      'PTS_FB': 'PTS_FastBreak',
      'PTS_OFF_TOV': 'PTS_Off_TOV',
  }

  # 4. Filtra solo le colonne definite ed applica i nuovi nomi puliti
  df_clean = df[list(columns_mapping.keys())].rename(columns=columns_mapping)

  # 5. Salva il file pulito finale
  df_clean.to_csv(output_path, index=False)
  print(
      f'Pulizia completata con successo!'
      f' Generato file: {output_path} ({df_clean.shape} righe, '
      f'{df_clean.shape[1]} colonne)'
  )


# Esecuzione
if __name__ == '__main__':
  clean_mvp_dataset('mvp_candidates_final.csv', 'mvp_candidates_cleaned.csv')