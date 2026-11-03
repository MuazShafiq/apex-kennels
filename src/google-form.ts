/** Adapter boundary. Replace this mapper when Fatima grants access to all 5 form pages. */
export type FieldMapping = {
  responseId: string; customerName: string; email?: string; phone?: string;
  petName: string; startDate: string; endDate: string;
};
export type ImportedRequest = {
  source: 'google_form'; externalResponseId: string; customerName: string;
  email?: string; phone?: string; petName: string; startDate: string; endDate: string;
};
export function mapFormResponse(row: Record<string, unknown>, mapping: FieldMapping): ImportedRequest {
  const required = (key: string | undefined, label: string): string => {
    if (!key || typeof row[key] !== 'string' || !(row[key] as string).trim()) throw new Error(`Missing ${label}`);
    return (row[key] as string).trim();
  };
  const optional = (key?: string): string | undefined => key && typeof row[key] === 'string' && (row[key] as string).trim() || undefined;
  const email = optional(mapping.email), phone = optional(mapping.phone);
  if (!email && !phone) throw new Error('No contact method available');
  return {
    source: 'google_form', externalResponseId: required(mapping.responseId, 'response ID'),
    customerName: required(mapping.customerName, 'customer name'), email, phone,
    petName: required(mapping.petName, 'pet name'),
    startDate: required(mapping.startDate, 'start date'), endDate: required(mapping.endDate, 'end date'),
  };
}
