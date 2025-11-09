-- ============================================================================
-- Voice Persistence Database Schema
-- Adds conversation history and session management for OpenAI Realtime API
-- ============================================================================

-- Voice Sessions Table
-- Tracks voice brainstorming sessions with OpenAI Realtime API
CREATE TABLE IF NOT EXISTS voice_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    brainstorm_session_id UUID REFERENCES brainstorm_sessions(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

    -- OpenAI Session Info
    openai_session_id TEXT, -- OpenAI's session identifier (if available)
    model_used TEXT DEFAULT 'gpt-4o-realtime-preview-2024-10-01',
    voice_used TEXT DEFAULT 'alloy', -- alloy, echo, shimmer

    -- Session Duration
    started_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    total_duration_seconds INTEGER,

    -- Audio Quality Metrics (collected during session)
    audio_quality_metrics JSONB DEFAULT '{}'::jsonb,
    -- Example metrics structure:
    -- {
    --   "maxQueueSize": 15,
    --   "avgQueueSize": 5.2,
    --   "chunksReceived": 120,
    --   "chunksPlayed": 118,
    --   "audioDropouts": 2,
    --   "avgLatencyMs": 250,
    --   "networkIssues": 0
    -- }

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Voice Transcripts Table
-- Stores transcriptions of user speech and AI responses
CREATE TABLE IF NOT EXISTS voice_transcripts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    voice_session_id UUID REFERENCES voice_sessions(id) ON DELETE CASCADE NOT NULL,
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,

    -- Transcript Content
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    transcript TEXT NOT NULL,

    -- Audio Metadata
    audio_duration_ms INTEGER, -- Duration of audio in milliseconds
    is_partial BOOLEAN DEFAULT false, -- True for delta updates, false for final

    -- Timing
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Function Calls Table
-- Tracks CAD generation function calls made during voice sessions
CREATE TABLE IF NOT EXISTS voice_function_calls (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    voice_session_id UUID REFERENCES voice_sessions(id) ON DELETE CASCADE NOT NULL,
    voice_transcript_id UUID REFERENCES voice_transcripts(id) ON DELETE CASCADE,

    -- Function Information
    function_name TEXT NOT NULL, -- generate_cad_variations, refine_variation, compare_designs
    arguments JSONB NOT NULL,
    result JSONB, -- Function execution result

    -- Execution Status
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'executing', 'completed', 'failed')),
    error_message TEXT,
    execution_time_ms INTEGER,

    -- Timing
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- ============================================================================
-- Indexes for Performance
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_voice_sessions_user_id
    ON voice_sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_voice_sessions_conversation_id
    ON voice_sessions(conversation_id);

CREATE INDEX IF NOT EXISTS idx_voice_sessions_brainstorm_session_id
    ON voice_sessions(brainstorm_session_id);

CREATE INDEX IF NOT EXISTS idx_voice_sessions_started_at
    ON voice_sessions(started_at DESC);

CREATE INDEX IF NOT EXISTS idx_voice_transcripts_session_id
    ON voice_transcripts(voice_session_id);

CREATE INDEX IF NOT EXISTS idx_voice_transcripts_conversation_id
    ON voice_transcripts(conversation_id);

CREATE INDEX IF NOT EXISTS idx_voice_transcripts_timestamp
    ON voice_transcripts(timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_voice_function_calls_session_id
    ON voice_function_calls(voice_session_id);

CREATE INDEX IF NOT EXISTS idx_voice_function_calls_status
    ON voice_function_calls(status);

-- ============================================================================
-- Row Level Security (RLS) Policies
-- ============================================================================

-- Enable RLS
ALTER TABLE voice_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_function_calls ENABLE ROW LEVEL SECURITY;

-- Voice Sessions Policies
CREATE POLICY "Users can view own voice sessions"
    ON voice_sessions
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create own voice sessions"
    ON voice_sessions
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own voice sessions"
    ON voice_sessions
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own voice sessions"
    ON voice_sessions
    FOR DELETE
    USING (auth.uid() = user_id);

-- Voice Transcripts Policies
CREATE POLICY "Users can view own voice transcripts"
    ON voice_transcripts
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM voice_sessions
            WHERE voice_sessions.id = voice_transcripts.voice_session_id
            AND voice_sessions.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create voice transcripts in own sessions"
    ON voice_transcripts
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM voice_sessions
            WHERE voice_sessions.id = voice_transcripts.voice_session_id
            AND voice_sessions.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update own voice transcripts"
    ON voice_transcripts
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM voice_sessions
            WHERE voice_sessions.id = voice_transcripts.voice_session_id
            AND voice_sessions.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM voice_sessions
            WHERE voice_sessions.id = voice_transcripts.voice_session_id
            AND voice_sessions.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete own voice transcripts"
    ON voice_transcripts
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM voice_sessions
            WHERE voice_sessions.id = voice_transcripts.voice_session_id
            AND voice_sessions.user_id = auth.uid()
        )
    );

