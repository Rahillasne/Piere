-- ============================================================================
-- Version Control Redesign Migration
-- ============================================================================
-- Transforms multi-viewport grid system into single-viewport with version history
-- Similar to CAD software (Fusion 360/SolidWorks) version control
--
-- Changes:
-- - Add version_number: Track v1, v2, v3... of each design lineage
-- - Add is_latest_version: Quick query for current version
-- - Add design_lineage_id: Group all versions of the same design
--
-- Workflow After Migration:
-- - "create water bottle" → v1 (lineage_id: abc123)
-- - "make it taller" → v2 (lineage_id: abc123, parent: v1)
-- - "add handle" → v3 (lineage_id: abc123, parent: v2)
-- ============================================================================

-- Add version control columns
ALTER TABLE design_branches
  ADD COLUMN IF NOT EXISTS version_number INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_latest_version BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS design_lineage_id UUID;

-- Create indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_design_lineage
  ON design_branches(design_lineage_id);

CREATE INDEX IF NOT EXISTS idx_latest_version
  ON design_branches(is_latest_version)
  WHERE is_latest_version = TRUE;

CREATE INDEX IF NOT EXISTS idx_version_number
  ON design_branches(version_number);

-- Create composite index for finding latest version in a lineage
CREATE INDEX IF NOT EXISTS idx_lineage_latest
  ON design_branches(design_lineage_id, is_latest_version)
  WHERE is_latest_version = TRUE;

-- ============================================================================
-- Migrate Existing Data
-- ============================================================================
-- For existing multi-viewport data:
-- - Each branch becomes v1 of its own lineage
-- - Mark all as is_latest_version=true (they were independent designs)
-- - Generate unique lineage_id for each
-- ============================================================================

DO $$
DECLARE
  branch_record RECORD;
BEGIN
  -- Process each existing branch
  FOR branch_record IN
    SELECT id FROM design_branches
    WHERE design_lineage_id IS NULL
  LOOP
    -- Set as v1 with unique lineage ID
    UPDATE design_branches
    SET
      version_number = 1,
      is_latest_version = TRUE,
      design_lineage_id = gen_random_uuid()
    WHERE id = branch_record.id;
  END LOOP;

  RAISE NOTICE 'Migrated % existing branches to version control system',
    (SELECT COUNT(*) FROM design_branches WHERE version_number = 1);
END $$;

-- ============================================================================
-- Helper Function: Get Latest Version
-- ============================================================================
-- Returns the latest version branch for a given lineage
-- ============================================================================

CREATE OR REPLACE FUNCTION get_latest_version(lineage_uuid UUID)
RETURNS TABLE (
  id UUID,
  version_number INTEGER,
  code TEXT,
  parameters JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    db.id,
    db.version_number,
    db.code,
    db.parameters
  FROM design_branches db
  WHERE db.design_lineage_id = lineage_uuid
    AND db.is_latest_version = TRUE
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Helper Function: Get Version History
-- ============================================================================
-- Returns all versions in a lineage, ordered from v1 to latest
-- ============================================================================

CREATE OR REPLACE FUNCTION get_version_history(lineage_uuid UUID)
RETURNS TABLE (
  id UUID,
  version_number INTEGER,
  code TEXT,
  parameters JSONB,
  created_at TIMESTAMPTZ,
  is_latest BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    db.id,
    db.version_number,
    db.code,
    db.parameters,
    db.created_at,
    db.is_latest_version as is_latest
  FROM design_branches db
  WHERE db.design_lineage_id = lineage_uuid
  ORDER BY db.version_number ASC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON COLUMN design_branches.version_number IS
  'Version number within a design lineage (v1, v2, v3...)';

COMMENT ON COLUMN design_branches.is_latest_version IS
  'TRUE for the current/latest version in a lineage (only one per lineage)';

COMMENT ON COLUMN design_branches.design_lineage_id IS
  'Groups all versions of the same design together';

COMMENT ON FUNCTION get_latest_version IS
  'Returns the latest version branch for a given design lineage';

COMMENT ON FUNCTION get_version_history IS
  'Returns all versions in a lineage, ordered from v1 to latest';
