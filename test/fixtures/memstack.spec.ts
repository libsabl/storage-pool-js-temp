// Copyright 2022 Joshua Honig. All rights reserved.
// Use of this source code is governed by a MIT
// license that can be found in the LICENSE file.

import { Context } from '@sabl/context';
import { openStackPool } from '.';

describe('MemStackPool', () => {
  it('uses stack', async () => {
    const stack: unknown[] = [];
    const pool = openStackPool(stack);
    await pool.push(Context.background, 'a');
    expect(stack).toEqual(['a']);
  });
});
