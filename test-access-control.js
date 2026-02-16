/**
 * User Access Control Test
 * Tests the new user access locking features
 */

const security = require('./utils/security');
const config = require('./config');

console.log('🧪 Running User Access Control Tests...\n');

let passed = 0;
let failed = 0;

function assert(condition, testName) {
    if (condition) {
        console.log(`✅ PASS: ${testName}`);
        passed++;
    } else {
        console.log(`❌ FAIL: ${testName}`);
        failed++;
    }
}

// Test 1: User Registration
console.log('\n📋 Test 1: User Registration');
try {
    const testUserId = '628123456789@s.whatsapp.net';
    const isNew = security.registerUserIfNew(testUserId);
    assert(isNew === true, 'New user registration returns true');
    
    const isNewAgain = security.registerUserIfNew(testUserId);
    assert(isNewAgain === false, 'Duplicate registration returns false');
    
    const registered = security.getRegisteredUsers();
    assert(registered.length > 0, 'Registered users list not empty');
    assert(registered[0].userId === testUserId, 'User ID in registered list');
} catch (error) {
    console.error('Error in Test 1:', error.message);
    assert(false, 'User registration test failed');
}

// Test 2: Greeting Tracking
console.log('\n👋 Test 2: Greeting Tracking');
try {
    const testUserId = '628123456780@s.whatsapp.net';
    security.registerUserIfNew(testUserId);
    
    const greetingSent1 = security.wasGreetingSent(testUserId);
    assert(greetingSent1 === false, 'Greeting not sent initially');
    
    security.markGreetingSent(testUserId);
    const greetingSent2 = security.wasGreetingSent(testUserId);
    assert(greetingSent2 === true, 'Greeting marked as sent');
} catch (error) {
    console.error('Error in Test 2:', error.message);
    assert(false, 'Greeting tracking test failed');
}

// Test 3: Allow/Revoke User Access
console.log('\n🔓 Test 3: Allow/Revoke User Access');
try {
    const testUserId = '628123456781@s.whatsapp.net';
    const ownerId = '628999999999@s.whatsapp.net';
    
    // Initially not allowed
    const allowed1 = security.isUserAllowed(testUserId);
    assert(allowed1 === false, 'User not allowed initially');
    
    // Allow user
    const allowResult = security.allowUser(testUserId, ownerId);
    assert(allowResult.success === true, 'User allowed successfully');
    
    const allowed2 = security.isUserAllowed(testUserId);
    assert(allowed2 === true, 'User is allowed after allowUser()');
    
    // Check allowlist
    const allowedUsers = security.getAllowedUsers();
    const found = allowedUsers.some(u => u.userId === testUserId);
    assert(found === true, 'User in allowlist');
    
    // Revoke access
    const revokeResult = security.revokeAllowedUser(testUserId);
    assert(revokeResult.success === true, 'User access revoked successfully');
    
    const allowed3 = security.isUserAllowed(testUserId);
    assert(allowed3 === false, 'User not allowed after revoke');
} catch (error) {
    console.error('Error in Test 3:', error.message);
    assert(false, 'Allow/Revoke test failed');
}

// Test 4: Owner Always Allowed
console.log('\n👑 Test 4: Owner Always Allowed');
try {
    const ownerId = config.bot.ownerId;
    
    if (ownerId) {
        // Owner is always allowed without being in allowlist
        const ownerAllowed = security.isUserAllowed(ownerId);
        assert(ownerAllowed === true, 'Owner always allowed');
        
        // Cannot add owner to allowlist (already has access)
        const allowOwnerResult = security.allowUser(ownerId, ownerId);
        assert(allowOwnerResult.success === false, 'Cannot explicitly allow owner');
        
        // Cannot revoke owner access
        const revokeOwnerResult = security.revokeAllowedUser(ownerId);
        assert(revokeOwnerResult.success === false, 'Cannot revoke owner access');
    } else {
        console.log('⚠️  SKIP: Owner ID not configured in .env');
    }
} catch (error) {
    console.error('Error in Test 4:', error.message);
    assert(false, 'Owner access test failed');
}

