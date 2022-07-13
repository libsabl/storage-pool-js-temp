// Copyright 2022 Joshua Honig. All rights reserved.
// Use of this source code is governed by a MIT
// license that can be found in the LICENSE file.

import {
  getStorageApi,
  StorageApi,
  StorageMode,
  StoragePool,
  StorageTxn,
  Transactable,
  TxnOptions,
  withStorageApi,
} from '$';
import { PromiseHandle } from '$test/lib/util';
import { Canceler, Context, IContext, Maybe } from '@sabl/context';

export interface StackApi extends StorageApi {
  push(ctx: IContext, val: unknown): Promise<number>;
  peek(ctx: IContext): Promise<unknown>;
  pop(ctx: IContext): Promise<unknown>;
}

export interface StackTxn extends StorageTxn, StackApi {}

export interface StackTransactable extends Transactable {
  beginTxn(ctx: IContext, opts?: TxnOptions): Promise<StackTxn>;
}

export interface StackConn extends StackApi, StackTransactable {
  close(): Promise<void>;
}

export interface StackPool extends StackApi, StackTransactable {
  conn(ctx: IContext): Promise<StackConn>;
  close(): Promise<void>;
}

export function withStackApi(ctx: IContext, stack: StackApi): Context {
  return withStorageApi(ctx, stack);
}

export function getStackApi(ctx: IContext): Maybe<StackApi> {
  const api = getStorageApi(ctx);
  if (api == null) return null;
  if (api.kind !== 'stack') return null;
  return <StackApi>api;
}

interface StackOp {
  op: 'push' | 'pop';
  val?: unknown;
}

class MemStackTxn implements StackTxn {
  readonly #con: MemStackConn;
  readonly #stack: unknown[];
  readonly #snap: unknown[];
  readonly #ops: StackOp[] = [];
  readonly #readonly: boolean;

  #done = false;
  #clr?: Canceler;
  #onCancel: null | (() => void) = null;

  constructor(
    con: MemStackConn,
    stack: unknown[],
    opts: TxnOptions | undefined,
    clr: Canceler | null
  ) {
    this.#con = con;
    this.#stack = stack;
    this.#snap = stack.concat();
    this.#readonly = (opts || {}).readOnly === true;

    if (clr != null) {
      this.#clr = clr;
      clr.onCancel((this.#onCancel = this.#cancel.bind(this)));
    }
  }

  get mode(): StorageMode {
    return StorageMode.txn;
  }

  get kind(): string {
    return 'stack';
  }

  #cancel() {
    if (this.#onCancel) {
      this.#clr?.off(this.#onCancel);
      this.#onCancel = null;
    }
    if (!this.#done) {
      this.rollback();
    }
  }

  #checkStatus(mod = false) {
    if (this.#done) {
      throw new Error('Transaction is already complete');
    }
    if (mod && this.#readonly) {
      throw new Error('Cannot push or pop: Transaction is read-only');
    }
  }

