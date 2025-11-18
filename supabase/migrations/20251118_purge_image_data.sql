-- Migration: Purge Image Data
-- Purpose: Delete all image_data from food_entries to free up 138MB+ storage
-- Impact: Reduces database size by ~96%, massive egress savings
-- Safety: Keeps all food logs (name, calories, protein, description) intact

-- Step 1: Show current state before cleanup
DO $$
DECLARE
  total_entries INTEGER;
  entries_with_images INTEGER;
  total_size_mb NUMERIC;
BEGIN
  SELECT COUNT(*) INTO total_entries FROM food_entries;
  SELECT COUNT(*) INTO entries_with_images FROM food_entries WHERE image_data IS NOT NULL;
  SELECT ROUND((SUM(LENGTH(image_data::text)) / 1024.0 / 1024.0)::numeric, 2) INTO total_size_mb
  FROM food_entries WHERE image_data IS NOT NULL;

  RAISE NOTICE 'Before cleanup:';
  RAISE NOTICE '  Total entries: %', total_entries;
  RAISE NOTICE '  Entries with images: %', entries_with_images;
  RAISE NOTICE '  Total image data: % MB', total_size_mb;
END $$;

-- Step 2: Purge all image data (keeping the food logs!)
UPDATE food_entries
SET image_data = NULL
WHERE image_data IS NOT NULL;

-- Step 3: Show results after cleanup
DO $$
DECLARE
  total_entries INTEGER;
  entries_with_images INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_entries FROM food_entries;
  SELECT COUNT(*) INTO entries_with_images FROM food_entries WHERE image_data IS NOT NULL;

  RAISE NOTICE 'After cleanup:';
  RAISE NOTICE '  Total entries: %', total_entries;
  RAISE NOTICE '  Entries with images: %', entries_with_images;
  RAISE NOTICE '  Image data purged successfully!';
END $$;

-- Step 4: Run VACUUM to reclaim disk space
-- Note: This will happen automatically, but we can suggest it
COMMENT ON COLUMN food_entries.image_data IS 'Deprecated: Images are no longer stored. Column kept for backward compatibility.';
