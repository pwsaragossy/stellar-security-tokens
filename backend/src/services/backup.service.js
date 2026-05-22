/**
 * Database Backup Service
 *
 * Two-tier backup strategy:
 * 1. JSON snapshots — triggered on user creation (Prisma middleware)
 * 2. Full pg_dump — scheduled daily via node-cron
 *
 * Failures are logged but never break the application flow.
 */

import { execFile } from 'node:child_process';
import { mkdir, writeFile, readdir, unlink, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { createWriteStream } from 'node:fs';
import { createGzip } from 'node:zlib';
import logger from '../utils/logger.js';

const log = logger.scope('BackupService');
const execFileAsync = promisify(execFile);

const BACKUP_ROOT = process.env.BACKUP_DIR || '/app/backups';
const SNAPSHOT_DIR = join(BACKUP_ROOT, 'snapshots');
const DAILY_DIR = join(BACKUP_ROOT, 'daily');
const MAX_DAILY_BACKUPS = parseInt(process.env.BACKUP_RETENTION_DAYS || '7', 10);

/**
 * Ensure backup directories exist
 */
async function ensureDirs() {
    await mkdir(SNAPSHOT_DIR, { recursive: true });
    await mkdir(DAILY_DIR, { recursive: true });
}

/**
 * Tier 1 — JSON snapshot on user creation
 * Writes the created user row (+ related data) as a timestamped JSON file.
 * Non-blocking: failures are logged, never thrown.
 */
async function snapshotUserCreation(model, data) {
    try {
        await ensureDirs();

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `${model}_${data.id || 'unknown'}_${timestamp}.json`;
        const filepath = join(SNAPSHOT_DIR, filename);

        const snapshot = {
            model,
            createdAt: new Date().toISOString(),
            data,
        };

        await writeFile(filepath, JSON.stringify(snapshot, null, 2), 'utf-8');
        log.info(`Snapshot saved: ${filename}`);
    } catch (error) {
        log.error('Failed to save user snapshot (non-critical):', error.message);
    }
}

/**
 * Tier 2 — Full pg_dump compressed with gzip
 * Outputs to /backups/daily/backup_YYYY-MM-DD_HH-MM.sql.gz
 * Keeps last N backups (default 7).
 */
async function fullDatabaseDump() {
    try {
        await ensureDirs();

        const dbUrl = process.env.DATABASE_URL;
        if (!dbUrl) {
            log.warn('DATABASE_URL not set — skipping pg_dump');
            return null;
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
        const filename = `backup_${timestamp}.sql.gz`;
        const filepath = join(DAILY_DIR, filename);

        log.info(`Starting full database dump: ${filename}`);
        const startTime = Date.now();

        // Run pg_dump and pipe through gzip
        const pgDump = execFile('pg_dump', [dbUrl, '--no-owner', '--no-privileges', '--format=plain'], {
            maxBuffer: 100 * 1024 * 1024, // 100MB
        });

        // Collect output as a stream and compress
        const chunks = [];
        pgDump.child?.stdout?.on('data', (chunk) => chunks.push(chunk));

        // Wait for pg_dump to complete
        const { stdout } = await execFileAsync('pg_dump', [
            dbUrl,
            '--no-owner',
            '--no-privileges',
            '--format=plain',
        ], {
            maxBuffer: 100 * 1024 * 1024,
        });

        // Compress and write
        const gzip = createGzip({ level: 6 });
        const output = createWriteStream(filepath);

        await new Promise((resolve, reject) => {
            gzip.pipe(output);
            gzip.on('error', reject);
            output.on('error', reject);
            output.on('finish', resolve);
            gzip.end(stdout);
        });

        const stats = await stat(filepath);
        const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
        const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

        log.info(`Backup complete: ${filename} (${sizeMB} MB, ${durationSec}s)`);

        // Rotate old backups
        await rotateBackups();

        return filepath;
    } catch (error) {
        log.error('Full database dump failed:', error.message);
        return null;
    }
}

/**
 * Keep only the N most recent daily backups
 */
async function rotateBackups() {
    try {
        const files = await readdir(DAILY_DIR);
        const backupFiles = files
            .filter(f => f.startsWith('backup_') && f.endsWith('.sql.gz'))
            .sort()
            .reverse();

        if (backupFiles.length <= MAX_DAILY_BACKUPS) return;

        const toDelete = backupFiles.slice(MAX_DAILY_BACKUPS);
        for (const file of toDelete) {
            await unlink(join(DAILY_DIR, file));
            log.info(`Rotated old backup: ${file}`);
        }
    } catch (error) {
        log.error('Backup rotation failed:', error.message);
    }
}

/**
 * List existing backups (for admin dashboard)
 */
async function listBackups() {
    try {
        await ensureDirs();

        const [snapshots, dailies] = await Promise.all([
            readdir(SNAPSHOT_DIR),
            readdir(DAILY_DIR),
        ]);

        return {
            snapshots: snapshots.filter(f => f.endsWith('.json')).sort().reverse(),
            daily: dailies.filter(f => f.endsWith('.sql.gz')).sort().reverse(),
        };
    } catch (error) {
        log.error('Failed to list backups:', error.message);
        return { snapshots: [], daily: [] };
    }
}

export const BackupService = {
    snapshotUserCreation,
    fullDatabaseDump,
    rotateBackups,
    listBackups,
};
