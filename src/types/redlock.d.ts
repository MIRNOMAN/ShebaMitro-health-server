declare module 'redlock' {
  import { EventEmitter } from 'events';

  export class Lock {
    readonly redlock: Redlock;
    readonly resources: string[];
    readonly value: string;
    expiration: number;
    release(): Promise<any>;
    extend(duration: number): Promise<Lock>;
  }

  export interface Settings {
    readonly driftFactor: number;
    readonly retryCount: number;
    readonly retryDelay: number;
    readonly retryJitter: number;
    readonly automaticExtensionThreshold: number;
  }

  export default class Redlock extends EventEmitter {
    constructor(clients: Iterable<any>, settings?: Partial<Settings>);
    acquire(
      resources: string[],
      duration: number,
      settings?: Partial<Settings>,
    ): Promise<Lock>;
    release(lock: Lock, settings?: Partial<Settings>): Promise<any>;
    extend(
      existing: Lock,
      duration: number,
      settings?: Partial<Settings>,
    ): Promise<Lock>;
    quit(): Promise<void>;
  }
}
