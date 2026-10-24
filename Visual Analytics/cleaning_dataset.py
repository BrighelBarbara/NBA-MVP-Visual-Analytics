from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent

def clean_mvp_dataset(input_path: str, output_path: str):

  df = pd.read_csv(input_path)

  df['MVP_Rank'] = df['Rank'].astype(str).str.replace('T', '').astype(int)

  columns_mapping = {

      'Season': 'Season',
      'PLAYER_NAME': 'Player',
      'PLAYER_ID': 'Player_ID',
      'TEAM_ABBREVIATION': 'Team',
      'AGE': 'Age',
      'tactical_era': 'Tactical_Era',
      'is_mvp_winner': 'Is_MVP_Winner',

      'MVP_Rank': 'MVP_Rank',
      'First': 'MVP_First_Votes',
      'PtsWon': 'MVP_Pts_Won',
      'PtsMax': 'MVP_Pts_Max',
      'Share': 'MVP_Share',

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

  df_clean = df[list(columns_mapping.keys())].rename(columns=columns_mapping)

  df_clean.to_csv(output_path, index=False)
  print(
      f'Pulizia completata con successo!'
      f' Generato file: {output_path} ({df_clean.shape[0]} righe, '
      f'{df_clean.shape[1]} colonne)'
  )

if __name__ == '__main__':
  clean_mvp_dataset(
      ROOT / 'data1' / 'processed' / 'mvp_candidates_final.csv',
      HERE / 'mvp_candidates_cleaned.csv',
  )
