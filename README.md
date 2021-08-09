# json.db.js
A flat key value json store.


```javascript

import Database from './database.mjs';

// new Database(root directory)

const db = new Database('/home/app/data/')

await db.set('key', {
    email    : 'example@gmail.com',
    username : 'test'
});

// Link another key to original key file
// db.link('newkey', 'existing key');

await db.link('test', 'key');

await db.get('test');

// more docs soon

```
