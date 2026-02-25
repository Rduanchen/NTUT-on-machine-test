export interface Puzzle {
  id: string; // derived from puzzle index
  title: string;
  language: string;
}

export interface StatusInfo {
  text?: string;
  color: string;
  i18nKey?: string;
}
