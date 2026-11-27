import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { initialState } from './league.js';
export function createStore(path) {
  if(path!==':memory:')mkdirSync(dirname(path),{recursive:true});
  const db=new DatabaseSync(path);
  db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS league (id INTEGER PRIMARY KEY CHECK (id = 1), state TEXT NOT NULL)');
  if(!db.prepare('SELECT id FROM league WHERE id = 1').get())db.prepare('INSERT INTO league (id,state) VALUES (1,?)').run(JSON.stringify(initialState()));
  return {read:()=>JSON.parse(db.prepare('SELECT state FROM league WHERE id=1').get().state),write(state){db.prepare('UPDATE league SET state=? WHERE id=1').run(JSON.stringify(state));},close:()=>db.close()};
}
