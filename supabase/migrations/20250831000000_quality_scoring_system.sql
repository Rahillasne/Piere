-- Quality Scoring and Continuous Improvement System Migration
-- Created: 2025-02-06
-- Phase 1: Foundation for quality metrics, user feedback, and analytics

-- ============================================================================
-- TABLE: quality_metrics
-- Tracks automated quality scores for every CAD generation
-- ============================================================================
CREATE TABLE IF NOT EXISTS "public"."quality_metrics" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "message_id" uuid NOT NULL,
  "conversation_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,

  -- Overall quality score (0-100)
  "total_score" integer CHECK (total_score >= 0 AND total_score <= 100),

  -- Compilation Quality (0-25)
  "compilation_success" boolean DEFAULT false,
  "compilation_time_ms" integer,
  "compilation_warnings" integer DEFAULT 0,
  "compilation_score" integer CHECK (compilation_score >= 0 AND compilation_score <= 25),

  -- Geometric Quality (0-25)
  "render_success" boolean DEFAULT false,
  "polygon_count" integer,
  "has_degenerate_geometry" boolean DEFAULT false,
  "geometric_score" integer CHECK (geometric_score >= 0 AND geometric_score <= 25),

  -- Parameter Quality (0-25)
  "parameters_extracted" integer DEFAULT 0,
  "parameters_with_valid_ranges" integer DEFAULT 0,
  "parameters_tested" boolean DEFAULT false,
  "parameter_score" integer CHECK (parameter_score >= 0 AND parameter_score <= 25),

  -- User Satisfaction (0-25)
  "refinement_requested" boolean DEFAULT false,
  "model_exported" boolean DEFAULT false,
  "user_rating" integer CHECK (user_rating >= 1 AND user_rating <= 5),
  "satisfaction_score" integer CHECK (satisfaction_score >= 0 AND satisfaction_score <= 25),

  -- Additional metrics
  "code_length" integer,
  "model_version" text, -- 'pierre' | 'metroboomin'
  "generation_time_ms" integer,
  "tokens_used" integer,

  -- Timestamps
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,

  -- Foreign keys
  CONSTRAINT "quality_metrics_message_id_fkey" FOREIGN KEY (message_id)
    REFERENCES messages(id) ON DELETE CASCADE,
  CONSTRAINT "quality_metrics_conversation_id_fkey" FOREIGN KEY (conversation_id)
    REFERENCES conversations(id) ON DELETE CASCADE,
  CONSTRAINT "quality_metrics_user_id_fkey" FOREIGN KEY (user_id)
    REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Indices for quality_metrics
CREATE INDEX IF NOT EXISTS quality_metrics_message_id_idx ON public.quality_metrics (message_id);
CREATE INDEX IF NOT EXISTS quality_metrics_conversation_id_idx ON public.quality_metrics (conversation_id);
CREATE INDEX IF NOT EXISTS quality_metrics_user_id_idx ON public.quality_metrics (user_id);
CREATE INDEX IF NOT EXISTS quality_metrics_total_score_idx ON public.quality_metrics (total_score DESC);
CREATE INDEX IF NOT EXISTS quality_metrics_created_at_idx ON public.quality_metrics (created_at DESC);
CREATE INDEX IF NOT EXISTS quality_metrics_model_version_idx ON public.quality_metrics (model_version);

-- RLS policies for quality_metrics
ALTER TABLE "public"."quality_metrics" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own quality metrics"
  ON "public"."quality_metrics"
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all quality metrics"
  ON "public"."quality_metrics"
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can insert their own quality metrics"
  ON "public"."quality_metrics"
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);


-- ============================================================================
-- TABLE: user_feedback
-- Stores user ratings, comments, and feedback
-- ============================================================================
CREATE TABLE IF NOT EXISTS "public"."user_feedback" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "message_id" uuid NOT NULL,
  "conversation_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,

  -- Feedback types
  "feedback_type" text NOT NULL CHECK (
    feedback_type IN ('star_rating', 'thumbs_up', 'thumbs_down', 'comment', 'export')
  ),

  -- Feedback content
  "rating" integer CHECK (rating >= 1 AND rating <= 5),
  "comment" text,
  "export_type" text CHECK (export_type IN ('stl', 'scad', 'png', 'svg')),

  -- Metadata
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,

  -- Foreign keys
  CONSTRAINT "user_feedback_message_id_fkey" FOREIGN KEY (message_id)
    REFERENCES messages(id) ON DELETE CASCADE,
  CONSTRAINT "user_feedback_conversation_id_fkey" FOREIGN KEY (conversation_id)
    REFERENCES conversations(id) ON DELETE CASCADE,
  CONSTRAINT "user_feedback_user_id_fkey" FOREIGN KEY (user_id)
    REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Indices for user_feedback
