import {
  advanceCreate,
  advanceDelete,
  advanceDocId,
  advanceList,
  advanceUpdate,
} from '@/lib/api';
import type { TrainingDepartment, TrainingFormInput, TrainingRecord } from '@/lib/trainingMatrixStore';

export const TRAINING_MATRIX_PATH = 'training-matrix';

type TrainingMatrixDoc = {
  id: string;
  name: string;
  minPassPercent?: number | null;
  frequencyMonths: number | null;
  departments: TrainingDepartment[];
  note?: string;
  createdAt?: string;
  updatedAt?: string;
};

function readStationIds(normalized: Record<string, unknown>): string[] {
  const fromArray = Array.isArray(normalized.stationIds)
    ? normalized.stationIds.map((id) => String(id).trim()).filter(Boolean)
    : [];
  if (fromArray.length > 0) return [...new Set(fromArray)];
  const legacy = String(normalized.stationId ?? '').trim();
  return legacy ? [legacy] : [];
}

export function mapTrainingRecord(doc: unknown): TrainingRecord {
  const normalized = advanceDocId(doc as Record<string, unknown>);
  const note = String(normalized.note ?? '').trim();

  return {
    id: normalized.id,
    stationIds: readStationIds(normalized),
    name: String(normalized.name ?? '').trim(),
    minPassPercent:
      normalized.minPassPercent != null && normalized.minPassPercent !== ''
        ? Number(normalized.minPassPercent)
        : undefined,
    frequencyMonths:
      normalized.frequencyMonths === null || normalized.frequencyMonths === undefined
        ? null
        : Number(normalized.frequencyMonths),
    departments: Array.isArray(normalized.departments)
      ? (normalized.departments as TrainingDepartment[])
      : [],
    note: note || undefined,
    createdAt:
      typeof normalized.createdAt === 'string'
        ? normalized.createdAt
        : normalized.createdAt instanceof Date
          ? normalized.createdAt.toISOString()
          : undefined,
  };
}

export function trainingFormToPayload(form: TrainingFormInput): Record<string, unknown> {
  const note = form.note.trim();
  const minPass = form.minPassPercent.trim();

  return {
    stationIds: [...new Set(form.stationIds.map((id) => id.trim()).filter(Boolean))],
    name: form.name.trim(),
    minPassPercent: minPass ? Number(minPass) : null,
    frequencyMonths: form.frequencyOnce ? null : Number(form.frequencyMonths.trim()),
    departments: [...form.departments],
    note: note || '',
  };
}

export async function fetchTrainingMatrix(filter?: string): Promise<TrainingRecord[]> {
  const rows = await advanceList(TRAINING_MATRIX_PATH, filter ? { filter } : undefined);
  return rows.map(mapTrainingRecord);
}

export async function createTrainingMatrixEntry(
  form: TrainingFormInput,
): Promise<TrainingRecord> {
  const created = await advanceCreate(TRAINING_MATRIX_PATH, trainingFormToPayload(form));
  return mapTrainingRecord(created);
}

export async function updateTrainingMatrixEntry(
  id: string,
  form: TrainingFormInput,
): Promise<TrainingRecord> {
  const updated = await advanceUpdate(TRAINING_MATRIX_PATH, id, trainingFormToPayload(form));
  return mapTrainingRecord(updated);
}

export async function deleteTrainingMatrixEntry(id: string): Promise<void> {
  await advanceDelete(TRAINING_MATRIX_PATH, id);
}

export type { TrainingMatrixDoc };
