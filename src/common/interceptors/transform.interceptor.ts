import { ApiResponseInterceptor } from './api-response.interceptor.js';
import type { ApiResponseEnvelope } from './api-response.interceptor.js';

export { ApiResponseInterceptor };
export type { ApiResponseEnvelope };
export const TransformInterceptor = ApiResponseInterceptor;
export type ApiResponse<T> = ApiResponseEnvelope<T>;
