/** Every successful HTTP response. */
export interface ApiSuccessResponse<T = unknown> {
  status: 'success';
  statusCode: number;
  message: string;
  data: T;
  /** Present on paginated/list endpoints. */
  meta?: object;
  timestamp: string;
  path: string;
}

/** Every failed HTTP response. */
export interface ApiErrorResponse {
  status: 'error';
  statusCode: number;
  message: string;
  /** Field-level details for validation errors. */
  errors?: FieldError[];
  data: null;
  timestamp: string;
  path: string;
}

export interface FieldError {
  field: string;
  messages: string[];
}

const DEFAULT_MESSAGES: Record<number, string> = {
  200: 'Success',
  201: 'Created',
  202: 'Accepted',
  204: 'No Content',
  400: 'Bad request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not found',
  409: 'Conflict',
  413: 'Payload too large',
  429: 'Too many requests, please slow down',
  500: 'Internal server error',
  503: 'Service unavailable',
};

export function defaultMessageFor(statusCode: number): string {
  return DEFAULT_MESSAGES[statusCode] ?? (statusCode < 400 ? 'Success' : 'Error');
}
