import net from 'node:net';
import tls from 'node:tls';
import { randomUUID } from 'node:crypto';
import type {
  SmtpTransport,
  SmtpTransportInput,
  SmtpTransportResult,
} from './proposal-message-delivery-service.js';

type Socket = net.Socket | tls.TLSSocket;
const TIMEOUT_MS = 15_000;

export class SmtpResponseError extends Error {
  constructor(readonly responseCode: string) {
    super(`SMTP command failed with status ${responseCode}`);
  }
}

export const nodeSmtpTransport: SmtpTransport = async (
  input: SmtpTransportInput,
): Promise<SmtpTransportResult> => {
  if (
    ![input.sender, input.recipient].every((address) =>
      /^[^<>\s\r\n@]+@[^<>\s\r\n@]+$/.test(address),
    ) ||
    /[\r\n]/.test(input.subject)
  ) {
    throw new Error('Invalid SMTP envelope or header');
  }
  let socket: Socket = input.secure
    ? tls.connect({
        host: input.host,
        port: input.port,
        servername: input.host,
      })
    : net.connect({ host: input.host, port: input.port });
  let reader = responseReader(socket);
  socket.setTimeout(TIMEOUT_MS, () =>
    socket.destroy(new Error('SMTP timeout')),
  );

  try {
    await waitConnected(socket, input.secure);
    await expect(reader, [220]);
    await command(socket, reader, 'EHLO ses-navigator', [250]);

    if (!input.secure) {
      await command(socket, reader, 'STARTTLS', [220]);
      reader.close();
      socket = tls.connect({ socket, servername: input.host });
      socket.setTimeout(TIMEOUT_MS, () =>
        socket.destroy(new Error('SMTP timeout')),
      );
      reader = responseReader(socket);
      await waitConnected(socket, true);
      await command(socket, reader, 'EHLO ses-navigator', [250]);
    }

    await command(socket, reader, 'AUTH LOGIN', [334]);
    await command(
      socket,
      reader,
      Buffer.from(input.username, 'utf8').toString('base64'),
      [334],
    );
    await command(
      socket,
      reader,
      Buffer.from(input.password, 'utf8').toString('base64'),
      [235],
    );
    await command(socket, reader, `MAIL FROM:<${input.sender}>`, [250]);
    await command(socket, reader, `RCPT TO:<${input.recipient}>`, [250, 251]);
    await command(socket, reader, 'DATA', [354]);

    const messageId = `<${randomUUID()}@ses-navigator>`;
    const message = [
      `From: <${input.sender}>`,
      `To: <${input.recipient}>`,
      `Subject: ${encodeHeader(input.subject)}`,
      `Message-ID: ${messageId}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(input.bodyText, 'utf8').toString('base64'),
    ].join('\r\n');
    socket.write(dotStuff(message) + '\r\n.\r\n');
    const response = await expect(reader, [250]);
    socket.write('QUIT\r\n');
    return { accepted: true, responseCode: String(response.code), messageId };
  } finally {
    reader.close();
    socket.destroy();
  }
};

function waitConnected(socket: Socket, secure: boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    const event = secure ? 'secureConnect' : 'connect';
    const cleanup = () => {
      socket.off(event, connected);
      socket.off('error', failed);
      socket.off('close', closed);
    };
    const connected = () => {
      cleanup();
      if (secure && !(socket as tls.TLSSocket).authorized) {
        reject(new Error('SMTP TLS certificate validation failed'));
      } else resolve();
    };
    const failed = (error: Error) => {
      cleanup();
      reject(error);
    };
    const closed = () => {
      cleanup();
      reject(new Error('SMTP connection closed'));
    };
    socket.once(event, connected);
    socket.once('error', failed);
    socket.once('close', closed);
  });
}

function responseReader(socket: Socket) {
  let buffer = '';
  let lines: string[] = [];
  const responses: number[] = [];
  let terminalError: Error | null = null;
  let waiting: ((code: number) => void) | null = null;
  let rejectWaiting: ((error: Error) => void) | null = null;
  const onData = (chunk: Buffer) => {
    buffer += chunk.toString('utf8');
    let end: number;
    while ((end = buffer.indexOf('\r\n')) !== -1) {
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const match = /^(\d{3})([ -])/.exec(line);
      if (!match) {
        onError(new Error('Invalid SMTP response'));
        return;
      }
      lines.push(line);
      if (match[2] === ' ') {
        const code = Number(match[1]);
        lines = [];
        if (waiting) {
          const resolve = waiting;
          waiting = null;
          rejectWaiting = null;
          resolve(code);
        } else responses.push(code);
      }
    }
  };
  const onError = (error: Error) => {
    terminalError = error;
    if (rejectWaiting) {
      const reject = rejectWaiting;
      waiting = null;
      rejectWaiting = null;
      reject(error);
    }
  };
  const onClose = () => onError(new Error('SMTP connection closed'));
  socket.on('data', onData);
  socket.on('error', onError);
  socket.on('close', onClose);
  return {
    next: () =>
      new Promise<number>((resolve, reject) => {
        if (responses.length) {
          resolve(responses.shift()!);
          return;
        }
        if (terminalError) {
          reject(terminalError);
          return;
        }
        waiting = resolve;
        rejectWaiting = reject;
      }),
    close: () => {
      socket.off('data', onData);
      socket.off('error', onError);
      socket.off('close', onClose);
    },
  };
}

async function command(
  socket: Socket,
  reader: ReturnType<typeof responseReader>,
  value: string,
  expected: number[],
) {
  socket.write(value + '\r\n');
  return expect(reader, expected);
}

async function expect(
  reader: ReturnType<typeof responseReader>,
  expected: number[],
) {
  const code = await reader.next();
  if (!expected.includes(code)) throw new SmtpResponseError(String(code));
  return { code };
}

function encodeHeader(value: string): string {
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

function dotStuff(value: string): string {
  return value.replace(/(^|\r\n)\./g, '$1..');
}
