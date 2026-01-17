/**
 * Check what image URLs exist in the database
 */

import { Client } from 'pg';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.join(__dirname, '../../cloudflare.env') });
dotenv.config();

async function checkImageUrls() {
  const databaseUrl = process.env.DATABASE_URL;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL must be set');
  }

  const pgClient = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  });

  await pgClient.connect();
  console.log('✅ Connected to database\n');

  try {
    // Check database URLs
    console.log('📊 Checking character_image_url values in database...\n');
    const result = await pgClient.query(`
      SELECT asset_id, name, character_image_url 
      FROM nfts 
      WHERE character_image_url IS NOT NULL
      ORDER BY asset_id
    `);

    console.log(`Found ${result.rows.length} NFTs with image URLs:\n`);
    
    const supabaseUrls: string[] = [];
    const otherUrls: string[] = [];

    for (const row of result.rows) {
      const url = row.character_image_url;
      if (url.includes('supabase.co')) {
        supabaseUrls.push(url);
        console.log(`  🔵 ${row.asset_id} (${row.name}): ${url}`);
      } else {
        otherUrls.push(url);
        console.log(`  🟢 ${row.asset_id} (${row.name}): ${url}`);
      }
    }

    console.log(`\n📊 Summary:`);
    console.log(`  Supabase URLs: ${supabaseUrls.length}`);
    console.log(`  Other URLs: ${otherUrls.length}`);

    // Check Supabase Storage buckets
    if (supabaseUrl && supabaseKey) {
      console.log(`\n📦 Checking Supabase Storage buckets...`);
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
      if (bucketsError) {
        console.error(`  ❌ Error listing buckets: ${bucketsError.message}`);
      } else {
        console.log(`  ✅ Found ${buckets?.length || 0} buckets:`);
        for (const bucket of buckets || []) {
          console.log(`     - ${bucket.name} (public: ${bucket.public})`);
          
          // List files in character-images bucket
          if (bucket.name === 'character-images') {
            const { data: files, error: filesError } = await supabase.storage
              .from(bucket.name)
              .list('', { limit: 100 });
            
            if (filesError) {
              console.error(`     ❌ Error listing files: ${filesError.message}`);
            } else {
              console.log(`     📁 Files in bucket: ${files?.length || 0}`);
              if (files && files.length > 0) {
                files.slice(0, 10).forEach((file: any) => {
                  console.log(`        - ${file.name} (${file.metadata?.size || 'unknown size'})`);
                });
                if (files.length > 10) {
                  console.log(`        ... and ${files.length - 10} more`);
                }
              }
            }
          }
        }
      }
    }

  } finally {
    await pgClient.end();
  }
}

checkImageUrls().catch(err => {
  console.error('❌ Failed:', err);
  process.exit(1);
});
