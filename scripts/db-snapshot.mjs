// Онлайн-копия SQLite: безопасна, пока сервис пишет в базу (учитывает WAL).
import Database from "better-sqlite3";

const [src, dest] = process.argv.slice(2);
if (!src || !dest) {
  console.error("usage: node db-snapshot.mjs <source.db> <dest.db>");
  process.exit(1);
}

const db = new Database(src, { readonly: true });
await db.backup(dest);
db.close();
console.log(`snapshot: ${dest}`);
