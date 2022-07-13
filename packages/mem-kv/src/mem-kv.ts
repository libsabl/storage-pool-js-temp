// Copyright 2022 Joshua Honig. All rights reserved.
// Use of this source code is governed by a MIT
// license that can be found in the LICENSE file.

/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { Canceler, IContext } from '@sabl/context';
import { StorageKind, StorageMode, TxnOptions } from '@sabl/storage-api';

import { FnReject, FnResolve, PromiseHandle } from './util';
import { KeyValConn, KeyValPool, KeyValTxn } from './key-val-api';

export type PlainObject = { [key: string]: unknown };

class MemKvConn implements KeyValConn {
  readonly #store: PlainObject;
  readonly #pool: MemKvPool;
  #keepOpen = false;
  #closed = false;
  #waitClose: PromiseHandle<void> | null = null;
  #txn: MemKvTxn | null = null;

  constructor(store: PlainObject, pool: MemKvPool) {
    this.#store = store;
    this.#pool = pool;
  }

  reset(keepOpen: boolean) {
    this.#closed = false;
    this.#keepOpen = keepOpen;
  }

  get mode(): StorageMode {
    return StorageMode.conn;
  }
  get kind(): string {
    return StorageKind.keyval;
  }

  close(): Promise<void> {
    if (this.#closed) {
      return Promise.resolve();
    }
    this.#closed = true;

    if (this.#txn != null) {
      if (this.#waitClose != null) {
        return this.#waitClose.promise;
      }
      const pWait = (this.#waitClose = new PromiseHandle<void>()).promise;
      return pWait;
    }

    this.#pool.return(this);
    return Promise.resolve();
  }

  set(ctx: IContext, key: string, val: unknown): Promise<void> {
    if (this.#closed) {
      throw new Error('Connection is closed');
    }

    this.#store[key] = val;
    return Promise.resolve();
  }

  get(ctx: IContext, key: string): Promise<unknown> {
    if (this.#closed) {
      throw new Error('Connection is closed');
    }

    return Promise.resolve(this.#store[key]);
  }

  delete(ctx: IContext, key: string): Promise<void> {
    if (this.#closed) {
      throw new Error('Connection is closed');
    }

    delete this.#store[key];
    return Promise.resolve();
  }

  beginTxn(ctx: IContext, opts?: TxnOptions | undefined): Promise<KeyValTxn> {
    if (this.#closed) {
      throw new Error('Connection is closed');
    }

    const txn = new MemKvTxn(this.#store, opts, () => this.#txnDone());
    return Promise.resolve(txn);
  }

  #txnDone(): null | Promise<void> {
    this.#txn = null;
    const wc = this.#waitClose;

    if (wc != null) {
      // Close already requested
      this.#waitClose = null;
      this.#pool.return(this);
      wc.resolve();
      return null;
    }

    if (!this.#keepOpen) {
      return this.close();
    }

    return null;
  }
}

function cancelableConnRequest(clr: Canceler): PromiseHandle<MemKvConn> {
  let res: FnResolve<MemKvConn>;
  let rej: FnReject;

  const p = new Promise<MemKvConn>((resolve, reject) => {
    let timedOut = false;
    let resolved = false;

    const handle: {
      onCancel: () => void;
    } = { onCancel: null! };

    handle.onCancel = () => {
      clr.off(handle.onCancel);
      if (resolved) {
        // Already resolved
        return;
      }
      timedOut = true;
      reject(
        new Error('Context was canceled before a connection was available')
      );
    };

    clr.onCancel(handle.onCancel);

    // External reject
    rej = (err) => {
      if (timedOut) {
        // Already rejected. Ignore
        return;
      }
      resolved = true;
      clr.off(handle.onCancel);
      return reject(err);
    };

    // External resolve
    res = (value) => {
      const con = <MemKvConn>value;
      if (timedOut) {
        // Already rejected.
        // Be sure to release the con back to the pool!
        con.close();
        return;
      }
      resolved = true;
      clr.off(handle.onCancel);
      return resolve(con);
    };
  });
  return new PromiseHandle(p, res!, rej!);
}

class MemKvPool implements KeyValPool {
  readonly #store: PlainObject;
  readonly #maxCnt: number;
  readonly #reqQueue: PromiseHandle<MemKvConn>[] = [];
  #closed = false;
  #active: MemKvConn[] = [];
  #pool: MemKvConn[] = [];

  constructor(store: PlainObject, maxCnt: number) {
    this.#store = store;
    this.#maxCnt = maxCnt;
  }

  get mode(): StorageMode {
    return StorageMode.pool;
  }
  get kind(): string {
    return StorageKind.keyval;
  }

  conn(ctx: IContext): Promise<KeyValConn> {
    if (this.#closed) {
      throw new Error('Pool is closed');
    }
    if (this.#pool.length > 0) {
      const conn = <MemKvConn>this.#pool.shift();
      conn.reset(true);
      this.#active.push(conn);
      return Promise.resolve(conn);
    }
    if (this.#active.length < this.#maxCnt) {
      const conn = new MemKvConn(this.#store, this);
      conn.reset(true);
      this.#active.push(conn);
      return Promise.resolve(conn);
    }

    const clr = ctx.canceler;
    if (clr != null) {
      const h = cancelableConnRequest(clr);
      this.#reqQueue.push(h);
      return h.promise;
    } else {
      const h = new PromiseHandle<MemKvConn>();
      this.#reqQueue.push(h);
      return h.promise;
    }
  }

  async close(): Promise<void> {
    if (this.#closed) {
      return;
    }

    this.#closed = true;
    this.#pool.splice(0, this.#pool.length);
    const promises = [];
    for (const c of this.#active) {
      promises.push(c.close());
    }
    if (promises.length > 0) {
      await Promise.all(promises);
    }
  }

  async beginTxn(
    ctx: IContext,
    opts?: TxnOptions | undefined
  ): Promise<KeyValTxn> {
    const con = <MemKvConn>await this.conn(ctx);
    con.reset(false);
    return con.beginTxn(ctx, opts);
  }

  async set(ctx: IContext, key: string, val: unknown): Promise<void> {
    const con = <MemKvConn>await this.conn(ctx);
    try {
      return con.set(ctx, key, val);
    } finally {
      await con.close();
    }
  }

  async get(ctx: IContext, key: string): Promise<unknown> {
    const con = <MemKvConn>await this.conn(ctx);
    try {
      return con.get(ctx, key);
    } finally {
      await con.close();
    }
  }

  async delete(ctx: IContext, key: string): Promise<void> {
    const con = <MemKvConn>await this.conn(ctx);
    try {
      return con.delete(ctx, key);
    } finally {
      await con.close();
    }
  }

  return(con: MemKvConn) {
    const ix = this.#active.indexOf(con);
    if (ix < 0) {
      throw new Error('Connection is not in this pool');
    }

    const req = this.#reqQueue.shift();
    if (req != null) {
      // Give connection to the next waiting
      con.reset(true);
      return req.resolve(con);
    }

    // No one is waiting. Return to pool
    this.#active.splice(ix, 1);
    this.#pool.push(con);
  }
}

interface MemOp {
  readonly type: 'set' | 'delete';
  readonly key: string;
  readonly val?: unknown;
}

class MemKvTxn implements KeyValTxn {
  readonly #store: PlainObject;
  readonly #onComplete: () => void;
  readonly #temp: PlainObject;
  readonly #ops: MemOp[] = [];
  readonly #readonly: boolean;
  #done = false;

  constructor(
    store: PlainObject,
    opts: TxnOptions | undefined,
    onComplete: () => null | Promise<void>
  ) {
    this.#store = store;
    this.#onComplete = onComplete;
    this.#temp = Object.create(store);

    if (opts == null) {
      opts = {};
    }
    this.#readonly = opts.readOnly === true;
  }

  get mode(): StorageMode {
    return StorageMode.txn;
  }

  get kind(): string {
    return StorageKind.keyval;
  }

  set(ctx: IContext, key: string, val: unknown): Promise<void> {
    if (this.#done) {
      throw new Error('Transaction is already complete');
    }
    if (this.#readonly) {
      throw new Error('Transaction is read only');
    }
    this.#ops.push({ type: 'set', key, val });
    this.#temp[key] = val;
    return Promise.resolve();
  }

  get(ctx: IContext, key: string): Promise<unknown> {
    if (this.#done) {
      throw new Error('Transaction is already complete');
    }
    return Promise.resolve(this.#temp[key]);
  }

  delete(ctx: IContext, key: string): Promise<void> {
    if (this.#done) {
      throw new Error('Transaction is already complete');
    }
    if (this.#readonly) {
      throw new Error('Transaction is read only');
    }

    this.#ops.push({ type: 'delete', key });
    this.#temp[key] = undefined;
    return Promise.resolve();
  }

  async commit(): Promise<void> {
    if (this.#done) {
      throw new Error('Transaction is already complete');
    }
    this.#done = true;

    // Apply the operations to the underlying store
    for (const op of this.#ops) {
      switch (op.type) {
        case 'delete':
          delete this.#store[op.key];
          break;
        case 'set':
          this.#store[op.key] = op.val;
          break;
      }
    }

    await this.#close();
  }

  rollback(): Promise<void> {
    if (this.#done) {
      throw new Error('Transaction is already complete');
    }
    this.#done = true;
    return this.#close();
  }

  #close(): Promise<void> {
    const p = this.#onComplete();
    if (p == null) {
      return Promise.resolve();
    }
    return p;
  }
}

export function getPool(store: PlainObject, maxCnt: number): KeyValPool {
  return new MemKvPool(store, maxCnt);
}
