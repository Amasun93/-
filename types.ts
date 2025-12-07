export enum RainState {
  FALLING = 'FALLING',
  PAUSED = 'PAUSED',
  RISING = 'RISING'
}

export interface MagicQuote {
  text: string;
  author: string;
}

export interface HandPosition {
  x: number;
  y: number; // 0.0 (top) to 1.0 (bottom)
  force: number; // -1.0 (Open Hand/Repel) to 1.0 (Fist/Attract), 0 is neutral
}