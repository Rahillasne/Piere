/**
 * Brainstorm Service
 * Manages brainstorming sessions and design branches
 */

import { useAuth } from '@/core/AuthContext';
import { supabase } from '@/lib/supabase';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

// ============================================================================
// Types
// ============================================================================

export interface BrainstormSession {
  id: string;
  conversation_id: string | null;
  user_id: string;
  viewport_layout: ViewportLayout | null;
  active_branches: string[] | null; // Array of branch IDs
  created_at: string | null;
  updated_at: string | null;
}

export interface ViewportLayout {
  columns: number; // 1-2
  rows: number; // 1-2
}

export interface DesignBranch {
  id: string;
  brainstorm_session_id: string;
  message_id: string;
  branch_index: number; // 0, 1, 2 for parallel variations
  parent_branch_id: string | null;
  viewport_position: number; // Which viewport (0-3)
  metrics: DesignMetrics;
  created_at: string;
  source_file_id?: string; // Reference to uploaded file in cad-files storage bucket
  source_type?: 'ai_generated' | 'uploaded' | 'modified'; // Origin of the design
}

export interface DesignMetrics {
  volume?: number; // cubic cm
  surfaceArea?: number; // square cm
  printTime?: number; // minutes
  material?: number; // grams
  polygonCount?: number;
}

export interface BrainstormVariation {
  variation_index: number;
  title: string;
  code: string;
  parameters: any[];
  reasoning?: string;
}

// ============================================================================
// Session Hooks
// ============================================================================

/**
 * Get brainstorm session by ID
 */
export function useBrainstormSession(sessionId: string | undefined) {
  const { user } = useAuth();

  return useQuery<BrainstormSession | null>({
    queryKey: ['brainstorm-session', sessionId],
    enabled: !!sessionId && !!user?.id,
    queryFn: async () => {
      if (!sessionId || !user?.id) return null;

      const { data, error } = await supabase
        .from('brainstorm_sessions')
        .select('*')
        .eq('id', sessionId)
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      if (!data) return null;

      // Cast viewport_layout from Json to ViewportLayout
      return {
        ...data,
        viewport_layout: data.viewport_layout as ViewportLayout | null,
      };
    },
  });
}

/**
 * Get brainstorm session by conversation ID
 */
export function useBrainstormSessionByConversation(conversationId: string | undefined) {
  const { user } = useAuth();

  return useQuery<BrainstormSession | null>({
    queryKey: ['brainstorm-session', 'conversation', conversationId],
    enabled: !!conversationId && !!user?.id,
    queryFn: async () => {
      if (!conversationId || !user?.id) return null;

      const { data, error } = await supabase
        .from('brainstorm_sessions')
        .select('*')
        .eq('conversation_id', conversationId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;
      if (!data) return null;

      // Cast viewport_layout from Json to ViewportLayout
      return {
        ...data,
        viewport_layout: data.viewport_layout as ViewportLayout | null,
      };
    },
  });
}

/**
 * Create a new brainstorm session
 */
export function useCreateBrainstormSession() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      conversationId,
      viewportLayout = { columns: 2, rows: 2 },
    }: {
      conversationId: string;
      viewportLayout?: ViewportLayout;
    }) => {
      if (!user?.id) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('brainstorm_sessions')
        .insert({
          conversation_id: conversationId,
          user_id: user.id,
          viewport_layout: viewportLayout,
          active_branches: [],
        })
        .select()
        .single();

      if (error) throw error;
      return data as BrainstormSession;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['brainstorm-session'] });
      queryClient.setQueryData(['brainstorm-session', data.id], data);
    },
  });
}

/**
 * Update brainstorm session
 */
export function useUpdateBrainstormSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      sessionId,
      updates,
    }: {
      sessionId: string;
      updates: Partial<Omit<BrainstormSession, 'id' | 'user_id' | 'created_at' | 'updated_at'>>;
    }) => {
      const { data, error } = await supabase
        .from('brainstorm_sessions')
        .update(updates)
        .eq('id', sessionId)
        .select()
        .single();

      if (error) throw error;
      return data as BrainstormSession;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['brainstorm-session', data.id] });
      queryClient.setQueryData(['brainstorm-session', data.id], data);
    },
  });
}

// ============================================================================
// Design Branch Hooks
// ============================================================================

/**
 * Get all branches for a session
 */
