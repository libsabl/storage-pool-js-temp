// Copyright 2022 Joshua Honig. All rights reserved.
// Use of this source code is governed by a MIT
// license that can be found in the LICENSE file.

import { getPool, PlainObject } from '$';
import { Context } from '@sabl/context';

describe('MemKvPool', () => {
  jest.setTimeout(600000);

  describe('get', () => {
    it('sets a value', async () => {
      const data: PlainObject = { a: 'b' };
      const pool = getPool(data, 2);
      const v = await pool.get(Context.background, 'a');
      expect(v).toBe('b');
    });

    it('waits for connection', async () => {
      const ctx = Context.background;
      const data: PlainObject = { a: 'b' };
      const pool = getPool(data, 1);
      const con = await pool.conn(ctx);

      const pGet = pool.get(ctx, 'a');

      await new Promise((res) => setTimeout(res, 10));

      // Update the value on the active connection
      await con.set(ctx, 'a', 'c');

      // Free the pool connection
      await con.close();

      const v = await pGet;

      // Resolved value reflects update from the first connection
      expect(v).toBe('c');
    });

    it('cancels if timed out', async () => {
      const data: PlainObject = { a: 'b' };
      const pool = getPool(data, 1);
      const con = await pool.conn(Context.background);

      const [ctx, cancel] = Context.cancel();

      // Set up expectation but don't await yet
      const pTest = expect(() => pool.get(ctx, 'a')).rejects.toThrow(
        'Context was canceled'
      );

      // Timeout request after 5 ms
      setTimeout(cancel, 5);

      // But wait 10 ms
      await new Promise((res) => setTimeout(res, 10));

      // Free the pool connection
      await con.close();

      // Await test expectation to complete the test
      await pTest;
    });
  });

  describe('set', () => {
    it('sets a value', async () => {
      const data: PlainObject = {};
      const pool = getPool(data, 2);
      await pool.set(Context.background, 'a', 'b');
      expect(data.a).toBe('b');
    });

    it('waits for connection', async () => {
      const ctx = Context.background;
      const data: PlainObject = {};
      const pool = getPool(data, 1);
      const con = await pool.conn(ctx);

      const pSet = pool.set(ctx, 'a', 'b');

      await new Promise((res) => setTimeout(res, 10));

      // Value is still not set, still waiting for con
      expect(data.a).toBe(undefined);

      // Free the pool connection
      await con.close();

      // Same frame should resolve and set value
      expect(data.a).toBe('b');

      await pSet;
    });

    it('cancels if timed out', async () => {
      const data: PlainObject = {};
      const pool = getPool(data, 1);
      const con = await pool.conn(Context.background);

      const [ctx, cancel] = Context.cancel();

      // Set up expectation but don't await yet
      const pTest = expect(() => pool.set(ctx, 'a', 'b')).rejects.toThrow(
        'Context was canceled'
      );

      // Timeout request after 5 ms
      setTimeout(cancel, 5);

      // But wait 10 ms
      await new Promise((res) => setTimeout(res, 10));

      // Free the pool connection
      await con.close();

      // Await test expectation to complete the test
      await pTest;
    });
  });

  describe('delete', () => {
    it('deletes a value', async () => {
      const data: PlainObject = { a: 'b' };
      const pool = getPool(data, 2);
      await pool.delete(Context.background, 'a');
      expect(data.a).toBe(undefined);
    });

    it('waits for connection', async () => {
      const ctx = Context.background;
      const data: PlainObject = { a: 'b' };
      const pool = getPool(data, 1);
      const con = await pool.conn(ctx);

      const pDel = pool.delete(ctx, 'a');

      await new Promise((res) => setTimeout(res, 10));

      // Value is still not deleted, still waiting for con
      expect(data.a).toBe('b');

      // Free the pool connection
      await con.close();

      // Same frame should resolve and delete value
      expect(data.a).toBe(undefined);

      await pDel;
    });

    it('cancels if timed out', async () => {
      const data: PlainObject = { a: 'b' };
      const pool = getPool(data, 1);
      const con = await pool.conn(Context.background);

      const [ctx, cancel] = Context.cancel();

      // Set up expectation but don't await yet
      const pTest = expect(() => pool.delete(ctx, 'a')).rejects.toThrow(
        'Context was canceled'
      );

      // Timeout request after 5 ms
      setTimeout(cancel, 5);

      // But wait 10 ms
      await new Promise((res) => setTimeout(res, 10));

      // Free the pool connection
      await con.close();

      // Await test expectation to complete the test
      await pTest;
    });
  });
});

describe('MemKvConn', () => {
  it('placeholder', () => {
    expect(1).toBeLessThan(2);
  });
});

describe('MemKvTxn', () => {
  it('placeholder', () => {
    expect(1).toBeLessThan(2);
  });
});
