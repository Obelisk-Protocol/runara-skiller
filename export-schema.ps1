# ============================================
# Export Complete Database Schema
# PowerShell script for Windows
# ============================================

# Get connection details from Supabase Dashboard:
# Project Settings > Database > Connection String

$host = "db.wejhmpfwttgcfmikznyp.supabase.co"
$port = "5432"
$database = "postgres"
$user = "postgres"
$outputFile = "complete_schema.sql"

# Prompt for password
$password = Read-Host "Enter database password" -AsSecureString
$BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($password)
$plainPassword = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)

# Set environment variable for password
$env:PGPASSWORD = $plainPassword

# Run pg_dump
Write-Host "Exporting schema to $outputFile..." -ForegroundColor Green

pg_dump -h $host -p $port -U $user -d $database --schema-only --no-owner --no-privileges -f $outputFile

# Clear password from environment
$env:PGPASSWORD = ""

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Schema exported successfully to $outputFile" -ForegroundColor Green
} else {
    Write-Host "❌ Export failed. Check your connection details." -ForegroundColor Red
}

