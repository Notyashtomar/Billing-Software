import indiaStateCities from '@/data/india-state-cities.json';
import { INDIA_STATE_OPTIONS } from '@/data/india-state-options';
import { FORM_OTHER_OPTION } from '@/lib/org-structure-options';
import { matchCanonicalOption } from '@/lib/searchable-select-other';

type IndiaStateCitiesMap = Record<string, string[]>;

const STATE_CITIES = indiaStateCities as IndiaStateCitiesMap;

export function resolveIndiaStateKey(state: string): string | null {
  const trimmed = state.trim();
  if (!trimmed || trimmed === FORM_OTHER_OPTION) return null;
  return matchCanonicalOption(trimmed, INDIA_STATE_OPTIONS);
}

export function getCitiesForState(state: string): string[] {
  const key = resolveIndiaStateKey(state);
  if (!key) return [];
  return STATE_CITIES[key] ?? [];
}

/** Clear city when the state changes and the current city cannot apply. */
export function reconcileCityForState(
  state: string,
  city: string,
  previousState?: string,
): string {
  const trimmedCity = city.trim();
  if (!trimmedCity) return '';

  const cities = getCitiesForState(state);
  const matched = cities.length ? matchCanonicalOption(trimmedCity, cities) : null;
  if (matched) return matched;

  const stateUnchanged =
    previousState !== undefined &&
    resolveIndiaStateKey(previousState) === resolveIndiaStateKey(state);

  if (!cities.length || stateUnchanged) {
    return trimmedCity;
  }

  return '';
}
