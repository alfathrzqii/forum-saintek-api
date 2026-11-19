export interface HttpRequestOptions {
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  rawBody?: BodyInit | null;
  token?: string;
  ip?: string;
  cfConnectingIp?: string;
  omitForwardedFor?: boolean;
  omitContentType?: boolean;
  redirect?: RequestRedirect;
}

export interface HttpResponse<T = any> {
  status: number;
  headers: Headers;
  body: T | null;
  rawText: string;
}

export interface HttpClient {
  baseUrl: string;
  defaultIp?: string;
  request<T = any>(
    method: string,
    path: string,
    options?: HttpRequestOptions,
  ): Promise<HttpResponse<T>>;
  get<T = any>(path: string, options?: HttpRequestOptions): Promise<HttpResponse<T>>;
  post<T = any>(
    path: string,
    body?: unknown,
    options?: Omit<HttpRequestOptions, 'body'>,
  ): Promise<HttpResponse<T>>;
  put<T = any>(
    path: string,
    body?: unknown,
    options?: Omit<HttpRequestOptions, 'body'>,
  ): Promise<HttpResponse<T>>;
  del<T = any>(
    path: string,
    body?: unknown,
    options?: Omit<HttpRequestOptions, 'body'>,
  ): Promise<HttpResponse<T>>;
}

function hasHeaderCaseInsensitive(
  headers: Record<string, string>,
  target: string,
): boolean {
  const lower = target.toLowerCase();
  return Object.keys(headers).some((k) => k.toLowerCase() === lower);
}

function buildUrl(
  baseUrl: string,
  path: string,
  query?: Record<string, string | number | boolean | undefined>,
): string {
  const cleanBase = baseUrl.replace(/\/+$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(`${cleanBase}${cleanPath}`);

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  return url.toString();
}

export function createHttpClient(baseUrl: string, defaultIp?: string): HttpClient {
  async function request<T = any>(
    method: string,
    path: string,
    options: HttpRequestOptions = {},
  ): Promise<HttpResponse<T>> {
    const mergedHeaders: Record<string, string> = { ...(options.headers ?? {}) };

    if (
      options.token !== undefined &&
      !hasHeaderCaseInsensitive(mergedHeaders, 'authorization')
    ) {
      mergedHeaders['Authorization'] = `Bearer ${options.token}`;
    }

    if (options.cfConnectingIp !== undefined) {
      if (!hasHeaderCaseInsensitive(mergedHeaders, 'cf-connecting-ip')) {
        mergedHeaders['CF-Connecting-IP'] = options.cfConnectingIp;
      }
    } else if (!options.omitForwardedFor) {
      const effectiveIp = options.ip ?? defaultIp;
      if (effectiveIp && !hasHeaderCaseInsensitive(mergedHeaders, 'x-forwarded-for')) {
        mergedHeaders['X-Forwarded-For'] = effectiveIp;
      }
    }

    let fetchBody: BodyInit | undefined;
    if (options.rawBody !== undefined) {
      fetchBody = options.rawBody === null ? undefined : options.rawBody;
      if (
        !options.omitContentType &&
        !hasHeaderCaseInsensitive(mergedHeaders, 'content-type')
      ) {
        mergedHeaders['Content-Type'] = 'application/json';
      }
    } else if (options.body !== undefined) {
      fetchBody = JSON.stringify(options.body);
      if (
        !options.omitContentType &&
        !hasHeaderCaseInsensitive(mergedHeaders, 'content-type')
      ) {
        mergedHeaders['Content-Type'] = 'application/json';
      }
    }

    const res = await fetch(buildUrl(baseUrl, path, options.query), {
      method: method.toUpperCase(),
      headers: mergedHeaders,
      body: fetchBody,
      redirect: options.redirect ?? 'follow',
    });

    const rawText = await res.text();
    let parsedBody: T | null = null;
    if (rawText.length > 0) {
      try {
        parsedBody = JSON.parse(rawText) as T;
      } catch {
        parsedBody = null;
      }
    }

    return {
      status: res.status,
      headers: res.headers,
      body: parsedBody,
      rawText,
    };
  }

  return {
    baseUrl,
    defaultIp,
    request,
    get: <T = any>(path: string, options?: HttpRequestOptions) =>
      request<T>('GET', path, options),
    post: <T = any>(
      path: string,
      body?: unknown,
      options?: Omit<HttpRequestOptions, 'body'>,
    ) => request<T>('POST', path, { ...options, body }),
    put: <T = any>(
      path: string,
      body?: unknown,
      options?: Omit<HttpRequestOptions, 'body'>,
    ) => request<T>('PUT', path, { ...options, body }),
    del: <T = any>(
      path: string,
      body?: unknown,
      options?: Omit<HttpRequestOptions, 'body'>,
    ) => request<T>('DELETE', path, { ...options, body }),
  };
}
