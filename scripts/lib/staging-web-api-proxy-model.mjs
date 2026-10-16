// Tested design only. No deployed route imports this module, and neither the
// token provider nor fetch has a live default. Runtime enablement is a separate gate.
const API_ORIGIN =
  'https://ses-navigator-staging-git-codex-issue-167-b1ce58-ebw-s-projects.vercel.app';
const UUID = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
const COLLECTION = '(?:companies|contacts|engineers|projects|proposals)';
const route = (method, path) => [method, new RegExp(`^/api/v1${path}$`, 'u')];
const routes = [
  route('GET', '/auth/context'),
  route('GET', `/${COLLECTION}`),
  route('GET', `/${COLLECTION}/${UUID}`),
  route('POST', `/${COLLECTION}`),
  route('PUT', `/${COLLECTION}/${UUID}`),
  route('POST', `/projects/${UUID}/ai/match-engineers`),
  route('GET', `/projects/${UUID}/ai/matches/latest`),
  route('POST', `/proposals/${UUID}/ai/message-drafts`),
  route('GET', `/proposals/${UUID}/ai/message-drafts/latest`),
  route('PUT', `/proposals/${UUID}/ai/message-drafts/${UUID}`),
  route('POST', `/proposals/${UUID}/ai/message-drafts/${UUID}/review`),
  route('GET', `/proposals/${UUID}/messages/${UUID}/delivery`),
  route('POST', `/proposals/${UUID}/messages/${UUID}/(?:send|retry)`),
];
const queryKeys = new Set([
  'q',
  'limit',
  'cursor',
  'status',
  'recruitmentStatus',
  'availabilityStatus',
  'companyId',
]);

function failure(status, code) {
  return Response.json(
    { error: { code, message: 'Staging APIへの接続を確認できません。' } },
    { status, headers: { 'cache-control': 'no-store' } },
  );
}

function withAbort(operation, signal) {
  return new Promise((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', stop);
    const stop = () => {
      cleanup();
      reject(new Error('Request stopped'));
    };
    if (signal.aborted) {
      stop();
      return;
    }
    signal.addEventListener('abort', stop, { once: true });
    Promise.resolve()
      .then(() => {
        if (signal.aborted) throw new Error('Request stopped');
        return operation();
      })
      .then(
        (value) => {
          cleanup();
          resolve(value);
        },
        (error) => {
          cleanup();
          reject(error);
        },
      );
  });
}

async function boundedText(stream, limit, signal) {
  if (!stream) return { text: '', byteLength: 0 };
  const reader = stream.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await withAbort(() => reader.read(), signal);
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error('Body limit');
      chunks.push(value);
    }
  } finally {
    // Cancellation of an unresponsive source must not delay the deadline.
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  return {
    text: new TextDecoder('utf-8', { fatal: true }).decode(
      Buffer.concat(chunks),
    ),
    byteLength: size,
  };
}

