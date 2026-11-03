import { createHash } from 'node:crypto';

export type IntakeRequest = {
  source: 'google_form';
  externalResponseId: string;
  customerName: string;
  email?: string;
  phone?: string;
  petName: string;
  startDate: string;
  endDate: string;
  accommodationType?: string;
};

export class IntakeError extends Error {
  readonly status: number;
  constructor(message: string, status: number = 400) {
    super(message);
    this.name = 'IntakeError';
    this.status = status;
  }
}

function textField(value: unknown, name: string, max = 200, required = true): string | undefined {
  if ((value === undefined || value === null || value === '') && !required) return undefined;
  if (typeof value !== 'string') throw new IntakeError(`${name} must be a string`);
  const normalized = value.trim();
  if (!normalized || normalized.length > max || /[\u0000-\u001F\u007F]/.test(normalized)) {
    throw new IntakeError(`Invalid ${name}`);
  }
  return normalized;
}

function checkDate(value: string, name: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new IntakeError(`Invalid ${name}`);
  const [year, month, day] = value.split('-').map(Number);
  const ms = Date.UTC(year, month - 1, day);
  if (new Date(ms).toISOString().slice(0, 10) !== value) throw new IntakeError(`Invalid ${name}`);
  return ms;
}

/** Only the fields explicitly mapped by a trusted Google Forms adapter may enter the system. */
export function parseIntake(value: unknown): IntakeRequest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new IntakeError('Expected a JSON object');
  }
  const row = value as Record<string, unknown>;
  if (row.source !== 'google_form') throw new IntakeError('Unsupported booking source');
  const externalResponseId = textField(row.externalResponseId, 'externalResponseId', 160)!;
  const customerName = textField(row.customerName, 'customerName')!;
  const email = textField(row.email, 'email', 254, false)?.toLowerCase();
  const phone = textField(row.phone, 'phone', 40, false);
  if (!email && !phone) throw new IntakeError('A contact email or phone is required');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new IntakeError('Invalid email');
  const petName = textField(row.petName, 'petName')!;
  const startDate = textField(row.startDate, 'startDate', 10)!;
  const endDate = textField(row.endDate, 'endDate', 10)!;
  const start = checkDate(startDate, 'startDate');
  const end = checkDate(endDate, 'endDate');
  if (end < start || (end - start) / 86400000 > 366) throw new IntakeError('Invalid stay duration');
  const accommodationType = textField(row.accommodationType, 'accommodationType', 120, false);
  return { source:'google_form', externalResponseId, customerName, email, phone, petName, startDate, endDate, accommodationType };
}

/** Canonical immutable import identity; does not contain invoice prices or private tokens. */
export function fingerprintIntake(input: IntakeRequest): string {
  return createHash('sha256').update(JSON.stringify({
    source: input.source, externalResponseId: input.externalResponseId,
    customerName: input.customerName, email: input.email ?? null,
    phone: input.phone ?? null, petName: input.petName,
    startDate: input.startDate, endDate: input.endDate,
    accommodationType: input.accommodationType ?? null
  })).digest('hex');
}
