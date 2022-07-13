// Copyright 2022 Joshua Honig. All rights reserved.
// Use of this source code is governed by a MIT
// license that can be found in the LICENSE file.

/** The basic type of a storage API instance: pool, connection, or transaction */
export enum StorageMode {
  pool = 1,
  conn = 2,
  txn = 3,
}

/**
 * The underlying storage type: relational, document, graph, etc.
 * {@link StorageKind} values are strings, and authors may use
 * values not defined here
 */
export enum StorageKind {
  /** Placeholder unknown storage kind */
  unknown = 'unknown',

  /** A relation database implementing SQL APIs */
  rdb = 'relational',

  /** A document store such as Mongo */
  doc = 'document',

  /** A graph database implementing Gremlin APIs */
  graph = 'graph',

  /** A key-value store such as Redis */
  keyval = 'key-value',

  /** A wide-column store such as Cassandra */
  widecol = 'wide-column',
}

/**
 * Various isolation levels that storage drivers may support in beginTxn.
 * If a driver does not support a given isolation level an error may be returned.
 */
export enum IsolationLevel {
  default = 1,
  readUncommitted = 2,
  readCommitted = 3,
  writeCommitted = 4,
  repeatableRead = 5,
  snapshot = 6,
  serializable = 7,
  linearizable = 8,
}
