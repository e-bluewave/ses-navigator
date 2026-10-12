import net from 'node:net';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';

import { nodeSmtpTransport } from '../src/modules/proposal-message-delivery/smtp-transport.js';

const input = {
  host: '127.0.0.1',
  port: 0,
  secure: false,
  username: 'synthetic-user',
  password: 'synthetic-password',
  sender: 'sender@example.invalid',
  recipient: 'recipient@example.invalid',
  subject: 'Synthetic only',
  bodyText: 'This must never be sent.',
};

async function withGreeting(
  greeting: string,
  check: (port: number, commands: string[]) => Promise<void>,
) {
  const commands: string[] = [];
  const server = net.createServer((socket) => {
    socket.on('error', () => undefined);
    socket.on('data', (chunk) => commands.push(chunk.toString('utf8')));
    socket.write(greeting);
  });
  await new Promise<void>((resolve) => server.listen(0, input.host, resolve));
  try {
    const address = server.address() as AddressInfo;
    await check(address.port, commands);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

describe('SMTP response parser safety', () => {
  it('rejects an oversized greeting before authentication', async () => {
    await withGreeting(
      `220 ${'x'.repeat(70_000)}\r\n`,
      async (port, commands) => {
        await expect(nodeSmtpTransport({ ...input, port })).rejects.toThrow(
          'SMTP response exceeds limit',
        );
        expect(commands).toEqual([]);
      },
    );
  });

  it('rejects inconsistent multiline codes before authentication', async () => {
    await withGreeting(
      '220-first\r\n250 second\r\n',
      async (port, commands) => {
        await expect(nodeSmtpTransport({ ...input, port })).rejects.toThrow(
          'Invalid SMTP multiline response',
        );
        expect(commands).toEqual([]);
      },
    );
  });
});