export function createStagingApiProxyModel({
  webOrigin,
  runtimeEnvironment,
  getOidcToken,
  fetchImpl,
  createDeadlineSignal = () => AbortSignal.timeout(30_000),
}) {
  const origin = new URL(webOrigin);
  if (
    runtimeEnvironment !== 'preview' ||
    origin.origin !== webOrigin ||
    origin.protocol !== 'https:' ||
    webOrigin === API_ORIGIN ||
    !origin.hostname.endsWith('.vercel.app') ||
    origin.username ||
    origin.password ||
    origin.port ||
    typeof getOidcToken !== 'function' ||
    typeof fetchImpl !== 'function' ||
    typeof createDeadlineSignal !== 'function'
  ) {
    throw new Error('Staging proxy design configuration is invalid');
  }

  return async function handle(request) {
    const url = new URL(request.url);
    const host = request.headers.get('host');
    if (
      url.origin !== webOrigin ||
      url.username ||
      url.password ||
      url.hash ||
      (host !== null && host !== origin.host) ||
      /%|\\/u.test(url.pathname)
    )
      return failure(403, 'origin_denied');
    const matches = routes.filter(([, pattern]) => pattern.test(url.pathname));
    if (!matches.length) return failure(404, 'route_denied');
    if (!matches.some(([method]) => request.method === method))
      return failure(405, 'method_denied');
    const incomingOrigin = request.headers.get('origin');
    const site = request.headers.get('sec-fetch-site');
    if (
      (incomingOrigin !== null && incomingOrigin !== webOrigin) ||
      (site !== null && site !== 'same-origin') ||
      (request.method !== 'GET' && incomingOrigin !== webOrigin)
    )
      return failure(403, 'origin_denied');
    for (const [key, value] of url.searchParams) {
      if (
        !queryKeys.has(key) ||
        url.searchParams.getAll(key).length !== 1 ||
        value.length > 512 ||
        [...value].some((character) => {
          const code = character.charCodeAt(0);
          return code < 32 || code === 127;
        })
      )
        return failure(400, 'query_denied');
    }
    const authorization = request.headers.get('authorization') ?? '';
    if (!/^Bearer [A-Za-z0-9._~-]{1,8192}$/u.test(authorization))
      return failure(401, 'authentication_required');
    for (const name of [
      'transfer-encoding',
      'content-encoding',
      'expect',
      'trailer',
      'x-http-method-override',
      'x-method-override',
    ]) {
      if (request.headers.has(name)) return failure(400, 'framing_denied');
    }
    const length = request.headers.get('content-length');
    if (length !== null && !/^(?:0|[1-9][0-9]{0,8})$/u.test(length))
      return failure(400, 'framing_denied');
    if (length !== null && Number(length) > 256 * 1024)
      return failure(413, 'body_limit');
    if (request.method === 'GET' && length !== null && Number(length) !== 0)
      return failure(400, 'framing_denied');
    const headers = new Headers({ authorization, accept: 'application/json' });
    const version = request.headers.get('if-match');
    if (
      (request.method === 'PUT' || /\/review$/u.test(url.pathname)) &&
      version === null
    )
      return failure(400, 'version_required');
    if (version !== null) {
      if (!/^"[0-9]{1,12}"$/u.test(version))
        return failure(400, 'version_denied');
      headers.set('if-match', version);
    }
    if (/\/messages\/[^/]+\/(?:send|retry)$/u.test(url.pathname)) {
      const key = request.headers.get('idempotency-key') ?? '';
      if (!/^[A-Za-z0-9_-]{8,128}$/u.test(key))
        return failure(400, 'idempotency_key_required');
      headers.set('idempotency-key', key);
    }

    const signal = AbortSignal.any([request.signal, createDeadlineSignal()]);
    const stopped = () =>
      failure(request.signal.aborted ? 408 : 504, 'request_stopped');
    if (signal.aborted) return stopped();
    let body;
    if (request.method !== 'GET') {
      if (
        !/^application\/json(?:;\s*charset=utf-8)?$/iu.test(
          request.headers.get('content-type') ?? '',
        )
      )
        return failure(415, 'json_required');
      try {
        const read = await boundedText(request.body, 256 * 1024, signal);
        if (length !== null && Number(length) !== read.byteLength)
          return failure(400, 'framing_denied');
        body = read.text;
        const parsed = JSON.parse(body);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
          return failure(400, 'json_object_required');
      } catch {
        if (signal.aborted) return stopped();
        return failure(400, 'body_denied');
      }
      headers.set('content-type', 'application/json');
    }

    try {
      // Future adapter must call the official runtime SDK in request context.
      // Never obtain this value from browser headers or a VITE_ build variable.
      const token = await withAbort(() => getOidcToken(), signal);
      if (
        typeof token !== 'string' ||
        !token ||
        token.length > 16_384 ||
        /\s/u.test(token)
      )
        return failure(502, 'workload_identity_unavailable');
      headers.set('x-vercel-trusted-oidc-idp-token', token);
      const response = await withAbort(
        () =>
          fetchImpl(`${API_ORIGIN}${url.pathname}${url.search}`, {
            method: request.method,
            headers,
            ...(body === undefined ? {} : { body }),
            redirect: 'manual',
            credentials: 'omit',
            cache: 'no-store',
            signal,
          }),
        signal,
      );
      // Protection pages, redirects and upstream errors never reach the browser.
      if (response.status >= 300 && response.status < 400) {
        void response.body?.cancel().catch(() => undefined);
        return failure(502, 'upstream_redirect_denied');
      }
      if (!response.ok) {
        void response.body?.cancel().catch(() => undefined);
        return failure(response.status, 'upstream_api_rejected');
      }
      if (response.status === 204)
        return new Response(null, {
          status: 204,
          headers: { 'cache-control': 'no-store' },
        });
      if (
        !/^application\/json(?:;|$)/iu.test(
          response.headers.get('content-type') ?? '',
        )
      ) {
        void response.body?.cancel().catch(() => undefined);
        return failure(502, 'upstream_json_required');
      }
      const { text } = await boundedText(response.body, 1024 * 1024, signal);
      const result = JSON.parse(text);
      const serialized = JSON.stringify(result);
      if (
        serialized.includes(token) ||
        serialized.includes(authorization.slice(7))
      )
        return failure(502, 'upstream_body_denied');
      return Response.json(result, {
        status: response.status,
        headers: { 'cache-control': 'no-store' },
      });
    } catch {
      if (signal.aborted) return stopped();
      return failure(502, 'upstream_unavailable');
    }
  };
}
