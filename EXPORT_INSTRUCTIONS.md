# ============================================
# INSTRUCTIONS: Export Complete Database Schema
# ============================================

## Option 1: Use Supabase SQL Editor (RECOMMENDED - No installation needed)

1. Open your Supabase Dashboard
2. Go to SQL Editor (left sidebar)
3. Click "New Query"
4. Open the file: `export_complete_schema_simple.sql`
5. Copy ALL the SQL from that file
6. Paste it into the SQL Editor
7. Click "Run" (or press Ctrl+Enter)
8. Wait for the query to complete
9. You'll see ONE result row with a long text field
10. Click on that text field to select all
11. Copy the entire output
12. Save it as `complete_schema.sql` in your project folder

## Option 2: Install PostgreSQL Client Tools (for pg_dump)

### Windows:
1. Download PostgreSQL from: https://www.postgresql.org/download/windows/
2. Install PostgreSQL (includes pg_dump)
3. Add PostgreSQL bin directory to PATH:
   - Usually: `C:\Program Files\PostgreSQL\15\bin`
4. Then run:
   ```powershell
   $env:PGPASSWORD = 'YOUR_PASSWORD'
   pg_dump -h db.wejhmpfwttgcfmikznyp.supabase.co -p 5432 -U postgres -d postgres --schema-only --no-owner --no-privileges -f complete_schema.sql
   ```

### Using Chocolatey:
```powershell
choco install postgresql
```

### Using Scoop:
```powershell
scoop install postgresql
```

## Option 3: Use Node.js Script (requires @supabase/supabase-js)

```bash
npm install @supabase/supabase-js
node export-schema-node.js
```

---

## RECOMMENDED: Use Option 1 (SQL Editor)
It's the simplest and doesn't require any installation!

