import { timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingHttpHeaders, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { z } from 'zod';

const webhookPath = '/webhooks/google-form-submit';
const healthPath = '/health';
const maxBodyBytes = 32_768;

const submitPayloadSchema = z.object({
  spreadsheetId: z.string().min(1),
  sheetName: z.string().min(1),
  rowNumber: z.coerce.number().int().min(2),
});

type LoggerLike = {
  error(payload: unknown, message?: string): void;
  info(message: string): void;
};

type GoogleFormWebhookRequest = {
  method: string;
  path: string;
  secret: string;
  body: string;
};

type GoogleFormWebhookDeps = {
  expectedSecret: string;
  expectedSheetName: string;
  expectedSpreadsheetId: string;
  workflow: {
    processSubmittedRow(rowNumber: number): Promise<boolean>;
  };
};

type GoogleFormWebhookResponse = {
  body: Record<string, string>;
  statusCode: number;
};

type GoogleFormWebhookServerOptions = GoogleFormWebhookDeps & {
  logger: LoggerLike;
  port: number;
};

export function createGoogleFormWebhookServer(options: GoogleFormWebhookServerOptions) {
  const server = createServer((request, response) => {
    handleHttpRequest(request, response, options).catch((error) => {
      options.logger.error({ error }, 'Google Form webhook failed');
      writeJson(response, {
        body: { error: 'Internal server error' },
        statusCode: 500,
      });
    });
  });

  return {
    async start(): Promise<void> {
      await listen(server, options.port);
      options.logger.info(`Google Form webhook server listening on port ${options.port}`);
    },
  };
}

export async function handleGoogleFormWebhook(
  request: GoogleFormWebhookRequest,
  deps: GoogleFormWebhookDeps,
): Promise<GoogleFormWebhookResponse> {
  if (request.path === healthPath) {
    return { body: { status: 'ok' }, statusCode: 200 };
  }

  if (request.path !== webhookPath) {
    return { body: { error: 'Not found' }, statusCode: 404 };
  }

  if (request.method !== 'POST') {
    return { body: { error: 'Method not allowed' }, statusCode: 405 };
  }

  if (!secretsMatch(request.secret, deps.expectedSecret)) {
    return { body: { error: 'Unauthorized' }, statusCode: 401 };
  }

  const payload = parsePayload(request.body);

  if (!payload) {
    return { body: { error: 'Invalid payload' }, statusCode: 400 };
  }

  if (payload.spreadsheetId !== deps.expectedSpreadsheetId) {
    return { body: { error: 'Unexpected spreadsheet id' }, statusCode: 409 };
  }

  if (payload.sheetName !== deps.expectedSheetName) {
    return { body: { error: 'Unexpected sheet name' }, statusCode: 409 };
  }

  const processed = await deps.workflow.processSubmittedRow(payload.rowNumber);

  return {
    body: { status: processed ? 'processed' : 'ignored' },
    statusCode: 200,
  };
}

async function handleHttpRequest(
  request: IncomingMessage,
  response: ServerResponse,
  deps: GoogleFormWebhookServerOptions,
): Promise<void> {
  const result = await handleGoogleFormWebhook({
    method: request.method ?? 'GET',
    path: getRequestPath(request),
    secret: getHeader(request.headers, 'x-webhook-secret'),
    body: await readBody(request),
  }, deps);

  writeJson(response, result);
}

function getRequestPath(request: IncomingMessage): string {
  return new URL(request.url ?? '/', 'http://localhost').pathname;
}

function getHeader(headers: IncomingHttpHeaders, name: string): string {
  const value = headers[name];

  if (Array.isArray(value)) {
    return value[0] ?? '';
  }

  return value ?? '';
}

function parsePayload(body: string): z.infer<typeof submitPayloadSchema> | null {
  try {
    return submitPayloadSchema.parse(JSON.parse(body));
  } catch {
    return null;
  }
}

function secretsMatch(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);

  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(actualBuffer, expectedBuffer);
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';

    request.on('data', (chunk: Buffer) => {
      body += chunk.toString('utf8');

      if (Buffer.byteLength(body) > maxBodyBytes) {
        request.destroy(new Error('Webhook body is too large'));
      }
    });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const handleError = (error: Error): void => {
      server.off('listening', handleListening);
      reject(error);
    };
    const handleListening = (): void => {
      server.off('error', handleError);
      resolve();
    };

    server.once('error', handleError);
    server.once('listening', handleListening);
    server.listen(port);
  });
}

function writeJson(response: ServerResponse, result: GoogleFormWebhookResponse): void {
  if (response.headersSent) {
    return;
  }

  response.writeHead(result.statusCode, { 'content-type': 'application/json' });
  response.end(JSON.stringify(result.body));
}
