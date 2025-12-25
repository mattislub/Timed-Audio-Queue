import type { AppSettings, RepeatSetting } from '../App';

export const MAX_REPEAT_PLAYS = 6;

const DEFAULT_REPEAT: RepeatSetting = {
  gapSeconds: 30,
  playbackRate: 1,
};

const SINGLE_PLAY_FALLBACK: RepeatSetting = {
  gapSeconds: 0,
  playbackRate: 1,
};

export function sanitizeRepeatSettings(repeats: RepeatSetting[]): RepeatSetting[] {
  const sanitized = repeats.slice(0, MAX_REPEAT_PLAYS).map(repeat => ({
    gapSeconds: Math.max(0, Math.round(repeat.gapSeconds)),
    playbackRate: Math.min(3, Math.max(0.5, Number(repeat.playbackRate.toFixed(2)))),
  }));

  while (sanitized.length < MAX_REPEAT_PLAYS) {
    sanitized.push(DEFAULT_REPEAT);
  }

  return sanitized;
}

export function getEffectiveRepeats(settings: AppSettings): RepeatSetting[] {
  const normalizedRepeats = sanitizeRepeatSettings(settings.repeatSettings);

  if (!settings.repeatEnabled) {
    return [normalizedRepeats[0] ?? SINGLE_PLAY_FALLBACK];
  }

  return normalizedRepeats;
}
