// ============================================
// Export Complete Database Schema via Supabase
// Node.js script using Supabase client
// ============================================

const fs = require('fs');
const path = require('path');

// Supabase connection details
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wejhmpfwttgcfmikznyp.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'YOUR_SERVICE_KEY';

// Check if Supabase client is available
let supabase;
try {
    const { createClient } = require('@supabase/supabase-js');
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
} catch (e) {
    console.error('❌ @supabase/supabase-js not installed.');
    console.log('📦 Install it with: npm install @supabase/supabase-js');
    console.log('\nAlternatively, use the SQL query approach:');
    console.log('1. Open Supabase Dashboard → SQL Editor');
    console.log('2. Run export_complete_schema_simple.sql');
    console.log('3. Copy the output and save as complete_schema.sql');
    process.exit(1);
}

// Read the SQL query
const sqlQuery = fs.readFileSync(
    path.join(__dirname, 'export_complete_schema_simple.sql'),
    'utf8'
);

async function exportSchema() {
    console.log('🔄 Exporting complete database schema...\n');
    
    try {
        // Execute the query
        const { data, error } = await supabase.rpc('exec_sql', { sql_query: sqlQuery });
        
        if (error) {
            // Try direct query execution
            console.log('⚠️ RPC method not available, trying direct query...\n');
            
            // For direct query, we need to use the REST API or SQL Editor
            console.log('📝 Please run this query in Supabase SQL Editor:');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log(sqlQuery);
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('\nThen copy the output and save it as complete_schema.sql');
            return;
        }
        
        if (data && data.length > 0) {
            const schema = data[0].complete_schema_export || data[0];
            fs.writeFileSync(
                path.join(__dirname, 'complete_schema.sql'),
                schema,
                'utf8'
            );
            console.log('✅ Schema exported successfully to complete_schema.sql');
        } else {
            console.log('⚠️ No data returned. Please use the SQL Editor approach.');
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        console.log('\n📝 Please use the SQL Editor approach instead:');
        console.log('1. Open Supabase Dashboard → SQL Editor');
        console.log('2. Copy and run export_complete_schema_simple.sql');
        console.log('3. Copy the output and save as complete_schema.sql');
    }
}

// Run export
exportSchema();

