export interface Puzzle {
    id: string | number;
    name: string;
    language: string;
}

export interface StatusInfo {
    text?: string;
    color: string;
    i18nKey?: string;
}