-- Voice Function Calls Policies
CREATE POLICY "Users can view own voice function calls"
    ON voice_function_calls
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM voice_sessions
            WHERE voice_sessions.id = voice_function_calls.voice_session_id
            AND voice_sessions.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create voice function calls in own sessions"
    ON voice_function_calls
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM voice_sessions
            WHERE voice_sessions.id = voice_function_calls.voice_session_id
            AND voice_sessions.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update own voice function calls"
    ON voice_function_calls
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM voice_sessions
            WHERE voice_sessions.id = voice_function_calls.voice_session_id
            AND voice_sessions.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM voice_sessions
            WHERE voice_sessions.id = voice_function_calls.voice_session_id
            AND voice_sessions.user_id = auth.uid()
        )
    );

-- ============================================================================
-- Triggers
-- ============================================================================

-- Update voice_sessions.updated_at on any change
CREATE OR REPLACE FUNCTION update_voice_session_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_voice_session_timestamp_trigger
    BEFORE UPDATE ON voice_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_voice_session_timestamp();

-- Auto-calculate session duration when ended
CREATE OR REPLACE FUNCTION calculate_voice_session_duration()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.ended_at IS NOT NULL AND OLD.ended_at IS NULL THEN
        NEW.total_duration_seconds = EXTRACT(EPOCH FROM (NEW.ended_at - NEW.started_at))::INTEGER;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calculate_voice_session_duration_trigger
    BEFORE UPDATE ON voice_sessions
    FOR EACH ROW
    WHEN (NEW.ended_at IS NOT NULL AND OLD.ended_at IS NULL)
    EXECUTE FUNCTION calculate_voice_session_duration();

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Get full transcript for a voice session
CREATE OR REPLACE FUNCTION get_voice_session_transcript(session_id UUID)
RETURNS TABLE (
    transcript_id UUID,
    role TEXT,
    transcript TEXT,
    audio_duration_ms INTEGER,
    transcript_timestamp TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        vt.id as transcript_id,
        vt.role,
        vt.transcript,
        vt.audio_duration_ms,
        vt.timestamp as transcript_timestamp
    FROM voice_transcripts vt
    WHERE vt.voice_session_id = session_id
    AND vt.is_partial = false  -- Only return final transcripts
    ORDER BY vt.timestamp ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get transcript for a conversation (across all voice sessions)
CREATE OR REPLACE FUNCTION get_conversation_voice_history(conv_id UUID)
RETURNS TABLE (
    session_id UUID,
    transcript_id UUID,
    role TEXT,
    transcript TEXT,
    transcript_timestamp TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        vt.voice_session_id as session_id,
        vt.id as transcript_id,
        vt.role,
        vt.transcript,
        vt.timestamp as transcript_timestamp
    FROM voice_transcripts vt
    WHERE vt.conversation_id = conv_id
    AND vt.is_partial = false
    ORDER BY vt.timestamp ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get recent voice sessions for user
CREATE OR REPLACE FUNCTION get_recent_voice_sessions(user_uuid UUID, limit_count INTEGER DEFAULT 10)
RETURNS TABLE (
    session_id UUID,
    conversation_id UUID,
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    duration_seconds INTEGER,
    transcript_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        vs.id as session_id,
        vs.conversation_id,
        vs.started_at,
        vs.ended_at,
        vs.total_duration_seconds as duration_seconds,
        COUNT(vt.id) as transcript_count
    FROM voice_sessions vs
    LEFT JOIN voice_transcripts vt ON vt.voice_session_id = vs.id AND vt.is_partial = false
    WHERE vs.user_id = user_uuid
    GROUP BY vs.id, vs.conversation_id, vs.started_at, vs.ended_at, vs.total_duration_seconds
    ORDER BY vs.started_at DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Comments for Documentation
-- ============================================================================

COMMENT ON TABLE voice_sessions IS
'Stores OpenAI Realtime API voice sessions with audio quality metrics and session metadata';

COMMENT ON TABLE voice_transcripts IS
'Stores transcriptions of user speech and AI responses from voice sessions';

COMMENT ON TABLE voice_function_calls IS
'Tracks CAD generation function calls made during voice interactions';

COMMENT ON COLUMN voice_sessions.openai_session_id IS
'OpenAI Realtime API session identifier (if provided by API)';

COMMENT ON COLUMN voice_sessions.audio_quality_metrics IS
'JSON object containing audio quality metrics (queue size, latency, dropouts, etc.)';

COMMENT ON COLUMN voice_transcripts.is_partial IS
'True for delta updates during streaming, false for final completed transcripts';

COMMENT ON COLUMN voice_function_calls.arguments IS
'JSON object containing function arguments (e.g., {description: "...", num_variations: 3})';
