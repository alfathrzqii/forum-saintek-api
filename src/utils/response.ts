import type { Context } from 'elysia';

export interface ApiResponse<T = unknown> {
  status: string;
  message: string;
  data?: T;
}

/**
 * Standardized API Response Formatter
 * @param status - 'success' or 'error'
 * @param message - Human readable message
 * @param data - Payload data (optional, omitted when null)
 */
export function formatResponse<T>(
  status: string,
  message: string,
  data: T | null = null,
): ApiResponse<T> {
  const response: ApiResponse<T> = { status, message };
  if (data !== null) {
    response.data = data;
  }
  return response;
}

export function successResponse<T>(
  set: Pick<Context['set'], 'status'>,
  message: string,
  data: T | null = null,
  statusCode = 200,
): ApiResponse<T> {
  set.status = statusCode;
  return formatResponse('success', message, data);
}
