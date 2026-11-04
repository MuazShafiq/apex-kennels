/** Deliberate input/duplicate conflict errors safe to return to authorized intake callers. */
export class IntakeError extends Error {
  readonly status: number;
  constructor(message: string, status: number = 400) {
    super(message);
    this.name = 'IntakeError';
    this.status = status;
  }
}
