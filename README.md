# @sabl/storage-api 

**storage-api** is a simple, [context](https://github.com/libsabl/patterns/blob/main/patterns/context.md)-aware pattern for describing connection pooling and storage transactions agnostic of the underlying storage type. This same pattern works for relational, document, key-value, graph, and other storage architectures. 

Defining these interfaces directly, along with simple generic logic for running code in the context of a transaction, allows authors to write effective business logic that include basic CRUD actions and even transaction workflows, without depending on a specific storage type, let alone a specific proprietary driver.
  
For more detail on the storage-api pattern, see sabl / [patterns](https://github.com/libsabl/patterns#patterns) / [storage-api](https://github.com/libsabl/patterns/blob/main/patterns/storage-api.md).

<!-- BEGIN:REMOVE_FOR_NPM -->
> [**sabl**](https://github.com/libsabl/patterns) is an open-source project to identify, describe, and implement effective software patterns which solve small problems clearly, can be composed to solve big problems, and which work consistently across many programming languages.