CREATE INDEX IF NOT EXISTS user_feedback_message_id_idx ON public.user_feedback (message_id);
CREATE INDEX IF NOT EXISTS user_feedback_conversation_id_idx ON public.user_feedback (conversation_id);
CREATE INDEX IF NOT EXISTS user_feedback_user_id_idx ON public.user_feedback (user_id);
CREATE INDEX IF NOT EXISTS user_feedback_feedback_type_idx ON public.user_feedback (feedback_type);
CREATE INDEX IF NOT EXISTS user_feedback_created_at_idx ON public.user_feedback (created_at DESC);

-- RLS policies for user_feedback
ALTER TABLE "public"."user_feedback" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own feedback"
  ON "public"."user_feedback"
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role can view all feedback"
  ON "public"."user_feedback"
  FOR SELECT
  TO service_role
  USING (true);


-- ============================================================================
-- TABLE: error_logs
-- Structured error tracking for debugging and pattern analysis
-- ============================================================================
CREATE TABLE IF NOT EXISTS "public"."error_logs" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "message_id" uuid,
  "conversation_id" uuid,
  "user_id" uuid,

  -- Error classification
  "error_type" text NOT NULL CHECK (
    error_type IN ('compilation', 'generation', 'timeout', 'api', 'parameter_extraction', 'rendering', 'other')
  ),
  "severity" text NOT NULL DEFAULT 'error' CHECK (
    severity IN ('warning', 'error', 'critical')
  ),

  -- Error details
  "error_message" text NOT NULL,
  "error_stack" text,
  "openscad_stderr" text[],
  "openscad_stdout" text[],

  -- Context
  "user_prompt" text,
  "generated_code" text,
  "model_version" text,

  -- Metadata
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,

  -- Foreign keys (nullable because errors might occur before message creation)
  CONSTRAINT "error_logs_message_id_fkey" FOREIGN KEY (message_id)
    REFERENCES messages(id) ON DELETE SET NULL,
  CONSTRAINT "error_logs_conversation_id_fkey" FOREIGN KEY (conversation_id)
    REFERENCES conversations(id) ON DELETE SET NULL,
  CONSTRAINT "error_logs_user_id_fkey" FOREIGN KEY (user_id)
    REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Indices for error_logs
CREATE INDEX IF NOT EXISTS error_logs_message_id_idx ON public.error_logs (message_id);
CREATE INDEX IF NOT EXISTS error_logs_conversation_id_idx ON public.error_logs (conversation_id);
CREATE INDEX IF NOT EXISTS error_logs_user_id_idx ON public.error_logs (user_id);
CREATE INDEX IF NOT EXISTS error_logs_error_type_idx ON public.error_logs (error_type);
CREATE INDEX IF NOT EXISTS error_logs_severity_idx ON public.error_logs (severity);
CREATE INDEX IF NOT EXISTS error_logs_created_at_idx ON public.error_logs (created_at DESC);

-- RLS policies for error_logs
ALTER TABLE "public"."error_logs" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own error logs"
  ON "public"."error_logs"
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all error logs"
  ON "public"."error_logs"
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);


