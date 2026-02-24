declare module "@browserbasehq/stagehand" {
  interface StagehandConfig {
    env?: string;
    enableCaching?: boolean;
    headless?: boolean;
    modelName?: string;
    modelClientOptions?: { apiKey?: string };
  }

  interface StagehandPage {
    act(instruction: string): Promise<unknown>;
    extract(instruction: string, schema?: unknown): Promise<unknown>;
    observe(instruction: string): Promise<unknown[]>;
    goto(url: string): Promise<void>;
    url(): string;
    screenshot(): Promise<Buffer>;
  }

  export class Stagehand {
    constructor(config: StagehandConfig);
    init(): Promise<void>;
    page: StagehandPage;
    close(): Promise<void>;
  }
}

declare module "nopecha" {
  interface SolveOptions {
    type: string;
    sitekey: string;
    url: string;
  }

  class NopeCHA {
    constructor(options: { key: string });
    solve(options: SolveOptions): Promise<string>;
  }

  export default NopeCHA;
}

declare module "imapflow" {
  interface ImapFlowConfig {
    host: string;
    port: number;
    secure: boolean;
    auth: { user: string; pass: string };
    logger?: boolean | object;
  }

  interface MailboxLock {
    release(): void;
  }

  interface FetchedMessage {
    envelope: {
      from: Array<{ address: string }>;
      subject: string;
    };
    source: Buffer;
  }

  export class ImapFlow {
    constructor(config: ImapFlowConfig);
    connect(): Promise<void>;
    getMailboxLock(mailbox: string): Promise<MailboxLock>;
    fetchOne(seq: string, query: object): Promise<FetchedMessage>;
    idle(): Promise<void>;
    on(event: string, handler: (...args: unknown[]) => void): void;
    logout(): Promise<void>;
    close(): Promise<void>;
  }
}
