-- Migration: Add CAD file upload support
-- Description: Creates storage bucket for STL/SCAD files and extends design_branches schema

-- Create storage bucket for CAD files
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'cad-files',
  'cad-files',
  false,
  104857600, -- 100MB limit
  ARRAY[
    'model/stl',                    -- STL binary
    'application/sla',              -- STL ASCII
    'application/vnd.ms-pki.stl',   -- STL (Windows)
    'application/x-openscad',       -- OpenSCAD
    'text/plain',                   -- SCAD files often served as text
    'application/octet-stream'      -- Generic binary (for STL)
  ]
);

-- Add columns to design_branches table
ALTER TABLE design_branches
ADD COLUMN IF NOT EXISTS source_file_id TEXT,
ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'ai_generated' CHECK (
  source_type IN ('ai_generated', 'uploaded', 'modified')
);

-- Add comment for documentation
COMMENT ON COLUMN design_branches.source_file_id IS 'Reference to uploaded file in cad-files storage bucket';
COMMENT ON COLUMN design_branches.source_type IS 'Origin of the design: ai_generated (default), uploaded (from file), or modified (AI improvement of uploaded)';

-- Create RLS policies for cad-files bucket
-- Policy: Users can upload their own files
CREATE POLICY "Users can upload their own CAD files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'cad-files' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy: Users can read their own files
CREATE POLICY "Users can read their own CAD files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'cad-files' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy: Users can delete their own files
CREATE POLICY "Users can delete their own CAD files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'cad-files' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy: Users can update their own files
CREATE POLICY "Users can update their own CAD files"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'cad-files' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Add index for faster lookups by source_file_id
CREATE INDEX IF NOT EXISTS idx_design_branches_source_file
ON design_branches(source_file_id)
WHERE source_file_id IS NOT NULL;
