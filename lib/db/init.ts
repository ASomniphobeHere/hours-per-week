import { databasePath, getDatabase } from './index';
import { SCHEMA_VERSION } from './migrate';

const db = getDatabase();
const version = db.pragma('user_version', { simple: true }) as number;
process.stdout.write(`${databasePath()} at schema version ${version} of ${SCHEMA_VERSION}\n`);
db.close();
