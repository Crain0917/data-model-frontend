import axios, { AxiosError } from 'axios';

export interface ApiEnvelope<T> {
  code: number;
  data: T;
  msg: string;
}

export class ApiError extends Error {
  code: number;
  data?: unknown;
  httpStatus?: number;
  constructor(message: string, code = -1, data?: unknown, httpStatus?: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.data = data;
    this.httpStatus = httpStatus;
  }
}

export const http = axios.create({
  baseURL: '/api',
  timeout: 20000,
  headers: { 'Content-Type': 'application/json' },
});

http.interceptors.response.use(
  (response) => {
    const body = response.data as ApiEnvelope<unknown>;
    if (body && typeof body === 'object' && 'code' in body) {
      if (body.code !== 0) {
        throw new ApiError(body.msg || '请求失败', body.code, body.data, response.status);
      }
      return body.data as never;
    }
    return response.data as never;
  },
  (error: AxiosError<ApiEnvelope<unknown>>) => {
    if (error.code === 'ECONNABORTED') {
      throw new ApiError('请求超时，请稍后重试', -1, undefined, error.response?.status);
    }
    if (!error.response) {
      throw new ApiError('网络异常，请检查网络后重试', -1, undefined, undefined);
    }
    const body = error.response.data;
    if (body && typeof body === 'object' && 'code' in body) {
      throw new ApiError(body.msg || '服务异常，请稍后重试', body.code, body.data, error.response.status);
    }
    throw new ApiError(
      `服务异常（HTTP ${error.response.status}），请稍后重试或联系管理员`,
      -1,
      undefined,
      error.response.status,
    );
  },
);