-- ============================================================================
-- TABLE: prompt_versions
-- Tracks different system prompt versions for A/B testing
-- ============================================================================
CREATE TABLE IF NOT EXISTS "public"."prompt_versions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "version_name" text NOT NULL UNIQUE,
  "version_number" integer NOT NULL,

  -- Prompt content
  "outer_agent_prompt" text NOT NULL,
  "strict_code_prompt" text NOT NULL,

  -- A/B testing
  "is_active" boolean DEFAULT false,
  "traffic_percentage" integer DEFAULT 0 CHECK (traffic_percentage >= 0 AND traffic_percentage <= 100),

  -- Performance metrics (updated via analytics)
  "total_uses" integer DEFAULT 0,
  "average_quality_score" numeric(5,2),
  "success_rate" numeric(5,2),

  -- Changelog
  "changes_description" text,
  "based_on_version_id" uuid,

  -- Timestamps
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "activated_at" timestamp with time zone,
  "deactivated_at" timestamp with time zone,

  -- Foreign keys
  CONSTRAINT "prompt_versions_based_on_fkey" FOREIGN KEY (based_on_version_id)
    REFERENCES prompt_versions(id) ON DELETE SET NULL
);

-- Indices for prompt_versions
CREATE INDEX IF NOT EXISTS prompt_versions_is_active_idx ON public.prompt_versions (is_active);
CREATE INDEX IF NOT EXISTS prompt_versions_version_number_idx ON public.prompt_versions (version_number DESC);
CREATE INDEX IF NOT EXISTS prompt_versions_created_at_idx ON public.prompt_versions (created_at DESC);

-- RLS policies for prompt_versions
ALTER TABLE "public"."prompt_versions" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active prompts"
  ON "public"."prompt_versions"
  FOR SELECT
  USING (is_active = true);

CREATE POLICY "Service role can manage all prompts"
  ON "public"."prompt_versions"
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);


-- ============================================================================
-- TABLE: success_patterns
-- Knowledge base of successful patterns learned from high-quality generations
-- ============================================================================
CREATE TABLE IF NOT EXISTS "public"."success_patterns" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,

  -- Pattern identification
  "pattern_name" text NOT NULL UNIQUE,
  "pattern_type" text NOT NULL CHECK (
    pattern_type IN ('keyword', 'technique', 'parameter_range', 'code_structure', 'failure_mode')
  ),

  -- Pattern details
  "description" text NOT NULL,
  "keywords" text[],
  "techniques_used" text[],
  "example_code" text,

  -- Performance metrics
  "success_rate" numeric(5,2),
  "average_quality_score" numeric(5,2),
  "total_occurrences" integer DEFAULT 0,

  -- Parameter ranges (for parameter_range type)
  "parameter_name" text,
  "parameter_min" numeric,
  "parameter_max" numeric,
  "parameter_optimal" numeric,

  -- Usage guidance
  "when_to_use" text[],
  "avoid_when" text[],

  -- Learning metadata
  "confidence_score" numeric(5,2), -- How confident we are in this pattern
  "last_validated_at" timestamp with time zone,

  -- Timestamps
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Indices for success_patterns
CREATE INDEX IF NOT EXISTS success_patterns_pattern_type_idx ON public.success_patterns (pattern_type);
CREATE INDEX IF NOT EXISTS success_patterns_success_rate_idx ON public.success_patterns (success_rate DESC);
CREATE INDEX IF NOT EXISTS success_patterns_confidence_score_idx ON public.success_patterns (confidence_score DESC);
CREATE INDEX IF NOT EXISTS success_patterns_keywords_idx ON public.success_patterns USING gin(keywords);
CREATE INDEX IF NOT EXISTS success_patterns_techniques_idx ON public.success_patterns USING gin(techniques_used);

-- RLS policies for success_patterns
ALTER TABLE "public"."success_patterns" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view success patterns"
  ON "public"."success_patterns"
  FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage success patterns"
  ON "public"."success_patterns"
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);


-- ============================================================================
-- TABLE: generation_analytics
-- Aggregated analytics for dashboard and reporting
-- ============================================================================
CREATE TABLE IF NOT EXISTS "public"."generation_analytics" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,

  -- Time period
  "period_type" text NOT NULL CHECK (
    period_type IN ('hourly', 'daily', 'weekly', 'monthly')
  ),
  "period_start" timestamp with time zone NOT NULL,
  "period_end" timestamp with time zone NOT NULL,

  -- Aggregated metrics
  "total_generations" integer DEFAULT 0,
  "successful_generations" integer DEFAULT 0,
  "failed_generations" integer DEFAULT 0,

  -- Quality metrics
  "average_quality_score" numeric(5,2),
  "average_compilation_time_ms" numeric(10,2),
  "average_generation_time_ms" numeric(10,2),

  -- User engagement
  "total_exports" integer DEFAULT 0,
  "total_ratings" integer DEFAULT 0,
  "average_user_rating" numeric(3,2),

  -- Model comparison
  "pierre_usage" integer DEFAULT 0,
  "metroboomin_usage" integer DEFAULT 0,
  "pierre_avg_score" numeric(5,2),
  "metroboomin_avg_score" numeric(5,2),

  -- Error rates
  "compilation_error_rate" numeric(5,2),
  "timeout_rate" numeric(5,2),

  -- Timestamps
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,

  -- Unique constraint: one row per period
  UNIQUE (period_type, period_start)
);

