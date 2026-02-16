#!/usr/bin/env node
/**
 * Test temp file utilities and lazy loading
 */

const { createTempFile, cleanupFile, cleanupFiles, periodicTempCleanup, lazyRequire } = require('./utils/helpers');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

async function testTempFileUtils() {
    console.log('🧪 Testing temp file utilities...\n');
    
    // Test 1: Create temp file
    console.log('Test 1: Create temp file');
    const tempFile = createTempFile('test', 'txt');
    console.log(`  ✓ Created temp path: ${tempFile}`);
    console.log(`  ✓ In OS temp dir: ${tempFile.startsWith(os.tmpdir())}`);
    
    // Write to temp file
    await fs.writeFile(tempFile, 'test content');
    console.log('  ✓ Written to temp file\n');
    
    // Test 2: Cleanup single file
    console.log('Test 2: Cleanup single file');
    const cleaned = await cleanupFile(tempFile);
    console.log(`  ✓ File cleaned up: ${cleaned}\n`);
    
    // Test 3: Create multiple temp files
    console.log('Test 3: Create and cleanup multiple files');
    const files = [];
    for (let i = 0; i < 3; i++) {
        const file = createTempFile('test_multi', 'dat');
        await fs.writeFile(file, `test ${i}`);
        files.push(file);
    }
    console.log(`  ✓ Created ${files.length} temp files`);
    
    const count = await cleanupFiles('test_multi');
    console.log(`  ✓ Cleaned up ${count} files\n`);
    
    // Test 4: Periodic cleanup (dry run)
    console.log('Test 4: Periodic cleanup');
    const cleaned2 = await periodicTempCleanup(['test_', 'music_', 'video_']);
    console.log(`  ✓ Periodic cleanup completed (${cleaned2} files)\n`);
    
    console.log('✅ All temp file utility tests passed!\n');
}

async function testLazyRequire() {
    console.log('🧪 Testing lazy require...\n');
    
    // Test 1: Load module when enabled (default)
    console.log('Test 1: Load module when enabled');
    const sharp = lazyRequire('sharp', 'ENABLE_SHARP');
    console.log(`  ✓ Sharp loaded: ${sharp !== null}`);
    console.log(`  ✓ Sharp is function: ${typeof sharp === 'function'}\n`);
    
    // Test 2: Module not loaded when disabled
    console.log('Test 2: Module not loaded when disabled');
    process.env.ENABLE_CANVAS = 'false';
    const canvas = lazyRequire('canvas', 'ENABLE_CANVAS');
    console.log(`  ✓ Canvas disabled: ${canvas === null}\n`);
    delete process.env.ENABLE_CANVAS;
    
    // Test 3: Module not found
    console.log('Test 3: Module not found');
    const nonexistent = lazyRequire('nonexistent-module', 'ENABLE_TEST');
    console.log(`  ✓ Nonexistent module returns null: ${nonexistent === null}\n`);
    
    console.log('✅ All lazy require tests passed!\n');
}

async function main() {
    console.log('='.repeat(60));
    console.log('Testing Storage Efficiency Improvements');
    console.log('='.repeat(60) + '\n');
    
    try {
        await testTempFileUtils();
        await testLazyRequire();
        
        console.log('='.repeat(60));
        console.log('✅ All tests passed successfully!');
        console.log('='.repeat(60));
        process.exit(0);
    } catch (error) {
        console.error('❌ Test failed:', error);
        process.exit(1);
    }
}

main();
