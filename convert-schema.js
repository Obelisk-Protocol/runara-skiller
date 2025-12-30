// ============================================
// Convert db.json to SQL CREATE Statements
// Node.js script to convert your JSON export to SQL
// ============================================

const fs = require('fs');
const path = require('path');

// Read the JSON file
const dbJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'db.json'), 'utf8'));

// Group columns by table
const tables = {};
dbJson.forEach(col => {
    if (!tables[col.table_name]) {
        tables[col.table_name] = [];
    }
    tables[col.table_name].push(col);
});

// Generate SQL CREATE statements
let sql = '-- ============================================\n';
sql += '-- AUTO-GENERATED SQL CREATE STATEMENTS\n';
sql += '-- Generated from db.json export\n';
sql += '-- ============================================\n\n';

Object.keys(tables).sort().forEach(tableName => {
    const columns = tables[tableName];
    
    sql += `-- Table: ${tableName}\n`;
    sql += `CREATE TABLE IF NOT EXISTS ${tableName} (\n`;
    
    const columnDefs = columns.map(col => {
        let def = `    ${col.column_name} `;
        
        // Map data types
        if (col.data_type === 'character varying') {
            def += 'VARCHAR';
        } else if (col.data_type === 'ARRAY') {
            def += col.udt_name || 'TEXT[]';
        } else if (col.udt_name === 'int4') {
            def += 'INTEGER';
        } else if (col.udt_name === 'int8') {
            def += 'BIGINT';
        } else if (col.udt_name === 'bool') {
            def += 'BOOLEAN';
        } else if (col.udt_name === 'uuid') {
            def += 'UUID';
        } else if (col.udt_name === 'jsonb') {
            def += 'JSONB';
        } else if (col.udt_name === 'numeric') {
            def += 'NUMERIC';
        } else if (col.udt_name === 'real') {
            def += 'REAL';
        } else if (col.data_type === 'timestamp without time zone') {
            def += 'TIMESTAMP';
        } else if (col.data_type === 'timestamp with time zone') {
            def += 'TIMESTAMPTZ';
        } else {
            def += col.data_type.toUpperCase() || col.udt_name?.toUpperCase() || 'TEXT';
        }
        
        if (col.is_nullable === 'NO') {
            def += ' NOT NULL';
        }
        
        if (col.column_default) {
            def += ` DEFAULT ${col.column_default}`;
        }
        
        return def;
    });
    
    sql += columnDefs.join(',\n');
    sql += '\n);\n\n';
});

// Write to file
fs.writeFileSync(path.join(__dirname, 'schema_from_json.sql'), sql);
console.log('✅ Generated schema_from_json.sql');
console.log(`📊 Exported ${Object.keys(tables).length} tables`);
