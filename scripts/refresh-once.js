import { Store } from '../src/store.js';
import { Tester } from '../src/test.js';
import { Refresher } from '../src/refresh.js';
import { DATA_DIR, SINGBOX_BIN } from '../src/config.js';

const store = new Store(DATA_DIR);
store.load();
const refresher = new Refresher(store, new Tester(SINGBOX_BIN, DATA_DIR));
const out = await refresher.refresh();
console.log(JSON.stringify(out, null, 1));
const alive = store.alive();
const by = {};
for (const n of alive) by[n.proto] = (by[n.proto] || 0) + 1;
console.log('ALIVE', alive.length, by);