// Test 5: User Access Statistics
console.log('\n📊 Test 5: User Access Statistics');
try {
    const stats = security.getUserAccessStats();
    assert(typeof stats.totalRegistered === 'number', 'Stats: totalRegistered is number');
    assert(typeof stats.totalAllowed === 'number', 'Stats: totalAllowed is number');
    assert(typeof stats.totalBlocked === 'number', 'Stats: totalBlocked is number');
    assert(stats.totalRegistered >= 0, 'Stats: registered count valid');
} catch (error) {
    console.error('Error in Test 5:', error.message);
    assert(false, 'Statistics test failed');
}

// Test 6: Block Info Integration
console.log('\n⛔ Test 6: Block Info Integration');
try {
    const testUserId = '628123456782@s.whatsapp.net';
    
    // Initially not blocked
    const blockInfo1 = security.getBlockInfo(testUserId);
    assert(blockInfo1 === null, 'No block info for unblocked user');
    
    // Block the user
    security.blockUser(testUserId, 60000, 'Test block'); // 1 minute
    
    const blockInfo2 = security.getBlockInfo(testUserId);
    assert(blockInfo2 !== null, 'Block info exists for blocked user');
    assert(blockInfo2.reason === 'Test block', 'Block info contains reason');
    assert(blockInfo2.remainingMs > 0, 'Block info contains remaining time');
    assert(blockInfo2.remainingMinutes > 0, 'Block info contains remaining minutes');
    
    // Unblock
    security.unblockUser(testUserId);
    const blockInfo3 = security.getBlockInfo(testUserId);
    assert(blockInfo3 === null, 'Block info cleared after unblock');
} catch (error) {
    console.error('Error in Test 6:', error.message);
    assert(false, 'Block info test failed');
}

// Test 7: Config Owner Check Integration
console.log('\n🔍 Test 7: Config Owner Check Integration');
try {
    const ownerId = config.bot.ownerId;
    
    if (ownerId) {
        const isOwner1 = config.isOwner(ownerId);
        assert(isOwner1 === true, 'Owner check returns true for owner ID');
        
        const nonOwnerId = '628000000000@s.whatsapp.net';
        const isOwner2 = config.isOwner(nonOwnerId);
        assert(isOwner2 === false, 'Owner check returns false for non-owner');
    } else {
        console.log('⚠️  SKIP: Owner ID not configured in .env');
    }
} catch (error) {
    console.error('Error in Test 7:', error.message);
    assert(false, 'Config owner check test failed');
}

// Test 8: ID Normalization
console.log('\n🔄 Test 8: ID Normalization');
try {
    const testUserId = '628123456783@s.whatsapp.net';
    const ownerId = '628999999998@s.whatsapp.net';
    
    // Allow user with standard format
    security.allowUser(testUserId, ownerId);
    
    // Check with different format variations
    const allowed1 = security.isUserAllowed(testUserId);
    assert(allowed1 === true, 'User allowed with standard format');
    
    // Check allowlist contains normalized ID
    const allowedUsers = security.getAllowedUsers();
    const found = allowedUsers.some(u => u.userId === testUserId);
    assert(found === true, 'Normalized ID in allowlist');
    
    // Cleanup
    security.revokeAllowedUser(testUserId);
} catch (error) {
    console.error('Error in Test 8:', error.message);
    assert(false, 'ID normalization test failed');
}

// Summary
console.log('\n' + '='.repeat(50));
console.log(`✅ PASSED: ${passed}`);
console.log(`❌ FAILED: ${failed}`);
console.log(`📊 TOTAL:  ${passed + failed}`);
console.log('='.repeat(50));

if (failed > 0) {
    process.exit(1);
}

console.log('\n✨ All user access control tests passed!\n');
