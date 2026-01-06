# Login Tracking Implementation

## Overview
This document describes the implementation of login tracking functionality in the users model. The system now keeps a log of how many times each user has logged into the system and when their last login occurred.

The system uses **session-based tracking** to count unique browser sessions:
- **Login count increments** when user logs in OR when they open the application in a new browser session
- **Login count does NOT increment** on page reloads within the same browser session
- A session ends when the user closes all browser windows/tabs

## Changes Made

### 1. Database Model Updates (`app/models/postgres_models.py`)

Added two new fields to the `User` model:
- **`login_count`**: Integer field that tracks the total number of times a user has logged in
  - Default value: 0
  - Non-nullable
- **`last_login_at`**: DateTime field that stores the timestamp of the user's most recent login
  - Nullable (will be NULL until first login)
  - Timezone-aware

```python
# Login tracking fields
login_count = Column(Integer, default=0, nullable=False)
last_login_at = Column(DateTime(timezone=True), nullable=True)
```

### 2. Database Migration (`alembic/versions/add_login_tracking_to_users.py`)

Created a new Alembic migration to add these fields to the existing users table:
- **Revision ID**: `add_login_tracking_001`
- **Revises**: `add_direct_link_001`
- **Migration file**: `add_login_tracking_to_users.py`

The migration:
- **Upgrade**: Adds `login_count` (default 0) and `last_login_at` columns to the `users` table
- **Downgrade**: Removes these columns

To apply the migration, run:
```bash
python manage_migrations.py primary upgrade head
```

Or using Make:
```bash
make migrate-upgrade
```

### 3. User Service Updates (`app/services/user_service.py`)

Added a new method `increment_login_count` to the `UserService` class:

```python
@staticmethod
async def increment_login_count(db: AsyncSession, user: User) -> User:
    """
    Increment login count and update last login timestamp for a user
    
    Args:
        db: Database session
        user: User object to update
        
    Returns:
        Updated User object
    """
    from sqlalchemy.sql import func
    
    user.login_count = (user.login_count or 0) + 1
    user.last_login_at = func.now()
    
    await db.commit()
    await db.refresh(user)
    return user
```

This method:
- Increments the user's login count by 1
- Updates the last login timestamp to the current time
- Commits the changes to the database
- Returns the updated user object

### 4. Login Endpoint Updates (`app/api/v1/endpoints/users.py`)

#### A. Modified `/login_redirect` endpoint

Tracks user logins during the authentication flow:

The endpoint now:
1. Handles SAML login redirect and gets decrypted tokens
2. **Verifies the access token and extracts user information** ← NEW
3. **Gets or creates the user in the database** ← NEW
4. **Calls `increment_login_count` to track the login** ← NEW
5. Sets authentication cookies (including session cookie)
6. Redirects to the client application

```python
# Track login during authentication
await UserService.increment_login_count(db, user)

# Set session cookie (deleted when browser closes)
import secrets
session_id = secrets.token_urlsafe(32)
redirect_response.set_cookie(
    key="session_id",
    value=session_id,
    domain=cookie_domain,
    httponly=True,
    path="/",
    secure=False,
    samesite="lax"
    # No max_age = session cookie
)
```

#### B. Modified `/login_jwt` endpoint

Tracks new browser sessions:

The endpoint now:
1. Gets or creates the user in the database
2. Updates the user's name
3. **Checks if session cookie exists** ← NEW
4. **If no session cookie (new browser session), increments login count** ← NEW
5. **Sets a new session cookie** ← NEW
6. Returns the current user information

```python
# Check if this is a new session (no session cookie)
session_id = request.cookies.get("session_id")
if not session_id:
    # New session - increment login count
    user = await UserService.increment_login_count(db, user)
    
    # Set a new session cookie
    import secrets
    new_session_id = secrets.token_urlsafe(32)
    response.set_cookie(
        key="session_id",
        value=new_session_id,
        domain=cookie_domain,
        httponly=True,
        path="/",
        secure=False,
        samesite="lax"
        # No max_age = session cookie (deleted when browser closes)
    )
```

**Important**: The system uses session-based tracking:
- Login count increments during actual login (`/login_redirect`)
- Login count ALSO increments when opening the app in a new browser session (`/login_jwt` with no session cookie)
- Page reloads within the same session do NOT increment the count

## How It Works

### Login Flow

#### Scenario 1: Initial Login (User enters credentials)

1. **User authenticates** through the SAML/PocketBase authentication system
2. **Authentication server redirects to `/login_redirect`** with encrypted tokens
3. **Tokens are decrypted and verified**
4. **Login tracking is executed**:
   - User information is extracted from the token
   - System checks if user exists in the database
     - If not, creates a new user record
     - If yes, retrieves existing user record
   - `login_count` is incremented by 1
   - `last_login_at` is set to current timestamp
   - Changes are saved to the database
5. **Authentication cookies are set** (access_token, refresh_token, and **session_id**)
6. **User is redirected** to the client application

#### Scenario 2: Page Reload (Same browser session)

1. **User reloads the page** or navigates within the application
2. **`/login_jwt` endpoint is called** to verify authentication
3. **Session cookie is checked**:
   - Session cookie exists → No action, just return user profile
   - Login count does NOT increment ✓
4. **User profile is returned**

#### Scenario 3: New Browser Session (User closes and reopens browser)

