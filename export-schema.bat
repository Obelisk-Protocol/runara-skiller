@echo off
REM ============================================
REM Export Complete Database Schema
REM Batch script for Windows
REM ============================================

set HOST=db.wejhmpfwttgcfmikznyp.supabase.co
set PORT=5432
set DATABASE=postgres
set USER=postgres
set OUTPUT=complete_schema.sql

echo Exporting schema to %OUTPUT%...

REM You'll be prompted for password
pg_dump -h %HOST% -p %PORT% -U %USER% -d %DATABASE% --schema-only --no-owner --no-privileges -f %OUTPUT%

if %ERRORLEVEL% EQU 0 (
    echo ✅ Schema exported successfully to %OUTPUT%
) else (
    echo ❌ Export failed. Check your connection details.
)

pause

