export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          operationName?: string
          query?: string
          variables?: Json
          extensions?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      brainstorm_sessions: {
        Row: {
          active_branches: string[] | null
          conversation_id: string | null
          created_at: string | null
          id: string
          updated_at: string | null
          user_id: string
          viewport_layout: Json | null
        }
        Insert: {
          active_branches?: string[] | null
          conversation_id?: string | null
          created_at?: string | null
          id?: string
          updated_at?: string | null
          user_id: string
          viewport_layout?: Json | null
        }
        Update: {
          active_branches?: string[] | null
          conversation_id?: string | null
          created_at?: string | null
          id?: string
          updated_at?: string | null
          user_id?: string
          viewport_layout?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "brainstorm_sessions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string | null
          current_message_leaf_id: string | null
          id: string
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          current_message_leaf_id?: string | null
          id?: string
          title: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          current_message_leaf_id?: string | null
          id?: string
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      design_branches: {
        Row: {
          brainstorm_session_id: string
          branch_index: number
          created_at: string | null
          design_lineage_id: string | null
          id: string
          is_latest_version: boolean | null
          message_id: string
          metrics: Json | null
          parent_branch_id: string | null
          source_file_id: string | null
          source_type: string | null
          version_number: number | null
          viewport_position: number | null
        }
        Insert: {
          brainstorm_session_id: string
          branch_index: number
          created_at?: string | null
          design_lineage_id?: string | null
          id?: string
          is_latest_version?: boolean | null
          message_id: string
          metrics?: Json | null
          parent_branch_id?: string | null
          source_file_id?: string | null
          source_type?: string | null
          version_number?: number | null
          viewport_position?: number | null
        }
        Update: {
          brainstorm_session_id?: string
          branch_index?: number
          created_at?: string | null
          design_lineage_id?: string | null
          id?: string
          is_latest_version?: boolean | null
          message_id?: string
          metrics?: Json | null
          parent_branch_id?: string | null
          source_file_id?: string | null
          source_type?: string | null
          version_number?: number | null
          viewport_position?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "design_branches_brainstorm_session_id_fkey"
            columns: ["brainstorm_session_id"]
            isOneToOne: false
            referencedRelation: "brainstorm_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_branches_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_branches_parent_branch_id_fkey"
            columns: ["parent_branch_id"]
            isOneToOne: false
            referencedRelation: "design_branches"
            referencedColumns: ["id"]
          },
        ]
      }
      error_logs: {
        Row: {
          conversation_id: string | null
          created_at: string
          error_message: string
          error_stack: string | null
          error_type: string
          generated_code: string | null
          id: string
          message_id: string | null
          model_version: string | null
          openscad_stderr: string[] | null
          openscad_stdout: string[] | null
          severity: string
          user_id: string | null
          user_prompt: string | null
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          error_message: string
          error_stack?: string | null
          error_type: string
          generated_code?: string | null
          id?: string
          message_id?: string | null
          model_version?: string | null
          openscad_stderr?: string[] | null
          openscad_stdout?: string[] | null
          severity?: string
          user_id?: string | null
          user_prompt?: string | null
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          error_message?: string
          error_stack?: string | null
          error_type?: string
          generated_code?: string | null
          id?: string
          message_id?: string | null
          model_version?: string | null
          openscad_stderr?: string[] | null
          openscad_stdout?: string[] | null
          severity?: string
          user_id?: string | null
          user_prompt?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "error_logs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "error_logs_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      generation_analytics: {
        Row: {
          average_compilation_time_ms: number | null
          average_generation_time_ms: number | null
          average_quality_score: number | null
          average_user_rating: number | null
          compilation_error_rate: number | null
          created_at: string
          failed_generations: number | null
          id: string
          metroboomin_avg_score: number | null
          metroboomin_usage: number | null
          period_end: string
          period_start: string
          period_type: string
          pierre_avg_score: number | null
          pierre_usage: number | null
          successful_generations: number | null
          timeout_rate: number | null
          total_exports: number | null
          total_generations: number | null
          total_ratings: number | null
          updated_at: string
        }
        Insert: {
          average_compilation_time_ms?: number | null
          average_generation_time_ms?: number | null
          average_quality_score?: number | null
          average_user_rating?: number | null
          compilation_error_rate?: number | null
          created_at?: string
          failed_generations?: number | null
          id?: string
          metroboomin_avg_score?: number | null
          metroboomin_usage?: number | null
          period_end: string
          period_start: string
          period_type: string
          pierre_avg_score?: number | null
          pierre_usage?: number | null
          successful_generations?: number | null
          timeout_rate?: number | null
          total_exports?: number | null
          total_generations?: number | null
          total_ratings?: number | null
          updated_at?: string
        }
        Update: {
          average_compilation_time_ms?: number | null
          average_generation_time_ms?: number | null
          average_quality_score?: number | null
          average_user_rating?: number | null
          compilation_error_rate?: number | null
          created_at?: string
          failed_generations?: number | null
          id?: string
          metroboomin_avg_score?: number | null
          metroboomin_usage?: number | null
          period_end?: string
          period_start?: string
          period_type?: string
          pierre_avg_score?: number | null
          pierre_usage?: number | null
          successful_generations?: number | null
          timeout_rate?: number | null
          total_exports?: number | null
          total_generations?: number | null
          total_ratings?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: Json
          conversation_id: string
          created_at: string
          id: string
          parent_message_id: string | null
          role: string
        }
        Insert: {
          content: Json
          conversation_id: string
          created_at?: string
          id?: string
          parent_message_id?: string | null
          role: string
        }
        Update: {
          content?: Json
          conversation_id?: string
          created_at?: string
          id?: string
          parent_message_id?: string | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      prompt_versions: {
        Row: {
          activated_at: string | null
          average_quality_score: number | null
          based_on_version_id: string | null
          changes_description: string | null
          created_at: string
          deactivated_at: string | null
          id: string
          is_active: boolean | null
          outer_agent_prompt: string
          strict_code_prompt: string
          success_rate: number | null
          total_uses: number | null
          traffic_percentage: number | null
          version_name: string
          version_number: number
        }
        Insert: {
          activated_at?: string | null
          average_quality_score?: number | null
          based_on_version_id?: string | null
          changes_description?: string | null
          created_at?: string
          deactivated_at?: string | null
          id?: string
          is_active?: boolean | null
          outer_agent_prompt: string
          strict_code_prompt: string
          success_rate?: number | null
          total_uses?: number | null
          traffic_percentage?: number | null
          version_name: string
          version_number: number
        }
        Update: {
          activated_at?: string | null
          average_quality_score?: number | null
          based_on_version_id?: string | null
          changes_description?: string | null
          created_at?: string
          deactivated_at?: string | null
          id?: string
          is_active?: boolean | null
          outer_agent_prompt?: string
          strict_code_prompt?: string
          success_rate?: number | null
          total_uses?: number | null
          traffic_percentage?: number | null
          version_name?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "prompt_versions_based_on_fkey"
            columns: ["based_on_version_id"]
            isOneToOne: false
            referencedRelation: "prompt_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      quality_metrics: {
        Row: {
          code_length: number | null
          compilation_score: number | null
          compilation_success: boolean | null
          compilation_time_ms: number | null
          compilation_warnings: number | null
          conversation_id: string
          created_at: string
          generation_time_ms: number | null
          geometric_score: number | null
          has_degenerate_geometry: boolean | null
          id: string
          message_id: string
          model_exported: boolean | null
          model_version: string | null
          parameter_score: number | null
          parameters_extracted: number | null
          parameters_tested: boolean | null
          parameters_with_valid_ranges: number | null
          polygon_count: number | null
          refinement_requested: boolean | null
          render_success: boolean | null
          satisfaction_score: number | null
          tokens_used: number | null
          total_score: number | null
          updated_at: string
          user_id: string
          user_rating: number | null
        }
        Insert: {
          code_length?: number | null
          compilation_score?: number | null
          compilation_success?: boolean | null
          compilation_time_ms?: number | null
          compilation_warnings?: number | null
          conversation_id: string
          created_at?: string
          generation_time_ms?: number | null
          geometric_score?: number | null
          has_degenerate_geometry?: boolean | null
          id?: string
          message_id: string
          model_exported?: boolean | null
          model_version?: string | null
          parameter_score?: number | null
          parameters_extracted?: number | null
          parameters_tested?: boolean | null
          parameters_with_valid_ranges?: number | null
          polygon_count?: number | null
          refinement_requested?: boolean | null
          render_success?: boolean | null
          satisfaction_score?: number | null
          tokens_used?: number | null
          total_score?: number | null
          updated_at?: string
          user_id: string
          user_rating?: number | null
        }
        Update: {
          code_length?: number | null
          compilation_score?: number | null
          compilation_success?: boolean | null
          compilation_time_ms?: number | null
          compilation_warnings?: number | null
          conversation_id?: string
          created_at?: string
          generation_time_ms?: number | null
          geometric_score?: number | null
          has_degenerate_geometry?: boolean | null
          id?: string
          message_id?: string
          model_exported?: boolean | null
          model_version?: string | null
          parameter_score?: number | null
          parameters_extracted?: number | null
          parameters_tested?: boolean | null
          parameters_with_valid_ranges?: number | null
          polygon_count?: number | null
          refinement_requested?: boolean | null
          render_success?: boolean | null
          satisfaction_score?: number | null
          tokens_used?: number | null
          total_score?: number | null
          updated_at?: string
          user_id?: string
          user_rating?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "quality_metrics_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quality_metrics_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      success_patterns: {
        Row: {
          average_quality_score: number | null
          avoid_when: string[] | null
          confidence_score: number | null
          created_at: string
          description: string
          example_code: string | null
          id: string
          keywords: string[] | null
          last_validated_at: string | null
          parameter_max: number | null
          parameter_min: number | null
          parameter_name: string | null
          parameter_optimal: number | null
          pattern_name: string
          pattern_type: string
          success_rate: number | null
          techniques_used: string[] | null
          total_occurrences: number | null
          updated_at: string
          when_to_use: string[] | null
        }
        Insert: {
          average_quality_score?: number | null
          avoid_when?: string[] | null
          confidence_score?: number | null
          created_at?: string
          description: string
          example_code?: string | null
          id?: string
          keywords?: string[] | null
          last_validated_at?: string | null
          parameter_max?: number | null
          parameter_min?: number | null
          parameter_name?: string | null
          parameter_optimal?: number | null
          pattern_name: string
          pattern_type: string
          success_rate?: number | null
          techniques_used?: string[] | null
          total_occurrences?: number | null
          updated_at?: string
          when_to_use?: string[] | null
        }
        Update: {
          average_quality_score?: number | null
          avoid_when?: string[] | null
          confidence_score?: number | null
          created_at?: string
          description?: string
          example_code?: string | null
          id?: string
          keywords?: string[] | null
          last_validated_at?: string | null
          parameter_max?: number | null
          parameter_min?: number | null
          parameter_name?: string | null
          parameter_optimal?: number | null
          pattern_name?: string
          pattern_type?: string
          success_rate?: number | null
          techniques_used?: string[] | null
          total_occurrences?: number | null
          updated_at?: string
          when_to_use?: string[] | null
        }
        Relationships: []
      }
      user_auth_mapping: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          firebase_uid: string
          id: string
          photo_url: string | null
          supabase_user_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          firebase_uid: string
          id?: string
          photo_url?: string | null
          supabase_user_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          firebase_uid?: string
          id?: string
          photo_url?: string | null
          supabase_user_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_feedback: {
        Row: {
          comment: string | null
          conversation_id: string
          created_at: string
          export_type: string | null
          feedback_type: string
          id: string
          message_id: string
          rating: number | null
          user_id: string
        }
        Insert: {
          comment?: string | null
          conversation_id: string
          created_at?: string
          export_type?: string | null
          feedback_type: string
          id?: string
          message_id: string
          rating?: number | null
          user_id: string
        }
        Update: {
          comment?: string | null
          conversation_id?: string
          created_at?: string
          export_type?: string | null
          feedback_type?: string
          id?: string
          message_id?: string
          rating?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_feedback_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_feedback_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_function_calls: {
        Row: {
          arguments: Json
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          execution_time_ms: number | null
          function_name: string
          id: string
          result: Json | null
          status: string | null
          voice_session_id: string
          voice_transcript_id: string | null
        }
        Insert: {
          arguments: Json
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          execution_time_ms?: number | null
          function_name: string
          id?: string
          result?: Json | null
          status?: string | null
          voice_session_id: string
          voice_transcript_id?: string | null
        }
        Update: {
          arguments?: Json
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          execution_time_ms?: number | null
          function_name?: string
          id?: string
          result?: Json | null
          status?: string | null
          voice_session_id?: string
          voice_transcript_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "voice_function_calls_voice_session_id_fkey"
            columns: ["voice_session_id"]
            isOneToOne: false
            referencedRelation: "voice_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_function_calls_voice_transcript_id_fkey"
            columns: ["voice_transcript_id"]
            isOneToOne: false
            referencedRelation: "voice_transcripts"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_sessions: {
        Row: {
          audio_quality_metrics: Json | null
          brainstorm_session_id: string | null
          conversation_id: string | null
          created_at: string | null
          ended_at: string | null
          id: string
          model_used: string | null
          openai_session_id: string | null
          started_at: string | null
          total_duration_seconds: number | null
          updated_at: string | null
          user_id: string
          voice_used: string | null
        }
        Insert: {
          audio_quality_metrics?: Json | null
          brainstorm_session_id?: string | null
          conversation_id?: string | null
          created_at?: string | null
          ended_at?: string | null
          id?: string
          model_used?: string | null
          openai_session_id?: string | null
          started_at?: string | null
          total_duration_seconds?: number | null
          updated_at?: string | null
          user_id: string
          voice_used?: string | null
        }
        Update: {
          audio_quality_metrics?: Json | null
          brainstorm_session_id?: string | null
          conversation_id?: string | null
          created_at?: string | null
          ended_at?: string | null
          id?: string
          model_used?: string | null
          openai_session_id?: string | null
          started_at?: string | null
          total_duration_seconds?: number | null
          updated_at?: string | null
          user_id?: string
          voice_used?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "voice_sessions_brainstorm_session_id_fkey"
            columns: ["brainstorm_session_id"]
            isOneToOne: false
            referencedRelation: "brainstorm_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_sessions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_transcripts: {
        Row: {
          audio_duration_ms: number | null
          conversation_id: string | null
          created_at: string | null
          id: string
          is_partial: boolean | null
          role: string
          timestamp: string | null
          transcript: string
          voice_session_id: string
        }
        Insert: {
          audio_duration_ms?: number | null
          conversation_id?: string | null
          created_at?: string | null
          id?: string
          is_partial?: boolean | null
          role: string
          timestamp?: string | null
          transcript: string
          voice_session_id: string
        }
        Update: {
          audio_duration_ms?: number | null
          conversation_id?: string | null
          created_at?: string | null
          id?: string
          is_partial?: boolean | null
          role?: string
          timestamp?: string | null
          transcript?: string
          voice_session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_transcripts_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_transcripts_voice_session_id_fkey"
            columns: ["voice_session_id"]
            isOneToOne: false
            referencedRelation: "voice_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_conversation_voice_history: {
        Args: { conv_id: string }
        Returns: {
          transcript_timestamp: string
          session_id: string
          transcript: string
          role: string
          transcript_id: string
        }[]
      }
      get_latest_version: {
        Args: { lineage_uuid: string }
        Returns: {
          id: string
          version_number: number
          parameters: Json
          code: string
        }[]
      }
      get_recent_voice_sessions: {
        Args: { limit_count?: number; user_uuid: string }
        Returns: {
          ended_at: string
          duration_seconds: number
          transcript_count: number
          session_id: string
          conversation_id: string
          started_at: string
        }[]
      }
      get_session_branches: {
        Args: { session_id: string }
        Returns: {
          parent_branch_id: string
          metrics: Json
          message_content: Json
          created_at: string
          branch_id: string
          message_id: string
          branch_index: number
          viewport_position: number
        }[]
      }
      get_version_history: {
        Args: { lineage_uuid: string }
        Returns: {
          parameters: Json
          code: string
          version_number: number
          id: string
          is_latest: boolean
          created_at: string
        }[]
      }
      get_voice_session_transcript: {
        Args: { session_id: string }
        Returns: {
          role: string
          transcript: string
          audio_duration_ms: number
          transcript_timestamp: string
          transcript_id: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

