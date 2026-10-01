#!/usr/bin/env tsx
/**
 * pnpm iteration:list — print every design iteration in this working tree.
 *
 * Reads the field table of each `iterations/<iteration>/README.md` and prints
 * Name | Type | Owner | Opened | Baseline | Status, oldest first. There is no shared index file;
 * this listing is the index. The model: iterations/README.md.
 */
import { resolve } from 'node:path';
import { formatIterationTable, readIterationListings } from './iteration.util.js';

const REPOSITORY_ROOT = resolve(import.meta.dirname, '../..');

const listings = readIterationListings(REPOSITORY_ROOT);
if (listings.length === 0) {
  console.log('No iterations yet — open the launch with: pnpm iteration:new launch');
} else {
  console.log(formatIterationTable(listings));
}
