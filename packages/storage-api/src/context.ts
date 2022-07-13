// Copyright 2022 Joshua Honig. All rights reserved.
// Use of this source code is governed by a MIT
// license that can be found in the LICENSE file.

import { Context, IContext, Maybe, withValue } from '@sabl/context';
import { StorageMode } from './enum';
import type { StorageApi, StorageTxn, Transactable, TxnOptions } from './index';

const ctxKeyStorageApi = Symbol('StorageApi');

export function withStorageApi(ctx: IContext, api: StorageApi): Context {
  return withValue(ctx, ctxKeyStorageApi, api);
}

export function getStorageApi(ctx: IContext): Maybe<StorageApi> {
  return <Maybe<StorageApi>>ctx.value(ctxKeyStorageApi);
}

type TxnCallback = (ctx: IContext, txn: StorageTxn) => Promise<void>;

/**
 * Run a callback in the context of a transaction on
 * the current storage API. If the provided context
 * is already in a transaction, the same context is used
 * and the transaction is not committed or rolled back.
 * If a new transaction is created, it is committed
 * after calling `fn`, or rolled back if there is
 * an exception.
 */
export function runTransaction(
  ctx: IContext,
  fn: (ctx: IContext, txn: StorageTxn) => Promise<void>
): Promise<void>;
export function runTransaction(
  ctx: IContext,
  opts: TxnOptions,
  fn: (ctx: IContext, txn: StorageTxn) => Promise<void>
): Promise<void>;

export async function runTransaction(
  ctx: IContext,
  fnOrOpts: TxnOptions | TxnCallback,
  maybeFn?: TxnCallback
): Promise<void> {
  const api = getStorageApi(ctx);
  if (api == null) throw new Error('No storage API present on context');

  let fn: TxnCallback;
  let opts: TxnOptions | undefined = undefined;

  if (typeof fnOrOpts === 'function') {
    fn = fnOrOpts;
  } else {
    if (maybeFn == null) {
      throw new Error('Missing callback function');
    }
    opts = fnOrOpts;
    fn = maybeFn;
  }

  let txn: StorageTxn;
  if (api.mode == StorageMode.txn) {
    txn = <StorageTxn>api;
    // Just run the callback within the
    // existing transaction. commit
    // or rollback will handled
    // father up the call stack.
    return fn(ctx, txn);
  }

  const cn = <Transactable>api;
  txn = await cn.beginTxn(ctx, opts);
  const childCtx = withStorageApi(ctx, txn);

  try {
    await fn(childCtx, txn);
    await txn.commit();
  } catch (e) {
    await txn.rollback();
    throw e;
  }
}