-- Indices for generation_analytics
CREATE INDEX IF NOT EXISTS generation_analytics_period_type_idx ON public.generation_analytics (period_type);
CREATE INDEX IF NOT EXISTS generation_analytics_period_start_idx ON public.generation_analytics (period_start DESC);
CREATE INDEX IF NOT EXISTS generation_analytics_created_at_idx ON public.generation_analytics (created_at DESC);

-- RLS policies for generation_analytics
ALTER TABLE "public"."generation_analytics" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage analytics"
  ON "public"."generation_analytics"
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Admin users can view analytics (you can customize this based on your auth setup)
CREATE POLICY "Admins can view analytics"
  ON "public"."generation_analytics"
  FOR SELECT
  USING (true); -- TODO: Add admin check when role system is implemented


-- ============================================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at columns
CREATE TRIGGER update_quality_metrics_updated_at
  BEFORE UPDATE ON quality_metrics
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_success_patterns_updated_at
  BEFORE UPDATE ON success_patterns
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_generation_analytics_updated_at
  BEFORE UPDATE ON generation_analytics
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- GRANTS
-- ============================================================================

-- Grant permissions for authenticated users
GRANT SELECT, INSERT ON quality_metrics TO authenticated;
GRANT SELECT, INSERT, UPDATE ON user_feedback TO authenticated;
GRANT SELECT ON error_logs TO authenticated;
GRANT SELECT ON prompt_versions TO authenticated;
GRANT SELECT ON success_patterns TO authenticated;
GRANT SELECT ON generation_analytics TO authenticated;

-- Grant full permissions to service_role
GRANT ALL ON quality_metrics TO service_role;
GRANT ALL ON user_feedback TO service_role;
GRANT ALL ON error_logs TO service_role;
GRANT ALL ON prompt_versions TO service_role;
GRANT ALL ON success_patterns TO service_role;
GRANT ALL ON generation_analytics TO service_role;


-- ============================================================================
-- INITIAL DATA
-- ============================================================================

-- Insert default prompt version (current production prompt)
INSERT INTO prompt_versions (
  version_name,
  version_number,
  outer_agent_prompt,
  strict_code_prompt,
  is_active,
  traffic_percentage,
  changes_description
) VALUES (
  'v1.0-production',
  1,
  'Default outer agent prompt', -- TODO: Copy from actual prompt
  'Default strict code prompt', -- TODO: Copy from actual prompt
  true,
  100,
  'Initial production prompt version'
) ON CONFLICT (version_name) DO NOTHING;


-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE quality_metrics IS 'Automated quality scoring for every CAD generation';
COMMENT ON TABLE user_feedback IS 'User ratings, comments, and feedback';
COMMENT ON TABLE error_logs IS 'Structured error tracking for debugging and pattern analysis';
COMMENT ON TABLE prompt_versions IS 'System prompt versions for A/B testing and evolution';
COMMENT ON TABLE success_patterns IS 'Knowledge base of successful patterns from high-quality generations';
COMMENT ON TABLE generation_analytics IS 'Aggregated analytics for dashboard and reporting';

COMMENT ON COLUMN quality_metrics.total_score IS 'Overall quality score from 0-100';
COMMENT ON COLUMN quality_metrics.compilation_score IS 'Compilation quality subscore (0-25)';
COMMENT ON COLUMN quality_metrics.geometric_score IS 'Geometric quality subscore (0-25)';
COMMENT ON COLUMN quality_metrics.parameter_score IS 'Parameter extraction quality subscore (0-25)';
COMMENT ON COLUMN quality_metrics.satisfaction_score IS 'User satisfaction subscore (0-25)';
