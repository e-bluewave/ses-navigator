export {};

declare global {
  interface RequestInit {
    headers?: Record<string, string>;
  }

  interface Response {
    readonly ok: boolean;
    readonly status: number;
    json(): Promise<unknown>;
  }
}