  #complete(): Promise<void> {
    this.#cancel();
    return this.#con._txnDone(this) || Promise.resolve();
  }

  commit(): Promise<void> {
    this.#checkStatus();
    this.#done = true;

    for (const op of this.#ops) {
      if (op.op == 'pop') {
        this.#stack.pop();
      } else if (op.op == 'push') {
        this.#stack.push(op.val);
      }
    }

    return this.#complete();
  }

  rollback(): Promise<void> {
    this.#checkStatus();
    this.#done = true;

    // Nothing to do

    return this.#complete();
  }

  push(ctx: IContext, val: unknown): Promise<number> {
    this.#checkStatus(true);
    this.#ops.push({ op: 'push', val });
    this.#snap.push(val);
    return Promise.resolve(this.#snap.length);
  }

  pop(/* ctx: IContext */): Promise<unknown> {
    this.#checkStatus(true);
    this.#ops.push({ op: 'pop' });
    return Promise.resolve(this.#snap.pop());
  }

  peek(/* ctx: IContext */): Promise<unknown> {
    this.#checkStatus();
    return Promise.resolve(this.#snap[this.#snap.length - 1]);
  }
}

class MemStackConn implements StackConn {
  readonly #stack: unknown[];
  readonly #txns: MemStackTxn[] = [];
  readonly #pool: MemStackPool;

  #keepOpen = false;
  #closed = false;
  #closeResolve: PromiseHandle<void> | null = null;

  constructor(pool: MemStackPool, stack: unknown[], keepOpen: boolean) {
    this.#pool = pool;
    this.#stack = stack;
    this.#keepOpen = keepOpen;
  }

  get mode(): StorageMode {
    return StorageMode.conn;
  }
  get kind(): string {
    return 'stack';
  }

  #checkStatus() {
    if (this.#closed) {
      throw new Error('Connection is closed');
    }
  }

  close(): Promise<void> {
    this.#checkStatus();
    this.#closed = true;
    for (const txnId in this.#txns) {
      // Still a transaction open.
      return (this.#closeResolve = new PromiseHandle<void>()).promise;
    }
    this.#pool._release(this);
    return Promise.resolve();
  }

  beginTxn(ctx: IContext, opts?: TxnOptions | undefined): Promise<StackTxn> {
    this.#checkStatus();
    const txn = new MemStackTxn(this, this.#stack, opts, ctx.canceler);
    this.#txns.push(txn);
    return Promise.resolve(txn);
  }

  push(ctx: IContext, val: unknown): Promise<number> {
    this.#checkStatus();
    this.#stack.push(val);
    return Promise.resolve(this.#stack.length);
  }

  pop(/* ctx: IContext */): Promise<unknown> {
    this.#checkStatus();
    return Promise.resolve(this.#stack.pop());
  }

  peek(/* ctx: IContext */): Promise<unknown> {
    this.#checkStatus();
    return Promise.resolve(this.#stack[this.#stack.length - 1]);
  }

  _txnDone(txn: MemStackTxn): null | Promise<void> {
    const ix = this.#txns.indexOf(txn);
    if (ix < 0) {
      return null;
    }

    this.#txns.splice(ix, 1);

    if (this.#txns.length == 0) {
      if (this.#closeResolve != null) {
        for (const txnId in this.#txns) {
          // Still a transaction open.
          return null;
        }
        // No more transactions open.
        // Release the connection and resolve the close call
        this.#pool._release(this);
        this.#closeResolve.resolve();
        return null;
      }

      if (!this.#keepOpen) {
        return this.close();
      }
    }

    return null;
  }
}

class MemStackPool implements StackPool {
  readonly #stack: unknown[];
  readonly #active: MemStackConn[] = [];
  #closed = false;
  #waitClose: PromiseHandle<void> | null = null;

  constructor(stack: unknown[]) {
    this.#stack = stack;
  }

  get mode(): StorageMode {
    return StorageMode.pool;
  }
  get kind(): string {
    return 'stack';
  }

  #checkStatus() {
    if (this.#closed) {
      throw new Error('Pool is closed');
    }
  }

  conn(/* ctx: IContext */): Promise<StackConn> {
    this.#checkStatus();
    return Promise.resolve(new MemStackConn(this, this.#stack, true));
  }

  close(): Promise<void> {
    if (this.#closed) {
      return this.#waitClose?.promise || Promise.resolve();
    }

    this.#closed = true;
    if (this.#active.length > 0) {
      const p = (this.#waitClose = new PromiseHandle<void>()).promise;
      for (const c of this.#active) {
        // Signal all connections to close
        // NOT awaiting here. We want to signal
        // all connections immediately
        c.close();
      }
      return p;
    }

    return Promise.resolve();
  }

  beginTxn(ctx: IContext, opts?: TxnOptions | undefined): Promise<StackTxn> {
    this.#checkStatus();
    const con = new MemStackConn(this, this.#stack, false);
    return con.beginTxn(ctx, opts);
  }

  async push(ctx: IContext, val: unknown): Promise<number> {
    this.#checkStatus();
    const con = await this.conn();
    try {
      return con.push(ctx, val);
    } finally {
      con.close();
    }
  }

  async pop(ctx: IContext): Promise<unknown> {
    this.#checkStatus();
    const con = await this.conn();
    try {
      return con.pop(ctx);
    } finally {
      con.close();
    }
  }

  async peek(ctx: IContext): Promise<unknown> {
    this.#checkStatus();
    const con = await this.conn();
    try {
      return con.peek(ctx);
    } finally {
      con.close();
    }
  }

  _release(con: MemStackConn): void {
    const ix = this.#active.indexOf(con);
    if (ix < 0) {
      return;
    }
    this.#active.splice(ix, 1);

    if (this.#active.length == 0) {
      const wc = this.#waitClose;
      if (wc != null) {
        this.#waitClose = null;
        wc.resolve();
      }
    }
  }
}

export function openStackPool(stack: unknown[]): StoragePool & StackApi {
  return new MemStackPool(stack);
}
