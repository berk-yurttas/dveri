# Backend Scripts

This directory contains maintenance and data migration scripts for the application.

## Available Scripts

### backfill_analytics_department.py

Backfills the `analytics_events` table with user name, sector, directorate and management information by fetching data from PocketBase.

**What it does:**
1. Finds all analytics_events records that have a user_id but are missing user_name/sector/directorate/management
2. For each unique user, fetches their name and department information from PocketBase
3. Extracts sector (index -4), directorate (index -3) and management (index -2) from the department string (format: A_B_C_D)
4. Updates the analytics_events records with the extracted information

**Prerequisites:**
- PocketBase admin credentials must be configured in environment variables:
  - `POCKETBASE_URL`
  - `POCKETBASE_ADMIN_EMAIL`
  - `POCKETBASE_ADMIN_PASSWORD`
- Database migration must be applied first (adds directorate and management columns)

**Usage:**

From the `dtbackend` directory:

```bash
# Make sure you're in the dtbackend directory
cd dtbackend

# Run the migration first (if not already applied)
alembic upgrade head

# Run the backfill script
python -m scripts.backfill_analytics_department
```

**Output:**
The script will show progress as it:
- Authenticates with PocketBase
- Fetches unique user IDs that need updating
- Retrieves department information for each user
- Updates the database records
- Shows a summary of total records updated

**Example output:**
```
Starting analytics_events backfill process...
Authenticating with PocketBase...
Successfully authenticated with PocketBase

Fetching records that need updating...
Found 25 unique users to process

Fetching user information from PocketBase...
Processing user 1/25: john.doe
  Name: John Doe
  Department: IT_Engineering_Backend_Team1
  Sector: IT, Directorate: Engineering, Management: Backend
...

Backfill completed successfully!
Total records updated: 1523
```

**Safety:**
- The script only updates records where user_name, sector, directorate or management is NULL
- It uses a transaction and commits at the end
- No existing data is overwritten
- The script can be run multiple times safely (idempotent)
