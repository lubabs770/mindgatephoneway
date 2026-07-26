/** Normalized message — the only shape anything downstream depends on. */
export interface Message {
  id: string;
  threadId: string | null;
  direction: string | null;
  sender: string | null;
  body: string | null;
  ts: number | null;
  raw: unknown;
}

export type CaptureMode = 'sniff' | 'dom';
export type SinkType = 'sqlite' | 'jsonl' | 'webhook';
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Sink {
  save(m: Message): boolean | Promise<boolean>;
}