1. **User closes all browser windows** (session cookies are deleted)
2. **User opens browser and navigates to the application**
3. **`/login_jwt` endpoint is called** to verify authentication
4. **Session cookie is checked**:
   - Session cookie is missing (new session detected)
   - `login_count` is incremented by 1
   - `last_login_at` is updated
   - New session cookie is set
5. **User profile is returned**

**Summary**:
- ✅ Actual login (with credentials) → Count increments
- ✅ New browser session (after closing browser) → Count increments
- ❌ Page reload (same session) → Count does NOT increment

### Example Database Records

**New User (First Login)**:
```
username: john.doe
login_count: 1
last_login_at: 2025-01-05 10:30:00+00
```

**Returning User (10th Login)**:
```
username: jane.smith
login_count: 10
last_login_at: 2025-01-05 14:45:23+00
```

## API Endpoints Affected

### GET `/api/v1/users/login_redirect`
- **Purpose**: Handle SAML login redirect with token decryption
- **New Behavior**: Tracks user login by incrementing login count and updating last login timestamp
- **Authentication**: Not required (public endpoint for login flow)
- **Side Effect**: Updates `login_count` and `last_login_at` in database, sets session cookie
- **Called**: Only during actual login events (when user enters credentials)
- **Session Tracking**: Sets a new session cookie

### GET `/api/v1/users/login_jwt`
- **Purpose**: Get current user information from JWT token
- **New Behavior**: Checks for session cookie and tracks new browser sessions
- **Authentication**: Required (depends on `check_authenticated`)
- **Side Effect**: 
  - If session cookie exists: None (just returns user profile)
  - If session cookie missing: Updates `login_count` and `last_login_at`, sets new session cookie
- **Called**: On page reloads, authentication checks, and when opening the app
- **Session Tracking**: Creates session cookie if missing (indicates new browser session)

## Database Schema

### Users Table

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | Integer | No | Auto | Primary key |
| username | String(50) | No | - | Unique username |
| created_at | DateTime(TZ) | No | now() | User creation timestamp |
| updated_at | DateTime(TZ) | Yes | - | Last update timestamp |
| name | String(255) | Yes | - | User's full name |
| workshop_id | Integer | Yes | - | Associated workshop ID |
| **login_count** | **Integer** | **No** | **0** | **Total number of logins** |
| **last_login_at** | **DateTime(TZ)** | **Yes** | **NULL** | **Timestamp of last login** |

## Usage Examples

### Query Login Statistics

You can now query user login statistics directly from the database:

```python
# Get users who have logged in more than 10 times
from app.models.postgres_models import User
from sqlalchemy import select

query = select(User).where(User.login_count > 10)
result = await db.execute(query)
users = result.scalars().all()

# Get users who haven't logged in recently
from datetime import datetime, timedelta

one_month_ago = datetime.now() - timedelta(days=30)
query = select(User).where(User.last_login_at < one_month_ago)
result = await db.execute(query)
inactive_users = result.scalars().all()
```

### SQL Queries

```sql
-- Get top 10 most active users
SELECT username, name, login_count, last_login_at
FROM users
ORDER BY login_count DESC
LIMIT 10;

-- Get users who logged in today
SELECT username, name, login_count, last_login_at
FROM users
WHERE last_login_at >= CURRENT_DATE;

-- Get users who have never logged in
SELECT username, name
FROM users
WHERE login_count = 0 OR last_login_at IS NULL;
```

## Testing

To test the implementation:

1. **Apply the migration**:
   ```bash
   python manage_migrations.py primary upgrade head
   ```

2. **Start the backend server**:
   ```bash
   python -m uvicorn main:app --reload
   ```

3. **Test Scenario 1: Initial Login**
   - Login to the application through the frontend
   - Check the database:
     ```sql
     SELECT username, login_count, last_login_at FROM users WHERE username = 'your_username';
     ```
   - Verify `login_count` = 1

4. **Test Scenario 2: Page Reload (should NOT increment)**
   - Reload the page multiple times (F5 or Ctrl+R)
   - Check the database again
   - Verify `login_count` is still 1 (unchanged)

5. **Test Scenario 3: New Browser Session (should increment)**
   - Close ALL browser windows/tabs
   - Open browser again and navigate to the application
   - You should be still logged in (tokens are still valid)
   - Check the database
   - Verify `login_count` = 2 (incremented)

6. **Test Scenario 4: Multiple Reloads in Same Session**
   - Reload the page 10 times
   - Check the database
   - Verify `login_count` is still 2 (unchanged)

7. **Test Scenario 5: Close and Open Again**
   - Close browser completely
   - Open browser and navigate to the application
   - Check the database
   - Verify `login_count` = 3 (incremented again)

## Future Enhancements

Possible future improvements:
- Add login history table to track each individual login (IP address, device, etc.)
- Add analytics dashboard to visualize login patterns
- Add API endpoints to retrieve login statistics
- Add alerts for suspicious login patterns (too many logins, unusual times, etc.)
- Track failed login attempts
- Add session duration tracking

## Notes

- The login count increments in two scenarios:
  1. **Actual login** (user enters credentials) via `/login_redirect`
  2. **New browser session** (user closes and reopens browser) via `/login_jwt`
- Page reloads within the same browser session do NOT increment the login count
- Session tracking uses a `session_id` cookie that is deleted when the browser closes (no max_age set)
- The timestamp uses UTC timezone (timezone-aware)
- For existing users in the database, `login_count` will start from 0 and increment from there
- The implementation is lightweight and doesn't significantly impact login performance
- Login tracking errors are caught and logged but don't prevent successful login
- The session cookie is HttpOnly, SameSite=Lax for security

