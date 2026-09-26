import { isMainModule } from './cli-entry.mjs';

const REQUIRED_VARIABLES = [
  'MESSAGE_DELIVERY_PROVIDER',
  'MICROSOFT_GRAPH_TENANT_ID',
  'MICROSOFT_GRAPH_CLIENT_ID',
  'MICROSOFT_GRAPH_CLIENT_SECRET',
  'MICROSOFT_GRAPH_SENDER',
];

export async function runMicrosoftGraphMailPreflight({
  env = process.env,
  fetchImpl = fetch,
  log = console.log,
} = {}) {
  const missing = REQUIRED_VARIABLES.filter((name) => !env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  }

  if (
    env.MESSAGE_DELIVERY_PROVIDER.trim().toLowerCase() !== 'microsoft_graph'
  ) {
    throw new Error(
      'MESSAGE_DELIVERY_PROVIDER must be microsoft_graph for this preflight',
    );
  }

  const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(
    env.MICROSOFT_GRAPH_TENANT_ID.trim(),
  )}/oauth2/v2.0/token`;

  const response = await fetchImpl(tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.MICROSOFT_GRAPH_CLIENT_ID.trim(),
      client_secret: env.MICROSOFT_GRAPH_CLIENT_SECRET,
      grant_type: 'client_credentials',
      scope: 'https://graph.microsoft.com/.default',
    }).toString(),
  });

  const body = await readJson(response);
  if (!response.ok || typeof body.access_token !== 'string') {
    throw new Error(
      `Microsoft Graph token acquisition failed (HTTP ${response.status})`,
    );
  }

  const payload = decodeJwtPayload(body.access_token);
  const roles = Array.isArray(payload.roles)
    ? payload.roles.filter((value) => typeof value === 'string')
    : [];

  if (!roles.includes('Mail.Send')) {
    throw new Error(
      'Microsoft Graph access token does not include the Mail.Send application role',
    );
  }

  const result = {
    status: 'MICROSOFT_GRAPH_MAIL_PREFLIGHT_PASSED',
    tokenAcquired: true,
    mailSendRole: true,
    senderConfigured: true,
  };
  log(JSON.stringify(result, null, 2));
  return result;
}

function decodeJwtPayload(token) {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[1]) {
    throw new Error('Microsoft Graph access token was not a JWT');
  }

  try {
    const text = Buffer.from(parts[1], 'base64url').toString('utf8');
    const payload = JSON.parse(text);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error('invalid payload');
    }
    return payload;
  } catch {
    throw new Error('Microsoft Graph access token payload could not be read');
  }
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

if (isMainModule(import.meta.url)) {
  runMicrosoftGraphMailPreflight()
    .then(() => console.log('Microsoft Graph mail preflight passed'))
    .catch((error) => {
      console.error(
        error instanceof Error
          ? error.message
          : 'Microsoft Graph mail preflight failed',
      );
      process.exitCode = 1;
    });
}
