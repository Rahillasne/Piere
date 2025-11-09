-- ============================================================================
-- Brainstorm Mode Database Schema
-- Creates tables for voice-driven multi-view CAD brainstorming
-- ============================================================================

-- Brainstorm Sessions Table
-- Tracks brainstorming sessions with multiple design variations
CREATE TABLE IF NOT EXISTS brainstorm_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

    -- Session Configuration
    viewport_layout JSONB DEFAULT '{"columns": 2, "rows": 2}'::jsonb,
    active_branches UUID[] DEFAULT ARRAY[]::UUID[],

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Design Branches Table
-- Tracks individual design variations within a brainstorm session
CREATE TABLE IF NOT EXISTS design_branches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    brainstorm_session_id UUID REFERENCES brainstorm_sessions(id) ON DELETE CASCADE NOT NULL,
    message_id UUID REFERENCES messages(id) ON DELETE CASCADE NOT NULL,

    -- Branch Information
    branch_index INTEGER NOT NULL, -- 0, 1, 2 for parallel variations
    parent_branch_id UUID REFERENCES design_branches(id) ON DELETE SET NULL,
    viewport_position INTEGER DEFAULT 0, -- Which viewport (0-3)

    -- Design Metrics (calculated after compilation)
    metrics JSONB DEFAULT '{}'::jsonb,
    -- Example metrics structure:
    -- {
    --   "volume": 1234.56,
    --   "surfaceArea": 789.01,
    --   "printTime": 120,
    --   "material": 15.5,
    --   "polygonCount": 5000
    -- }

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- Indexes for Performance
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_brainstorm_sessions_user_id
    ON brainstorm_sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_brainstorm_sessions_conversation_id
    ON brainstorm_sessions(conversation_id);

CREATE INDEX IF NOT EXISTS idx_design_branches_session_id
    ON design_branches(brainstorm_session_id);

CREATE INDEX IF NOT EXISTS idx_design_branches_message_id
    ON design_branches(message_id);

CREATE INDEX IF NOT EXISTS idx_design_branches_parent_id
    ON design_branches(parent_branch_id);

-- ============================================================================
-- Row Level Security (RLS) Policies
-- ============================================================================

-- Enable RLS
ALTER TABLE brainstorm_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE design_branches ENABLE ROW LEVEL SECURITY;

-- Brainstorm Sessions Policies
-- Users can only access their own brainstorm sessions
CREATE POLICY "Users can view own brainstorm sessions"
    ON brainstorm_sessions
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create own brainstorm sessions"
    ON brainstorm_sessions
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own brainstorm sessions"
    ON brainstorm_sessions
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own brainstorm sessions"
    ON brainstorm_sessions
    FOR DELETE
    USING (auth.uid() = user_id);

-- Design Branches Policies
-- Users can access design branches through their brainstorm sessions
CREATE POLICY "Users can view own design branches"
    ON design_branches
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM brainstorm_sessions
            WHERE brainstorm_sessions.id = design_branches.brainstorm_session_id
            AND brainstorm_sessions.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create design branches in own sessions"
    ON design_branches
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM brainstorm_sessions
            WHERE brainstorm_sessions.id = design_branches.brainstorm_session_id
            AND brainstorm_sessions.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update own design branches"
    ON design_branches
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM brainstorm_sessions
            WHERE brainstorm_sessions.id = design_branches.brainstorm_session_id
            AND brainstorm_sessions.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM brainstorm_sessions
            WHERE brainstorm_sessions.id = design_branches.brainstorm_session_id
            AND brainstorm_sessions.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete own design branches"
    ON design_branches
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM brainstorm_sessions
            WHERE brainstorm_sessions.id = design_branches.brainstorm_session_id
            AND brainstorm_sessions.user_id = auth.uid()
        )
    );

-- ============================================================================
-- Triggers
-- ============================================================================

-- Update brainstorm_sessions.updated_at on any change
CREATE OR REPLACE FUNCTION update_brainstorm_session_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_brainstorm_session_timestamp_trigger
    BEFORE UPDATE ON brainstorm_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_brainstorm_session_timestamp();

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Function to get all branches for a session with their messages
CREATE OR REPLACE FUNCTION get_session_branches(session_id UUID)
RETURNS TABLE (
    branch_id UUID,
    message_id UUID,
    branch_index INTEGER,
    parent_branch_id UUID,
    viewport_position INTEGER,
    metrics JSONB,
    message_content JSONB,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        db.id as branch_id,
        db.message_id,
        db.branch_index,
        db.parent_branch_id,
        db.viewport_position,
        db.metrics,
        m.content as message_content,
        db.created_at
    FROM design_branches db
    JOIN messages m ON m.id = db.message_id
    WHERE db.brainstorm_session_id = session_id
    ORDER BY db.created_at ASC, db.branch_index ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Comments for Documentation
-- ============================================================================

COMMENT ON TABLE brainstorm_sessions IS
'Stores brainstorming sessions where users can generate and compare multiple CAD design variations simultaneously';

COMMENT ON TABLE design_branches IS
'Tracks individual design variations within a brainstorm session, including their ancestry and metrics';

COMMENT ON COLUMN brainstorm_sessions.viewport_layout IS
'JSON configuration for viewport grid layout (e.g., 2x2, 1x3, 1x4)';

COMMENT ON COLUMN brainstorm_sessions.active_branches IS
'Array of branch IDs currently displayed in the viewports';

COMMENT ON COLUMN design_branches.branch_index IS
'Index of this variation when generated (0, 1, 2 for triple generation)';

COMMENT ON COLUMN design_branches.parent_branch_id IS
'References the parent design this variation evolved from, null for initial generations';

COMMENT ON COLUMN design_branches.metrics IS
'JSON object containing calculated design metrics (volume, print time, material, etc.)';
