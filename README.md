# @sabl/storage-api 

**storage-api** is a simple, [context](https://github.com/libsabl/patterns/blob/main/patterns/context.md)-aware pattern for describing connection pooling and storage transactions agnostic of the underlying storage type. This same pattern works for relational, document, key-value, graph, and other storage architectures. 

Defining these interfaces directly, along with simple generic logic for running code in the context of a transaction, allows authors to write effective business logic that include basic CRUD actions and even transaction workflows, without depending on a specific storage type, let alone a specific proprietary driver.
  
For more detail on the storage-api pattern, see sabl / [patterns](https://github.com/libsabl/patterns#patterns) / [storage-api](https://github.com/libsabl/patterns/blob/main/patterns/storage-api.md).

<!-- BEGIN:REMOVE_FOR_NPM -->
> [**sabl**](https://github.com/libsabl/patterns) is an open-source project to identify, describe, and implement effective software patterns which solve small problems clearly, can be composed to solve big problems, and which work consistently across many programming languages.

## Developer orientation

See [SETUP.md](./docs/SETUP.md), [CONFIG.md](./docs/CONFIG.md).
<!-- END:REMOVE_FOR_NPM -->

## Concepts
 
Many storage clients are able to pool connections to a remote data store. Consuming code should retrieve a connection from the pool when it needs one, and promptly return the connection when the work is done, whether or not the work was successful.

These concepts are represented by the `StoragePool` and `StorageConn` interfaces.

Some storage services also support transactions. A transaction represents a series of actions whose effects either all succeed or all fail together. A transaction is represented by the `StorageTxn` interface.

### Type-Specific CRUD APIs

Many storage client libraries will expose the same type-specific CRUD APIs on all three basic types - pool, connection, and transaction.

For example, a document store would support APIs such as `insertOne`, `updateMany`, and `find`:

```ts
/** Example: Common Doc store API */
interface DocStoreAPI {
  insertOne(ctx: IContext, collection: string, doc:Doc, opts): Promise<void>;
  insertMany(ctx: IContext, collection: string, docs: Doc[], opts): Promise<void>;
  find(ctx: IContext, collection: string, filter: any): Promise<Cursor>;
  ... etc ...
}
```

All of these APIs are inherited by a `DocStorePool`, `DocStoreConn`, and `DocStoreTxn`. 
- If invoked directly on a pool, a connection is automatically acquired, used, and then released as soon as the operation is complete. 
- If invoked on a connection, the connection is left open for subsequent operations
- If invoked on a transaction, the transaction is left uncommitted for subsequent operations

The actual makeup of the common storage API differs by storage type. However, this library still defines a very simple base `StorageAPI` that exposes two read-only properties that allow consuming code to make basic decisions about an implementing instance without having to use fickle reflection methods such as `instanceof`.

#### Example: StackAPI

The tests of this library include a minimal but accurate example of both the interfaces and an implementation for a type-specific api, using a simple stack as the underlying 'data store'. See [source](https://github.com/libsabl/storage-api-js/blob/main/test/fixtures/index.ts) for details.

```ts
// EXAMPLE, included in test/fixtures of this repo:

// StackApi is the basic stack ops: push, peek, pop
export interface StackApi extends StorageApi {
  push(ctx: IContext, val: unknown): Promise<number>;
  peek(ctx: IContext): Promise<unknown>;
  pop(ctx: IContext): Promise<unknown>;
}

// StackTxn is a composition of the basic StorageTxn
// (commit, rollback) with the StackApi
export interface StackTxn extends StorageTxn, StackApi {}

// Overrides basic Transactable so that the return
// value is a StackTxn
export interface StackTransactable extends Transactable {
  beginTxn(ctx: IContext, opts?: TxnOptions): Promise<StackTxn>;
}

// Composition that is structurally compatible with StorageConn
export interface StackConn extends StackApi, StackTransactable {
  close(): Promise<void>;
}

// Composition that is structurally compatible with StoragePool
export interface StackPool extends StackApi, StackTransactable {
  conn(ctx: IContext): Promise<StackConn>;
  close(): Promise<void>;
}
```

## API

### StorageAPI

An abstraction of all storage API types, exposing two enumeration properties that provide some clues about the type of the API instance.

```ts
export interface StorageApi {
  readonly mode: StorageMode;
  readonly kind: StorageKind | string;
}
```

#### StorageMode

Represents the basic type of the API instance: pool, connection, or transaction.

```ts
export enum StorageMode {
  pool = 1,
  conn = 2,
  txn = 3,
}
```

#### StorageKind

Extensible string enumeration describing the basic underlying storage type, such as relational, document, graph, etc. Authors may use their own values not defined here.

```ts
export enum StorageKind {
  unknown = 'unknown',
  rdb = 'relational',
  doc = 'document',
  graph = 'graph',
  keyval = 'key-value',
  widecol = 'wide-column',
}
```

### StoragePool

A pool of storage connections.

|method|description|
|-|-|
|`conn`|Retrieves a connection from the pool. The context provided may be cancelable, and if the context is canceled before a connection becomes available then `conn` should throw an exception. The resolved connection should already be open.|
|`beginTxn`|Begins a transaction on a transient connection that will be returned to the pool when the transaction completes. Implementers should respect a cancelable context and rollback the transaction if the context is canceled before the transaction is committed.|
|`close`|Closes the entire pool. Pools are meant to be long-lived and concurrent-safe, so this is generally only used on graceful program termination. Should resolve when all connections have been gracefully terminated.|

```ts
interface StoragePool extends StorageApi { 
  conn(ctx: IContext): Promise<StorageConn>; 
  beginTxn(ctx: IContext, opts?: TxnOptions): Promise<StorageTxn>;
  close(): Promise<void>;
}
```

### StorageConn

An open connection to a storage provided. Maintains session state such as variables, temporary tables, and transactions. Users of a connection are expected to ensure the connection is closed when they are done with it.

|method|description|
|-|-| 
|`beginTxn`|Begins a transaction on the connection. Implementers should respect a cancelable context and rollback the transaction if the context is canceled before the transaction is committed.|
|`close`|Closes the connection. If the connection was obtained from a pool, this should release the connection back to the pool rather than terminating the underlying connection.|

```ts
export interface StorageConn extends StorageApi {
  beginTxn(ctx: IContext, opts?: TxnOptions): Promise<StorageTxn>;
  close(): Promise<void>;
}
```

### StorageTxn

An active storage transaction.

|method|description|
|-|-| 
|`commit`|Commits and closes the transaction.|
|`close`|Rolls back and closes the transaction.|

```ts
interface StorageTxn extends StorageApi {
  commit(): Promise<void>;
  rollback(): Promise<void>;
}
```

### TxnOptions, IsolationLevel

The `beginTxn` methods on `StorageConn` and `StoragePool` also accept an options object:

```ts
interface TxnOptions {
  readonly isolationLevel?: IsolationLevel;
  readonly readOnly?: boolean;
}
```

`readOnly` indicates the transaction should be executed in a read-only mode if the target storage service supports it.

`isolationLevel` describes known [**isolation levels**](https://en.wikipedia.org/wiki/Isolation_(database_systems)#Isolation_levels) which may or may not be supported by an underlying storage driver. If an unsupported isolation level is requested, implementation authors may choose to ignore it or throw an exception.

### withStorageApi, getStorageApi

This is a [context getter/setter pair](https://github.com/libsabl/patterns/blob/main/patterns/context.md#getter--setter-pattern) that adds or retrieves an `StorageApi` instance. It is used in [`runTransaction`](#runtransaction) to implement a canonical transaction workflow that is completely agnostic of underlying storage type.

### runTransaction

`runTransaction` accepts an existing context and an async callback to be run within the context of a transaction. It implements a canonical storage transaction workflow that automatically commits or rolls back:

- If the callback resolves successfully, then the transaction's `commit` method is called
- If the callback rejects, then the transaction's `rollback` method is called before passing the inner exception up the call stack.
- If the current storage API on the provided context is already a transaction, then the callback is invoked with the existing context and transaction. 

**NOTE**: This implementation reflects a pattern where true nested transactions are not supported. Authors are free to create their own implementations that do support truly nested transactions where inner transactions are committed or rejected independently of an outer transaction. This could be implemented for some relational databases using [transaction savepoints](https://en.wikipedia.org/wiki/Savepoint).

For a complete illustration of the usage and expected behavior of `runTransaction`, see the [tests themselves](https://github.com/libsabl/storage-api-js/blob/main/test/context.spec.ts).