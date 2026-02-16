# User Access Control Implementation

## Overview
This update implements a comprehensive user access locking system with a separate admin command menu. All bot commands now require explicit approval from the owner, and the menu automatically hides admin-only commands from regular users.

## Key Features

### 1. User Access Locking
- **Automatic Registration**: New users are automatically registered on their first message
- **Welcome Greeting**: First-time users receive a polite welcome message explaining they need approval
- **Access Control**: Only explicitly allowed users (or the owner) can use bot commands
- **Polite Denial**: Unallowed users receive friendly denial messages even for unknown commands

### 2. Admin Command Menu
The admin panel has been significantly enhanced with new user management commands:

#### User Access Management
- `.security allow <number>` - Grant a user access to use bot commands
- `.security unallow <number>` - Revoke a user's access
- `.security users` - View statistics (registered/allowed/blocked counts)
- `.security allowlist` - List all users with granted access

#### User Blocking
- `.security block <number> <minutes>` - Temporarily block a user
- `.security unblock <number>` - Unblock a specific user
- `.security unblock all` - Unblock all users
- `.security list` - View all currently blocked users

### 3. Enhanced Menu System
- **Owner-Only Filtering**: Admin commands are automatically hidden from regular users
- **Admin Section**: Owner sees a dedicated "Admin Menu" section with quick links
- **Category Filtering**: Owner-only commands don't appear in category views for non-owners
- **Detail Protection**: Detailed help for admin commands is hidden from non-owners

### 4. Improved Blocking
- **Detailed Messages**: Blocked users see remaining block time in minutes
- **Reason Display**: Block reason is shown in denial messages
- **Owner Protection**: Owner cannot be blocked or have access revoked
- **Automatic Cleanup**: Expired blocks are automatically removed

## Architecture

### Core Components

#### 1. utils/security.js
New Maps and methods added:
- `registeredUsers` - Tracks all users who have contacted the bot
- `allowedUsers` - Tracks users with explicit access permission
- `registerUserIfNew(userId)` - Registers new users
- `isUserAllowed(userId)` - Checks if user has access
- `allowUser(userId, allowedBy)` - Grants access
- `revokeAllowedUser(userId)` - Removes access
- `getAllowedUsers()` - Returns allowlist
- `getRegisteredUsers()` - Returns all registered users
- `getUserAccessStats()` - Returns statistics
- `getBlockInfo(userId)` - Returns block details with remaining time

#### 2. handler.js
Enhanced message processing flow:
1. Register user on first message
2. Send welcome greeting (once)
3. Check if user is blocked → show remaining time
4. Check command prefix
5. **Check if user is allowed** → deny if not allowed
6. Continue with normal command processing

#### 3. commands/security.js
New admin subcommands:
- `allow` - Grant access to user
- `unallow` / `revoke` - Revoke user access
- `users` / `stats` - Show user statistics
- `allowlist` / `allowed` - List allowed users

Updated display:
- Status now shows registered/allowed/blocked counts
- Help menu includes all user management commands

#### 4. commands/menu.js
Enhanced menu display:
- Checks `config.isOwner(sender)` for each request
- Filters out owner-only commands from non-owners
- Shows dedicated admin section for owner
- Hides admin commands in category and detail views

## Message Flow

### New User (First Message)
```
User sends: ".menu"
  ↓
1. User registered in system
2. Greeting message sent
3. Access check → NOT ALLOWED
4. Polite denial message sent
```

### Blocked User
```
User sends: ".ping"
  ↓
1. Block check → BLOCKED
2. Block info retrieved
3. Denial message with remaining time
4. Command ignored
```

### Allowed User
```
User sends: ".ping"
  ↓
1. Access check → ALLOWED
2. Command executed normally
```

### Owner
```
Owner sends: ".security allow 6281234567890"
  ↓
1. Owner check → OWNER (always allowed)
2. Security command executed
3. User added to allowlist
4. Confirmation message sent
```

## Configuration

### Environment Variables
No new environment variables required. The system works with existing configuration:
- `BOT_OWNER_ID` - Owner ID (required for admin commands)
- `OWNER_ONLY_COMMANDS` - Comma-separated list of owner-only commands (default: "security,spam")

### Owner Setup
The owner is automatically:
- Always allowed to use commands (never needs explicit allowlist entry)
- Cannot be blocked
- Cannot have access revoked
- Sees admin menu section

## Testing

### Run Access Control Tests
```bash
npm run test:access
```

### Test Coverage
- User registration and greeting tracking
- Allow/revoke access flow
- Owner protection (always allowed, cannot be blocked)
- Access statistics
- Block info with remaining time
- ID normalization
- Config integration

All 24 tests pass successfully!

### Run All Tests
```bash
npm run test:all
```

## Usage Examples

### Allowing a New User
```
Owner: .security allow 6281234567890
Bot: ✅ AKSES DIBERIKAN
     Pengguna 6281234567890 telah diizinkan menggunakan bot.
```

### Viewing User Statistics
```
Owner: .security users
Bot: 📊 STATISTIK PENGGUNA
     
     👥 Total Pengguna
     • Terdaftar: 15
     • Diizinkan: 8
     • Terblokir: 2
```

### Listing Allowed Users
```
Owner: .security allowlist
Bot: ✅ DAFTAR PENGGUNA DIIZINKAN (8)
     
     • 6281234567890
       Diizinkan: 15/02/2026 oleh 6289999999999
```

### Revoking Access
```
Owner: .security unallow 6281234567890
Bot: 🔒 AKSES DICABUT
     Akses pengguna 6281234567890 telah dicabut.
```

## Security Considerations

1. **Owner Protection**: Owner cannot be blocked or have access revoked
2. **Startup Safety**: Owner blocks are cleared on bot startup (failsafe)
3. **Denial Messages**: Polite and informative, doesn't leak command information
4. **Unknown Commands**: Even unrecognized commands trigger access denial for unallowed users
5. **ID Normalization**: Handles multiple ID formats consistently

## Backward Compatibility

✅ All existing functionality preserved:
- Existing security features (pattern detection, rate limiting, etc.) still work
- Existing commands unchanged
- Existing config system unchanged
- Owner-only command enforcement enhanced (not changed)

✅ Migration path:
- On first deploy, no users are in allowlist
- Owner can gradually allow trusted users
- Or owner can manually add users to allowlist after reviewing registered users

## Future Enhancements

Potential improvements (not in current implementation):
- Persistent storage (file or database) for allowlist and registered users
- Auto-approval after X days or Y messages
- User roles (admin, moderator, user)
- Approval workflow (user requests, owner approves)
- Access expiration dates
- Usage quotas per user

## Rollback

To disable the access control (emergency):
1. Comment out the access check in `handler.js` (lines ~120-130)
2. Restart bot

Or update handler.js to allow all users by default:
```javascript
// Temporary: Allow all registered users
if (!security.isUserAllowed(sender) && !isNewUser) {
    security.allowUser(sender, 'system');
}
```

## Support

For issues or questions about the user access control system:
1. Check test results: `npm run test:access`
2. Review this documentation
3. Check security command help: `.security`
4. View logs for access denials and registrations
