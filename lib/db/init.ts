import { DB_PATH, getDatabase } from './index';
import { SCHEMA_VERSION } from './migrate';

const db = getDatabase();
const version = db.pragma('user_version', { simple: true }) as number;
process.stdout.write(`${DB_PATH} at schema version ${version} of ${SCHEMA_VERSION}\n`);
db.close();
