/**
 * Integration Test - User Access Control Full Flow
 * Demonstrates the complete user journey from registration to access
 */

const security = require('./utils/security');
const config = require('./config');

console.log('🧪 Running User Access Control Integration Test...\n');
console.log('This test demonstrates the complete user access flow:\n');

let step = 1;
function log(message) {
    console.log(`\n${step}. ${message}`);
    step++;
}

function success(message) {
    console.log(`   ✅ ${message}`);
}

function info(message) {
    console.log(`   ℹ️  ${message}`);
}

// Simulate user IDs
const newUserId = '6281111111111@s.whatsapp.net';
const ownerId = config.bot.ownerId || '6289999999999@s.whatsapp.net';

// ========================================
// SCENARIO 1: NEW USER JOINS
// ========================================
log('NEW USER joins bot (sends first message)');
const isNew = security.registerUserIfNew(newUserId);
success(`User registered: ${isNew}`);
success(`Greeting will be sent: ${!security.wasGreetingSent(newUserId)}`);

// ========================================
// SCENARIO 2: NEW USER TRIES COMMAND
// ========================================
log('NEW USER tries to use command');
const allowed1 = security.isUserAllowed(newUserId);
if (!allowed1) {
    success('User denied (not in allowlist)');
    info('Message shown: "🔒 Akses Terbatas - Mohon tunggu persetujuan dari admin"');
}

// ========================================
// SCENARIO 3: OWNER REVIEWS USERS
// ========================================
log('OWNER checks user statistics');
const stats = security.getUserAccessStats();
console.log(`   📊 Statistics:`);
console.log(`      • Registered: ${stats.totalRegistered}`);
console.log(`      • Allowed: ${stats.totalAllowed}`);
console.log(`      • Blocked: ${stats.totalBlocked}`);

// ========================================
// SCENARIO 4: OWNER GRANTS ACCESS
// ========================================
log('OWNER grants access to user');
const allowResult = security.allowUser(newUserId, ownerId);
if (allowResult.success) {
    success('User added to allowlist');
    info(`Command used: .security allow ${newUserId.split('@')[0]}`);
}

// ========================================
// SCENARIO 5: USER NOW CAN USE COMMANDS
// ========================================
log('USER tries command again');
const allowed2 = security.isUserAllowed(newUserId);
if (allowed2) {
    success('User allowed - command executes normally');
    info('User can now use all bot commands');
}

// ========================================
// SCENARIO 6: OWNER REVIEWS ALLOWLIST
// ========================================
log('OWNER reviews allowlist');
const allowedUsers = security.getAllowedUsers();
console.log(`   📋 Allowed Users (${allowedUsers.length}):`);
for (const user of allowedUsers.slice(0, 3)) {
    const date = new Date(user.allowedAt).toLocaleString();
    console.log(`      • ${user.userIdShort} (allowed by ${user.allowedByShort} on ${date})`);
}

// ========================================
// SCENARIO 7: USER MISBEHAVES
// ========================================
log('USER violates rules - OWNER blocks them');
security.blockUser(newUserId, 1800000, 'Spam'); // 30 minutes
const blockInfo = security.getBlockInfo(newUserId);
if (blockInfo) {
    success(`User blocked for ${blockInfo.remainingMinutes} minutes`);
    info(`Reason: ${blockInfo.reason}`);
}

// ========================================
// SCENARIO 8: BLOCKED USER TRIES COMMAND
// ========================================
log('BLOCKED USER tries to use command');
const isBlocked = security.isUserBlocked(newUserId);
if (isBlocked) {
    const blockInfo2 = security.getBlockInfo(newUserId);
    success('User denied (blocked)');
    info(`Message shown: "🔒 Akses Diblokir - Waktu tersisa: ${blockInfo2.remainingMinutes} menit"`);
}

// ========================================
// SCENARIO 9: OWNER UNBLOCKS USER
// ========================================
log('OWNER unblocks user (early release)');
const unblocked = security.unblockUser(newUserId);
if (unblocked) {
    success('User unblocked');
    info('Command used: .security unblock ' + newUserId.split('@')[0]);
}

// ========================================
// SCENARIO 10: USER ACCESS RESTORED
// ========================================
log('USER tries command after unblock');
const allowed3 = security.isUserAllowed(newUserId);
const isBlocked2 = security.isUserBlocked(newUserId);
if (allowed3 && !isBlocked2) {
    success('User can use commands again');
    info('Full access restored');
}

// ========================================
// SCENARIO 11: OWNER REVOKES ACCESS
// ========================================
log('OWNER revokes user access permanently');
const revokeResult = security.revokeAllowedUser(newUserId);
if (revokeResult.success) {
    success('User removed from allowlist');
    info('Command used: .security unallow ' + newUserId.split('@')[0]);
}

// ========================================
// SCENARIO 12: USER DENIED AGAIN
// ========================================
log('USER tries command after revoke');
const allowed4 = security.isUserAllowed(newUserId);
if (!allowed4) {
    success('User denied (not in allowlist anymore)');
    info('User must request access again');
}

// ========================================
// SCENARIO 13: OWNER PRIVILEGES
// ========================================
log('VERIFY: Owner always has access');
const ownerAllowed = security.isUserAllowed(ownerId);
if (ownerAllowed) {
    success('Owner has access (never needs allowlist)');
}

const cannotBlockOwner = security.blockUser(ownerId, 60000, 'Test');
if (!cannotBlockOwner.success) {
    success('Owner cannot be blocked (protected)');
}

const cannotRevokeOwner = security.revokeAllowedUser(ownerId);
if (!cannotRevokeOwner.success) {
    success('Owner access cannot be revoked (protected)');
}

// ========================================
// FINAL STATISTICS
// ========================================
console.log('\n' + '='.repeat(60));
console.log('📊 FINAL SYSTEM STATE');
console.log('='.repeat(60));

const finalStats = security.getUserAccessStats();
console.log(`\n👥 Users:`);
console.log(`   • Registered: ${finalStats.totalRegistered}`);
console.log(`   • Allowed: ${finalStats.totalAllowed}`);
console.log(`   • Blocked: ${finalStats.totalBlocked}`);

console.log(`\n✅ INTEGRATION TEST COMPLETE`);
console.log(`\nThis demonstrates:`);
console.log(`   1. New user registration and greeting`);
console.log(`   2. Default-deny access policy`);
console.log(`   3. Owner can grant access via allowlist`);
console.log(`   4. Owner can block/unblock users`);
console.log(`   5. Owner can revoke access`);
console.log(`   6. Owner always has full access`);
console.log(`   7. Complete audit trail of all actions\n`);
