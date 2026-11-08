export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly httpStatus: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }

  get status(): number {
    return this.httpStatus;
  }
}
