/**
 * Quality Scoring Service
 * Handles quality metrics, user feedback, error logging, and analytics
 */

import { supabase } from '@/lib/supabase';
import {
  QualityMetrics,
  UserFeedback,
  ErrorLog,
  SuccessPattern,
  GenerationAnalytics,
  QualityScoreResult,
} from '@shared/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/core/AuthContext';

// ============================================================================
// Quality Metrics Hooks
// ============================================================================

/**
 * Record quality metrics for a message
 * Auto-calculates quality score from individual metrics
 */
export function useRecordQualityMetrics() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (metrics: Omit<QualityMetrics, 'id' | 'created_at' | 'updated_at' | 'user_id'>) => {
      if (!user?.id) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('quality_metrics')
        .insert({
          ...metrics,
          user_id: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      // Invalidate quality metrics queries
      queryClient.invalidateQueries({ queryKey: ['quality-metrics'] });
      queryClient.invalidateQueries({ queryKey: ['quality-metrics', data.message_id] });
    },
  });
}

/**
 * Get quality metrics for a specific message
 */
export function useQualityMetrics(messageId: string | undefined) {
  return useQuery<QualityMetrics | null>({
    queryKey: ['quality-metrics', messageId],
    enabled: !!messageId,
    queryFn: async () => {
      if (!messageId) return null;

      const { data, error } = await supabase
        .from('quality_metrics')
        .select('*')
        .eq('message_id', messageId)
        .single();

      if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
      return data || null;
    },
  });
}

/**
 * Get quality metrics for a conversation
 */
export function useConversationQualityMetrics(conversationId: string | undefined) {
  return useQuery<QualityMetrics[]>({
    queryKey: ['quality-metrics', 'conversation', conversationId],
    enabled: !!conversationId,
    queryFn: async () => {
      if (!conversationId) return [];

      const { data, error } = await supabase
        .from('quality_metrics')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });
}

/**
 * Update existing quality metrics (e.g., when user exports or rates)
 */
export function useUpdateQualityMetrics() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<QualityMetrics>;
    }) => {
      const { data, error } = await supabase
        .from('quality_metrics')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['quality-metrics'] });
      queryClient.invalidateQueries({ queryKey: ['quality-metrics', data.message_id] });
    },
  });
}

// ============================================================================
// User Feedback Hooks
// ============================================================================

/**
 * Submit user feedback (rating, thumbs up/down, comment, export)
 */
export function useSubmitFeedback() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (
      feedback: Omit<UserFeedback, 'id' | 'created_at' | 'user_id'>
    ) => {
      if (!user?.id) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('user_feedback')
        .insert({
          ...feedback,
          user_id: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      // Invalidate feedback queries
      queryClient.invalidateQueries({ queryKey: ['user-feedback'] });
      queryClient.invalidateQueries({ queryKey: ['user-feedback', data.message_id] });

      // Also update quality metrics if this is a rating
      if (data.feedback_type === 'star_rating' && data.rating) {
        queryClient.invalidateQueries({ queryKey: ['quality-metrics', data.message_id] });
      }
    },
  });
}

/**
 * Get feedback for a specific message
 */
export function useMessageFeedback(messageId: string | undefined) {
  return useQuery<UserFeedback[]>({
    queryKey: ['user-feedback', messageId],
    enabled: !!messageId,
    queryFn: async () => {
      if (!messageId) return [];

      const { data, error } = await supabase
        .from('user_feedback')
        .select('*')
        .eq('message_id', messageId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });
}

/**
 * Check if user has already rated a message
 */
export function useHasUserRated(messageId: string | undefined) {
  const { user } = useAuth();

  return useQuery<boolean>({
    queryKey: ['user-feedback', 'has-rated', messageId, user?.id],
    enabled: !!messageId && !!user?.id,
    queryFn: async () => {
      if (!messageId || !user?.id) return false;

      const { data, error } = await supabase
        .from('user_feedback')
        .select('id')
        .eq('message_id', messageId)
        .eq('user_id', user.id)
        .eq('feedback_type', 'star_rating')
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;
      return !!data;
    },
  });
}

// ============================================================================
// Error Logging Hooks
// ============================================================================

/**
 * Log an error (compilation, generation, timeout, etc.)
 */
export function useLogError() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (errorLog: Omit<ErrorLog, 'id' | 'created_at'>) => {
      const { data, error } = await supabase
        .from('error_logs')
        .insert({
          ...errorLog,
          user_id: errorLog.user_id || user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['error-logs'] });
    },
  });
}

