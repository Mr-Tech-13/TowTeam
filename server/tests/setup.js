import path from 'node:path';
import process from 'node:process';

if (!process.env.TOWTEAM_TEST_ROOT) throw new Error('Run tests with npm test so production data stays isolated.');
process.env.DATABASE_URL = path.join(process.env.TOWTEAM_TEST_ROOT, `${process.pid}.sqlite`);
process.env.NODE_ENV = 'test';
