import { advanceDocId, fetchFlightsReferenceAircraft } from '@/lib/api';
import type { SearchableComboOption } from '@/components/ui/SearchableCombobox';

/** Aircraft types from Advance aircraft catalog (station-session reference API). */
export async function fetchGatewayAircraftOptions(): Promise<SearchableComboOption[]> {
  const list = (await fetchFlightsReferenceAircraft()) as Record<string, unknown>[];
  const seen = new Set<string>();
  const options: SearchableComboOption[] = [];

  for (const doc of list) {
    const d = advanceDocId(doc);
    const aircraft = String(d.aircraft ?? '').trim().toUpperCase();
    if (!aircraft || seen.has(aircraft)) continue;
    seen.add(aircraft);

    const body = d.aircraftBody === 'WB' ? 'WB' : 'NB';
    const mtow = String(d.mtow ?? '').trim();
    const description = String(d.description ?? '').trim();
    const category = String(d.category ?? '').trim();

    options.push({
      id: aircraft,
      label: aircraft,
      searchIndex: `${aircraft} ${body} ${mtow} ${description} ${category}`,
    });
  }

  return options.sort((a, b) => a.label.localeCompare(b.label));
}
