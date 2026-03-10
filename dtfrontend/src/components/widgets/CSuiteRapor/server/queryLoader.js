import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const QUERIES_DIR = join(__dirname, 'queries');

/**
 * Reads a .sql file from the server/queries/ folder and returns its contents.
 * @param {string} filename — e.g. 'get_companies.sql'
 * @returns {string} The SQL query string
 */
export function loadQuery(filename) {
  return readFileSync(join(QUERIES_DIR, filename), 'utf-8');
}