export function useSessionBranches(sessionId: string | undefined) {
  return useQuery<DesignBranch[]>({
    queryKey: ['design-branches', sessionId],
    enabled: !!sessionId,
    queryFn: async () => {
      if (!sessionId) return [];

      const { data, error } = await supabase
        .from('design_branches')
        .select('*')
        .eq('brainstorm_session_id', sessionId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data || [];
    },
  });
}

/**
 * Get a single branch by ID
 */
export function useDesignBranch(branchId: string | undefined) {
  return useQuery<DesignBranch | null>({
    queryKey: ['design-branch', branchId],
    enabled: !!branchId,
    queryFn: async () => {
      if (!branchId) return null;

      const { data, error} = await supabase
        .from('design_branches')
        .select('*')
        .eq('id', branchId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data || null;
    },
  });
}

/**
 * Create a design branch
 */
export function useCreateDesignBranch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (branch: Omit<DesignBranch, 'id' | 'created_at'>) => {
      const { data, error } = await supabase
        .from('design_branches')
        .insert(branch)
        .select()
        .single();

      if (error) throw error;
      return data as DesignBranch;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ['design-branches', data.brainstorm_session_id],
      });
      queryClient.setQueryData(['design-branch', data.id], data);
    },
  });
}

/**
 * Create multiple design branches (for parallel variations)
 */
export function useCreateDesignBranches() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (branches: Array<Omit<DesignBranch, 'id' | 'created_at'>>) => {
      const { data, error } = await supabase
        .from('design_branches')
        .insert(branches)
        .select();

      if (error) throw error;
      return data as DesignBranch[];
    },
    onSuccess: (data) => {
      if (data.length > 0) {
        const sessionId = data[0].brainstorm_session_id;
        queryClient.invalidateQueries({
          queryKey: ['design-branches', sessionId],
        });
      }
    },
  });
}

/**
 * Update design branch (e.g., update metrics after compilation)
 */
export function useUpdateDesignBranch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      branchId,
      updates,
    }: {
      branchId: string;
      updates: Partial<Omit<DesignBranch, 'id' | 'brainstorm_session_id' | 'created_at'>>;
    }) => {
      const { data, error } = await supabase
        .from('design_branches')
        .update(updates)
        .eq('id', branchId)
        .select()
        .single();

      if (error) throw error;
      return data as DesignBranch;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ['design-branch', data.id],
      });
      queryClient.invalidateQueries({
        queryKey: ['design-branches', data.brainstorm_session_id],
      });
    },
  });
}

/**
 * Delete a design branch
 */
export function useDeleteDesignBranch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (branchId: string) => {
      // Get the branch first to know which session to invalidate
      const { data: branch } = await supabase
        .from('design_branches')
        .select('brainstorm_session_id')
        .eq('id', branchId)
        .single();

      const { error } = await supabase
        .from('design_branches')
        .delete()
        .eq('id', branchId);

      if (error) throw error;
      return { branchId, sessionId: branch?.brainstorm_session_id };
    },
    onSuccess: ({ branchId, sessionId }) => {
      queryClient.invalidateQueries({ queryKey: ['design-branch', branchId] });
      if (sessionId) {
        queryClient.invalidateQueries({
          queryKey: ['design-branches', sessionId],
        });
      }
    },
  });
}

// ============================================================================
// Variation Generation Hook
// ============================================================================

/**
 * Generate design variations via the brainstorm-generate edge function
 */
export function useGenerateVariations() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      description,
      numVariations = 3,
      variationFocus,
      isVoiceMode = false,
    }: {
      description: string;
      numVariations?: number;
      variationFocus?: string[];
      isVoiceMode?: boolean;
    }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/brainstorm-generate`;
      console.log('🚀 Calling Edge Function:', url);
      console.log('📝 Request payload:', {
        description,
        num_variations: numVariations,
        variation_focus: variationFocus,
        is_voice_mode: isVoiceMode,
      });

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            description,
            num_variations: numVariations,
            variation_focus: variationFocus,
            is_voice_mode: isVoiceMode,
          }),
        });

        console.log('✅ Response received:', {
          status: response.status,
          statusText: response.statusText,
          ok: response.ok,
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({
            message: `HTTP ${response.status}: ${response.statusText}`
          }));
          console.error('❌ Edge function error:', error);
          throw new Error(error.message || 'Failed to generate variations');
        }

        const result = await response.json();
        console.log('✅ Variations generated:', result.variations?.length);
        return result.variations as BrainstormVariation[];
      } catch (error) {
        console.error('❌ Network error calling Edge Function:', {
          error,
          message: error instanceof Error ? error.message : 'Unknown error',
          url,
        });
        throw error;
      }
    },
  });
}

// ============================================================================
// Utility Hooks
// ============================================================================

/**
 * Get complete session data with branches
 */
export function useBrainstormSessionComplete(sessionId: string | undefined) {
  const session = useBrainstormSession(sessionId);
  const branches = useSessionBranches(sessionId);

  return {
    session: session.data,
    branches: branches.data || [],
    isLoading: session.isLoading || branches.isLoading,
    error: session.error || branches.error,
  };
}