/**
 * Get error logs for a conversation (admin/debugging)
 */
export function useConversationErrors(conversationId: string | undefined) {
  return useQuery<ErrorLog[]>({
    queryKey: ['error-logs', 'conversation', conversationId],
    enabled: !!conversationId,
    queryFn: async () => {
      if (!conversationId) return [];

      const { data, error } = await supabase
        .from('error_logs')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });
}

// ============================================================================
// Success Patterns Hooks (for knowledge base)
// ============================================================================

/**
 * Get success patterns (for displaying tips or optimizing prompts)
 */
export function useSuccessPatterns(patternType?: string) {
  return useQuery<SuccessPattern[]>({
    queryKey: ['success-patterns', patternType],
    queryFn: async () => {
      let query = supabase
        .from('success_patterns')
        .select('*')
        .order('confidence_score', { ascending: false });

      if (patternType) {
        query = query.eq('pattern_type', patternType);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data || [];
    },
  });
}

/**
 * Get top success patterns by success rate
 */
export function useTopSuccessPatterns(limit: number = 10) {
  return useQuery<SuccessPattern[]>({
    queryKey: ['success-patterns', 'top', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('success_patterns')
        .select('*')
        .order('success_rate', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data || [];
    },
  });
}

// ============================================================================
// Analytics Hooks
// ============================================================================

/**
 * Get analytics for a specific period
 */
export function useGenerationAnalytics(
  periodType: 'hourly' | 'daily' | 'weekly' | 'monthly',
  limit: number = 30
) {
  return useQuery<GenerationAnalytics[]>({
    queryKey: ['generation-analytics', periodType, limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('generation_analytics')
        .select('*')
        .eq('period_type', periodType)
        .order('period_start', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data || [];
    },
  });
}

/**
 * Get latest analytics summary
 */
export function useLatestAnalytics() {
  return useQuery<GenerationAnalytics | null>({
    queryKey: ['generation-analytics', 'latest'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('generation_analytics')
        .select('*')
        .eq('period_type', 'daily')
        .order('period_start', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;
      return data || null;
    },
  });
}

/**
 * Get quality score trends over time
 */
export function useQualityTrends(days: number = 7) {
  const { user } = useAuth();

  return useQuery<Array<{ date: string; avg_score: number }>>({
    queryKey: ['quality-trends', user?.id, days],
    enabled: !!user?.id,
    queryFn: async () => {
      if (!user?.id) return [];

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const { data, error } = await supabase
        .from('quality_metrics')
        .select('created_at, total_score')
        .eq('user_id', user.id)
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Group by date and calculate average
      const grouped = (data || []).reduce((acc, item) => {
        const date = new Date(item.created_at!).toLocaleDateString();
        if (!acc[date]) {
          acc[date] = { total: 0, count: 0 };
        }
        acc[date].total += item.total_score || 0;
        acc[date].count += 1;
        return acc;
      }, {} as Record<string, { total: number; count: number }>);

      return Object.entries(grouped).map(([date, { total, count }]) => ({
        date,
        avg_score: Math.round(total / count),
      }));
    },
  });
}

// ============================================================================
// Combined Hooks (convenience hooks for common operations)
// ============================================================================

/**
 * Complete quality tracking workflow for a message
 * Records metrics + allows for feedback submission
 */
export function useCompleteQualityTracking() {
  const recordMetrics = useRecordQualityMetrics();
  const submitFeedback = useSubmitFeedback();
  const logError = useLogError();

  return {
    recordMetrics: recordMetrics.mutateAsync,
    submitFeedback: submitFeedback.mutateAsync,
    logError: logError.mutateAsync,
    isLoading:
      recordMetrics.isPending || submitFeedback.isPending || logError.isPending,
  };
}

/**
 * Get comprehensive quality data for a message
 */
export function useMessageQualityData(messageId: string | undefined) {
  const metrics = useQualityMetrics(messageId);
  const feedback = useMessageFeedback(messageId);
  const hasRated = useHasUserRated(messageId);

  return {
    metrics: metrics.data,
    feedback: feedback.data || [],
    hasRated: hasRated.data || false,
    isLoading: metrics.isLoading || feedback.isLoading || hasRated.isLoading,
  };
}
