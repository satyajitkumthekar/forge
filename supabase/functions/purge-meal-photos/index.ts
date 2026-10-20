/**
 * Supabase Edge Function: Purge Meal Photos
 * Deletes meal photos older than 7 days: the files first (through the
 * Storage API, since SQL can't remove storage files), then their rows.
 * Called daily by pg_cron (see migrations/20261020_meal_photos.sql).
 * SECURITY: deployed without JWT verification; the x-purge-secret header
 * must match the Vault secret (checked by check_meal_photos_purge_secret).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const KEEP_DAYS = 7;
// Storage remove() takes up to 1000 paths per call
const BATCH = 1000;

serve(async (req) => {
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const secret = req.headers.get('x-purge-secret');
  const { data: allowed } = secret
    ? await admin.rpc('check_meal_photos_purge_secret', { candidate: secret })
    : { data: false };
  if (!allowed) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const cutoff = new Date(Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000).toISOString();
  let purged = 0;

  try {
    while (true) {
      const { data: rows, error } = await admin
        .from('meal_photos')
        .select('meal_group_id, path')
        .lt('created_at', cutoff)
        .limit(BATCH);
      if (error) throw error;
      if (!rows || rows.length === 0) break;

      const { error: removeError } = await admin.storage
        .from('meal-photos')
        .remove(rows.map((row) => row.path));
      if (removeError) throw removeError;

      const { error: deleteError } = await admin
        .from('meal_photos')
        .delete()
        .in('meal_group_id', rows.map((row) => row.meal_group_id));
      if (deleteError) throw deleteError;

      purged += rows.length;
      if (rows.length < BATCH) break;
    }

    console.log(`Purged ${purged} meal photos older than ${cutoff}`);
    return new Response(JSON.stringify({ purged }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Purge failed:', err);
    return new Response(JSON.stringify({ error: String(err), purged }), { status: 500 });
  }
});
