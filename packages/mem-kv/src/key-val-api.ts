// Copyright 2022 Joshua Honig. All rights reserved.
// Use of this source code is governed by a MIT
// license that can be found in the LICENSE file.

import { IContext } from '@sabl/context';
import {
  StorageApi,
  StorageTxn,
  Transactable,
  TxnOptions,
} from '@sabl/storage-api';

export interface KeyValApi extends StorageApi {
  set(ctx: IContext, key: string, val: unknown): Promise<void>;
  get(ctx: IContext, key: string): Promise<unknown>;
  delete(ctx: IContext, key: string): Promise<void>;
}

export interface KeyValTxn extends KeyValApi, StorageTxn {}

export interface KeyValTransactable extends Transactable {
  beginTxn(ctx: IContext, opts?: TxnOptions): Promise<KeyValTxn>;
}

export interface KeyValConn extends KeyValApi, KeyValTransactable {
  close(): Promise<void>;
}

export interface KeyValPool extends KeyValApi, KeyValTransactable {
  conn(ctx: IContext): Promise<KeyValConn>;
  close(): Promise<void>;
}
