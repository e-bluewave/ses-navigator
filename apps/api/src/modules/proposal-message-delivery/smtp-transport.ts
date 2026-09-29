import net from 'node:net';
import tls from 'node:tls';
import type {
  SmtpTransport,
  SmtpTransportInput,
  SmtpTransportResult,
} from './proposal-message-delivery-service.js';

type Socket = net.Socket | tls.TLSSocket;

export const nodeSmtpTransport: SmtpTransport = async (
  input: SmtpTransportInput,
): Promise<SmtpTransportResult> => {
  let socket: Socket = input.secure
    ? tls.connect({ host: input.host, port: input.port, servername: input.host })
    : net.connect({ host: input.host, port: input.port });

  const read = responseReader(() => socket);
  await waitConnected(socket, input.secure);
  await expect(read, [220]);

  await command(socket, read, `EHLO ses-navigator`, [250]);

  if (!input.secure) {
    await command(socket, read, 'STARTTLS', [220]);
    socket = tls.connect({ socket, servername: input.host });
    await waitConnected(socket, true);
    await command(socket, read, `EHLO ses-navigator`, [250]);
  }

  await command(socket, read, 'AUTH LOGIN', [334]);
  await command(
    socket,
    read,
    Buffer.from(input.username, 'utf8').toString('base64'),
    [334],
  );
  await command(
    socket,
    read,
    Buffer.from(input.password, 'utf8').toString('base64'),
    [235],
  );

  await command(socket, read, `MAIL FROM:<${input.sender}>`, [250]);
  await command(socket, read, `RCPT TO:<${input.recipient}>`, [250, 251]);
  await command(socket, read, 'DATA', [354]);

  const messageId = `<${crypto.randomUUID()}@ses-navigator>`;
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
  const dataResponse = await expect(read, [250]);
  socket.write('QUIT\r\n');
  socket.end();

  return {
    accepted: true,
    responseCode: String(dataResponse.code),
    messageId,
  };
};

function waitConnected(socket: Socket, secure: boolean): Promise<void> {
  const event = secure ? 'secureConnect' : 'connect';
  if (
    (!secure && !socket.connecting) ||
    (secure && (socket as tls.TLSSocket).authorized)
  ) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    socket.once(event, resolve);
    socket.once('error', reject);
  });
}

function responseReader(getSocket: () => Socket) {
  let buffer = '';
  return () =>
    new Promise<{ code: number; text: string }>((resolve, reject) => {
      const socket = getSocket();
      const onData = (chunk: Buffer) => {
        buffer += chunk.toString('utf8');
        const lines = buffer.split('\r\n');
        for (let index = 0; index < lines.length - 1; index += 1) {
          const line = lines[index] ?? '';
          const match = /^(\d{3})([ -])(.*)$/.exec(line);
          if (!match || match[2] === '-') continue;
          const consumed = lines.slice(0, index + 1).join('\r\n') + '\r\n';
          buffer = buffer.slice(consumed.length);
          cleanup();
          resolve({ code: Number(match[1]), text: match[3] ?? '' });
          return;
        }
      };
      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };
      const cleanup = () => {
        socket.off('data', onData);
        socket.off('error', onError);
      };
      socket.on('data', onData);
      socket.once('error', onError);
    });
}

async function command(
  socket: Socket,
  read: ReturnType<typeof responseReader>,
  value: string,
  expected: number[],
) {
  socket.write(value + '\r\n');
  return expect(read, expected);
}

async function expect(
  read: ReturnType<typeof responseReader>,
  expected: number[],
) {
  const response = await read();
  if (!expected.includes(response.code)) {
    throw new Error(`SMTP command failed with status ${response.code}`);
  }
  return response;
}

function encodeHeader(value: string): string {
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

function dotStuff(value: string): string {
  return value.replace(/(^|\r\n)\./g, '$1..');
}
