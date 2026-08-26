export {};

declare global {
  interface RequestInit {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  }

  interface Response {
    readonly ok: boolean;
    readonly status: number;
    json(): Promise<unknown>;
  }
}
