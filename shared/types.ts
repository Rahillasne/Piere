import { Database } from './database.ts';
export type Model = 'pierre' | 'metroboomin';

export type Message = Omit<
  Database['public']['Tables']['messages']['Row'],
  'content' | 'role'
> & {
  role: 'user' | 'assistant';
  content: Content;
};

export type CoreMessage = Pick<Message, 'id' | 'role' | 'content'>;

export type ToolCall = {
  name: string;
  status: 'pending' | 'error';
  id?: string;
  result?: { id: string };
};

export type Content = {
  text?: string;
  model?: Model;
  // When the user sends an error, its related to the fix with AI function
  // When the assistant sends an error, its related to any error that occurred during generation
  error?: string;
  artifact?: ParametricArtifact;
  index?: number;
  images?: string[];
  stl_files?: string[];
  // For streaming support - shows in-progress tool calls
  toolCalls?: ToolCall[];
};

export type ParametricArtifact = {
  title: string;
  version: string;
  code: string;
  parameters: Parameter[];
};

export type ParameterOption = { value: string | number; label: string };

export type ParameterRange = { min?: number; max?: number; step?: number };

export type ParameterType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'string[]'
  | 'number[]'
  | 'boolean[]';

export type Parameter = {
  name: string;
  displayName: string;
  value: string | boolean | number | string[] | number[] | boolean[];
  defaultValue: string | boolean | number | string[] | number[] | boolean[];
  // Type should always exist, but old messages don't have it.
  type?: ParameterType;
  description?: string;
  group?: string;
  range?: ParameterRange;
  options?: ParameterOption[];
  maxLength?: number;
};

export type Conversation = Database['public']['Tables']['conversations']['Row'];

// ============================================================================
// Quality Scoring & Analytics Types
// ============================================================================

export type QualityMetrics = {
  id?: string;
  message_id: string;
  conversation_id: string;
  user_id: string;

  // Overall quality score (0-100)
  total_score?: number;

  // Compilation Quality (0-25)
  compilation_success: boolean;
  compilation_time_ms?: number;
  compilation_warnings?: number;
  compilation_score?: number;

  // Geometric Quality (0-25)
  render_success: boolean;
  polygon_count?: number;
  has_degenerate_geometry?: boolean;
  geometric_score?: number;

  // Parameter Quality (0-25)
  parameters_extracted?: number;
  parameters_with_valid_ranges?: number;
  parameters_tested?: boolean;
  parameter_score?: number;

  // User Satisfaction (0-25)
  refinement_requested?: boolean;
  model_exported?: boolean;
  user_rating?: number; // 1-5 stars
  satisfaction_score?: number;

  // Additional metrics
  code_length?: number;
  model_version?: Model;
  generation_time_ms?: number;
  tokens_used?: number;

  // Timestamps
  created_at?: string;
  updated_at?: string;
};

export type FeedbackType = 'star_rating' | 'thumbs_up' | 'thumbs_down' | 'comment' | 'export';
export type ExportType = 'stl' | 'scad' | 'png' | 'svg';

export type UserFeedback = {
  id?: string;
  message_id: string;
  conversation_id: string;
  user_id: string;

  feedback_type: FeedbackType;
  rating?: number; // 1-5 stars
  comment?: string;
  export_type?: ExportType;

  created_at?: string;
};

export type ErrorType =
  | 'compilation'
  | 'generation'
  | 'timeout'
  | 'api'
  | 'parameter_extraction'
  | 'rendering'
  | 'other';

export type ErrorSeverity = 'warning' | 'error' | 'critical';

export type ErrorLog = {
  id?: string;
  message_id?: string;
  conversation_id?: string;
  user_id?: string;

  error_type: ErrorType;
  severity: ErrorSeverity;
  error_message: string;
  error_stack?: string;
  openscad_stderr?: string[];
  openscad_stdout?: string[];

  user_prompt?: string;
  generated_code?: string;
  model_version?: Model;

  created_at?: string;
};

export type PromptVersion = {
  id?: string;
  version_name: string;
  version_number: number;

  outer_agent_prompt: string;
  strict_code_prompt: string;

  is_active: boolean;
  traffic_percentage?: number;

  total_uses?: number;
  average_quality_score?: number;
  success_rate?: number;

  changes_description?: string;
  based_on_version_id?: string;

  created_at?: string;
  activated_at?: string;
  deactivated_at?: string;
};

export type PatternType =
  | 'keyword'
  | 'technique'
  | 'parameter_range'
  | 'code_structure'
  | 'failure_mode';

export type SuccessPattern = {
  id?: string;
  pattern_name: string;
  pattern_type: PatternType;

  description: string;
  keywords?: string[];
  techniques_used?: string[];
  example_code?: string;

  success_rate?: number;
  average_quality_score?: number;
  total_occurrences?: number;

  parameter_name?: string;
  parameter_min?: number;
  parameter_max?: number;
  parameter_optimal?: number;

  when_to_use?: string[];
  avoid_when?: string[];

  confidence_score?: number;
  last_validated_at?: string;

  created_at?: string;
  updated_at?: string;
};

export type PeriodType = 'hourly' | 'daily' | 'weekly' | 'monthly';

export type GenerationAnalytics = {
  id?: string;
  period_type: PeriodType;
  period_start: string;
  period_end: string;

  total_generations?: number;
  successful_generations?: number;
  failed_generations?: number;

  average_quality_score?: number;
  average_compilation_time_ms?: number;
  average_generation_time_ms?: number;

  total_exports?: number;
  total_ratings?: number;
  average_user_rating?: number;

  pierre_usage?: number;
  metroboomin_usage?: number;
  pierre_avg_score?: number;
  metroboomin_avg_score?: number;

  compilation_error_rate?: number;
  timeout_rate?: number;

  created_at?: string;
  updated_at?: string;
};

// Quality score calculation result
export type QualityScoreResult = {
  total_score: number;
  compilation_score: number;
  geometric_score: number;
  parameter_score: number;
  satisfaction_score: number;
  breakdown: {
    compilation: {
      success: boolean;
      time_ms?: number;
      warnings: number;
      points: number;
    };
    geometric: {
      render_success: boolean;
      polygon_count?: number;
      has_issues: boolean;
      points: number;
    };
    parameters: {
      extracted: number;
      valid_ranges: number;
      tested: boolean;
      points: number;
    };
    satisfaction: {
      refinements: number;
      exported: boolean;
      rating?: number;
      points: number;
    };
  };
};
