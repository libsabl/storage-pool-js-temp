// Copyright 2022 Joshua Honig. All rights reserved.
// Use of this source code is governed by a MIT
// license that can be found in the LICENSE file.

import { Context } from '@sabl/context';
import {
  getStorageApi,
  IsolationLevel,
  runTransaction,
  StorageKind,
  StorageMode,
} from '$';
import { openStackPool, StackTxn, withStackApi } from './fixtures';

describe('enums', () => {
  it('retrieves defined values', () => {
    expect('default' in IsolationLevel).toBe(true);
    expect('graph' in StorageKind).toBe(true);
    expect('txn' in StorageMode).toBe(true);
  });
});

describe('getStorageApi', () => {
  it('gets storage API set on context', () => {
    const pool = openStackPool([]);

    // Note, more derived withStackApi uses withStorageApi,
    // so less derived getStorageApi still works
    const ctx = Context.value(withStackApi, pool);
    const api = ctx.require(getStorageApi);
    expect(api).toBe(pool);
  });
});

describe('runTransaction', () => {
  it('runs operations inside a transaction', async () => {
    const stack: unknown[] = [];
    stack.push('a', 'b');

    const pool = openStackPool(stack);
    const ctxRoot = Context.value(withStackApi, pool);

    await runTransaction(ctxRoot, async (ctx, txn) => {
      expect(txn.kind).toBe('stack');
      expect(txn.mode).toBe(StorageMode.txn);
      const stk = <StackTxn>txn;

      await stk.push(ctx, 'c');

      // Not yet committed
      expect(stack).toEqual(['a', 'b']);
    });

    // Automatically committed
    expect(stack).toEqual(['a', 'b', 'c']);
  });

  it('rolls back on error', async () => {
    const stack: unknown[] = [];
    stack.push('a', 'b');

    const pool = openStackPool(stack);
    const ctxRoot = Context.value(withStackApi, pool);

    await expect(async () =>
      runTransaction(ctxRoot, async (ctx, txn) => {
        expect(txn.kind).toBe('stack');
        expect(txn.mode).toBe(StorageMode.txn);
        const stk = <StackTxn>txn;

        await stk.push(ctx, 'c');

        // Within txn, tail is 'c'
        const val = await stk.peek(ctx);
        expect(val).toBe('c');

        throw new Error('Failing on purpose');
      })
    ).rejects.toThrow();

    // Changes were not committed
    expect(stack).toEqual(['a', 'b']);
  });

  it('uses options', async () => {
    const stack: unknown[] = [];
    stack.push('a', 'b');

    const pool = openStackPool(stack);
    const ctxRoot = Context.value(withStackApi, pool);

    await expect(async () =>
      runTransaction(ctxRoot, { readOnly: true }, async (ctx, txn) => {
        expect(txn.kind).toBe('stack');
        expect(txn.mode).toBe(StorageMode.txn);
        const stk = <StackTxn>txn;

        await stk.push(ctx, 'c');
      })
    ).rejects.toThrow('Cannot push or pop: Transaction is read-only');

    // Changes were not committed
    expect(stack).toEqual(['a', 'b']);
  });

  it('reuses existing transaction', async () => {
    const stack: unknown[] = [];
    stack.push('a', 'b');

    const pool = openStackPool(stack);
    const ctxRoot = Context.value(withStackApi, pool);

    await runTransaction(ctxRoot, async (ctx, txn) => {
      await runTransaction(ctx, async (ctxInner, txnInner) => {
        expect(txnInner.kind).toBe('stack');
        expect(txnInner.mode).toBe(StorageMode.txn);

        // Same context and txn
        expect(ctxInner).toBe(ctx);
        expect(txnInner).toBe(txn);

        const stk = <StackTxn>txnInner;

        await stk.push(ctx, 'c');

        // Not yet committed
        expect(stack).toEqual(['a', 'b']);
      });

      // Still not committed
      expect(stack).toEqual(['a', 'b']);
    });

    // Automatically committed
    expect(stack).toEqual(['a', 'b', 'c']);
  });

  it('throws if there is not storage api', async () => {
    const ctxRoot = Context.background;

    await expect(() =>
      runTransaction(ctxRoot, () => Promise.resolve())
    ).rejects.toThrow('No storage API present on context');
  });

  it('throws if no callback', async () => {
    const stack: unknown[] = [];
    stack.push('a', 'b');

    const pool = openStackPool(stack);
    const ctxRoot = Context.value(withStackApi, pool);

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await expect(() => runTransaction(ctxRoot, null!)).rejects.toThrow(
      'Missing callback function'
    );
  });
});
