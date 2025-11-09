/**
 * Voice Session Service
 *
 * Handles persistence of voice sessions, transcripts, and function calls
 * to Supabase database for conversation history and session resume.
 *
 * IMPORTANT: Voice sessions now integrate with the messages table.
 * Transcripts create corresponding messages for unified conversation history.
 */

import { supabase } from '@/lib/supabase';
import { Tables, TablesInsert } from '@/types/database.types';
import type { Content, Message } from '@shared/types';

// ============================================================================
// Types
// ============================================================================

export type VoiceSession = Tables<'voice_sessions'>;
export type VoiceTranscript = Tables<'voice_transcripts'>;
export type VoiceFunctionCall = Tables<'voice_function_calls'>;

export interface CreateVoiceSessionParams {
  conversationId: string;
  brainstormSessionId?: string;
  userId: string;
  modelUsed?: string;
  voiceUsed?: string;
  openaiSessionId?: string;
}

export interface CreateTranscriptParams {
  voiceSessionId: string;
  conversationId?: string;
  role: 'user' | 'assistant';
  transcript: string;
  audioDurationMs?: number;
  isPartial?: boolean;
}

export interface CreateFunctionCallParams {
  voiceSessionId: string;
  voiceTranscriptId?: string;
  functionName: string;
  arguments: Record<string, any>;
  result?: Record<string, any>;
  status?: 'pending' | 'executing' | 'completed' | 'failed';
  errorMessage?: string;
  executionTimeMs?: number;
}

export interface AudioQualityMetrics {
  maxQueueSize: number;
  avgQueueSize: number;
  chunksReceived: number;
  chunksPlayed: number;
  audioDropouts: number;
  avgLatencyMs: number;
  networkIssues: number;
}

// ============================================================================
// Voice Session Management
// ============================================================================

/**
 * Create a new voice session
 */
export async function createVoiceSession(
  params: CreateVoiceSessionParams
): Promise<VoiceSession | null> {
  try {
    const sessionData: TablesInsert<'voice_sessions'> = {
      conversation_id: params.conversationId,
      brainstorm_session_id: params.brainstormSessionId,
      user_id: params.userId,
      model_used: params.modelUsed || 'gpt-4o-realtime-preview-2024-10-01',
      voice_used: params.voiceUsed || 'alloy',
      openai_session_id: params.openaiSessionId,
      started_at: new Date().toISOString(),
      audio_quality_metrics: {},
    };

    const { data, error } = await supabase
      .from('voice_sessions')
      .insert(sessionData)
      .select()
      .single();

    if (error) {
      console.error('Failed to create voice session:', error);
      return null;
    }

    console.log('✅ Created voice session:', data.id);
    return data;
  } catch (err) {
    console.error('Error creating voice session:', err);
    return null;
  }
}

/**
 * End a voice session and update quality metrics
 */
export async function endVoiceSession(
  sessionId: string,
  qualityMetrics?: AudioQualityMetrics
): Promise<VoiceSession | null> {
  try {
    const updateData: Partial<TablesInsert<'voice_sessions'>> = {
      ended_at: new Date().toISOString(),
    };

    if (qualityMetrics) {
      updateData.audio_quality_metrics = qualityMetrics as any;
    }

    const { data, error } = await supabase
      .from('voice_sessions')
      .update(updateData)
      .eq('id', sessionId)
      .select()
      .single();

    if (error) {
      console.error('Failed to end voice session:', error);
      return null;
    }

    console.log('✅ Ended voice session:', data.id);
    return data;
  } catch (err) {
    console.error('Error ending voice session:', err);
    return null;
  }
}

/**
 * Update audio quality metrics during session
 */
export async function updateAudioQualityMetrics(
  sessionId: string,
  metrics: AudioQualityMetrics
): Promise<void> {
  try {
    const { error } = await supabase
      .from('voice_sessions')
      .update({ audio_quality_metrics: metrics as any })
      .eq('id', sessionId);

    if (error) {
      console.error('Failed to update quality metrics:', error);
    }
  } catch (err) {
    console.error('Error updating quality metrics:', err);
  }
}

// ============================================================================
// Transcript Management
// ============================================================================

/**
 * Save a transcript to the database
 */
export async function saveTranscript(
  params: CreateTranscriptParams
): Promise<VoiceTranscript | null> {
  try {
    const transcriptData: TablesInsert<'voice_transcripts'> = {
      voice_session_id: params.voiceSessionId,
      conversation_id: params.conversationId,
      role: params.role,
      transcript: params.transcript,
      audio_duration_ms: params.audioDurationMs,
      is_partial: params.isPartial || false,
      timestamp: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('voice_transcripts')
      .insert(transcriptData)
      .select()
      .single();

    if (error) {
      console.error('Failed to save transcript:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('Error saving transcript:', err);
    return null;
  }
}

/**
 * Create a message in the messages table from a voice transcript
 * This allows voice and text to share the same conversation history
 */
export async function createMessageFromTranscript(params: {
  conversationId: string;
  role: 'user' | 'assistant';
  transcript: string;
  parentMessageId: string | null;
  artifact?: {
    title: string;
    code: string;
    parameters: any[];
    version: string;
  };
}): Promise<Message | null> {
  try {
    const content: Content = {
      text: params.transcript,
      model: 'pierre',
      ...(params.artifact && {
        artifact: {
          title: params.artifact.title,
          code: params.artifact.code,
          parameters: params.artifact.parameters,
          version: params.artifact.version,
        }
      }),
    };

    const { data, error } = await supabase
      .from('messages')
      .insert([
        {
          role: params.role,
          content,
          parent_message_id: params.parentMessageId,
          conversation_id: params.conversationId,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error('Failed to create message from transcript:', error);
      return null;
    }

    console.log('✅ Created message from transcript:', data.id);
    return data as Message;
  } catch (err) {
    console.error('Error creating message from transcript:', err);
    return null;
  }
}

/**
 * Save transcript AND create corresponding message for unified history
 * Use this for final (non-partial) transcripts that should appear in chat
 */
export async function saveTranscriptWithMessage(
  params: CreateTranscriptParams & {
    parentMessageId: string | null;
    artifact?: {
      title: string;
      code: string;
      parameters: any[];
      version: string;
    };
  }
): Promise<{
  transcript: VoiceTranscript | null;
  message: Message | null;
}> {
  try {
    // Save transcript to voice_transcripts table
    const transcript = await saveTranscript(params);

    // If this is a final (non-partial) transcript and we have a conversationId,
    // also create a message in the messages table
    let message: Message | null = null;
    if (
      !params.isPartial &&
      params.conversationId &&
      transcript &&
      params.artifact
    ) {
      message = await createMessageFromTranscript({
        conversationId: params.conversationId,
        role: params.role,
        transcript: params.transcript,
        parentMessageId: params.parentMessageId,
        artifact: params.artifact,
      });
    } else if (!params.isPartial && params.conversationId && transcript) {
      // No artifact - just create text message
      message = await createMessageFromTranscript({
        conversationId: params.conversationId,
        role: params.role,
        transcript: params.transcript,
        parentMessageId: params.parentMessageId,
      });
    }

    return { transcript, message };
  } catch (err) {
    console.error('Error saving transcript with message:', err);
    return { transcript: null, message: null };
  }
}

/**
 * Get all transcripts for a voice session
 */
export async function getSessionTranscripts(
  sessionId: string
): Promise<VoiceTranscript[]> {
  try {
    const { data, error } = await supabase
      .from('voice_transcripts')
      .select('*')
      .eq('voice_session_id', sessionId)
      .eq('is_partial', false)
      .order('timestamp', { ascending: true });

    if (error) {
      console.error('Failed to fetch transcripts:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Error fetching transcripts:', err);
    return [];
  }
}

/**
 * Get conversation voice history across all sessions
 */
export async function getConversationVoiceHistory(
  conversationId: string
): Promise<VoiceTranscript[]> {
  try {
    const { data, error } = await supabase
      .from('voice_transcripts')
      .select('*')
      .eq('conversation_id', conversationId)
      .eq('is_partial', false)
      .order('timestamp', { ascending: true });

    if (error) {
      console.error('Failed to fetch conversation history:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Error fetching conversation history:', err);
    return [];
  }
}

// ============================================================================
// Function Call Management
// ============================================================================

/**
 * Save a function call to the database
 */
export async function saveFunctionCall(
  params: CreateFunctionCallParams
): Promise<VoiceFunctionCall | null> {
  try {
    const functionCallData: TablesInsert<'voice_function_calls'> = {
      voice_session_id: params.voiceSessionId,
      voice_transcript_id: params.voiceTranscriptId,
      function_name: params.functionName,
      arguments: params.arguments,
      result: params.result,
      status: params.status || 'pending',
      error_message: params.errorMessage,
      execution_time_ms: params.executionTimeMs,
    };

    const { data, error } = await supabase
      .from('voice_function_calls')
      .insert(functionCallData)
      .select()
      .single();

    if (error) {
      console.error('Failed to save function call:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('Error saving function call:', err);
    return null;
  }
}

/**
 * Update function call status and result
 */
export async function updateFunctionCall(
  functionCallId: string,
  updates: {
    status?: 'pending' | 'executing' | 'completed' | 'failed';
    result?: Record<string, any>;
    errorMessage?: string;
    executionTimeMs?: number;
  }
): Promise<VoiceFunctionCall | null> {
  try {
    const updateData: Partial<TablesInsert<'voice_function_calls'>> = {
      status: updates.status,
      result: updates.result,
      error_message: updates.errorMessage,
      execution_time_ms: updates.executionTimeMs,
    };

    if (updates.status === 'completed' || updates.status === 'failed') {
      updateData.completed_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('voice_function_calls')
      .update(updateData)
      .eq('id', functionCallId)
      .select()
      .single();

    if (error) {
      console.error('Failed to update function call:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('Error updating function call:', err);
    return null;
  }
}

/**
 * Get function calls for a voice session
 */
export async function getSessionFunctionCalls(
  sessionId: string
): Promise<VoiceFunctionCall[]> {
  try {
    const { data, error } = await supabase
      .from('voice_function_calls')
      .select('*')
      .eq('voice_session_id', sessionId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Failed to fetch function calls:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Error fetching function calls:', err);
    return [];
  }
}

// ============================================================================
// Session Resume
// ============================================================================

/**
 * Voice session with enriched data for display
 */
export interface VoiceSessionDisplay extends VoiceSession {
  title: string;
  durationSeconds: number | null;
}

/**
 * Get recent voice sessions for user
 */
export async function getRecentVoiceSessions(
  userId: string,
  limit: number = 10
): Promise<VoiceSession[]> {
  try {
    const { data, error } = await supabase
      .from('voice_sessions')
      .select('*')
      .eq('user_id', userId)
      .order('started_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Failed to fetch recent sessions:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Error fetching recent sessions:', err);
    return [];
  }
}

/**
 * Get recent voice sessions with titles and calculated durations
 */
export async function getRecentVoiceSessionsWithDetails(
  userId: string,
  limit: number = 10
): Promise<VoiceSessionDisplay[]> {
  try {
    const { data, error } = await supabase
      .from('voice_sessions')
      .select(`
        *,
        conversation:conversations(title)
      `)
      .eq('user_id', userId)
      .order('started_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Failed to fetch recent sessions with details:', error);
      return [];
    }

    // Enrich sessions with title and duration
    return (data || []).map((session: any) => {
      const startedAt = session.started_at && session.started_at !== null ? new Date(session.started_at) : null;
      const endedAt = session.ended_at && session.ended_at !== null ? new Date(session.ended_at) : null;

      let durationSeconds: number | null = null;
      if (startedAt && endedAt) {
        durationSeconds = Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000);
      }

      // Use conversation title or generate a default title
      const title = session.conversation?.title || 'Voice Session';

      return {
        ...session,
        title,
        durationSeconds,
      };
    });
  } catch (err) {
    console.error('Error fetching recent sessions with details:', err);
    return [];
  }
}

/**
 * Get full session data including transcripts and function calls
 */
export async function getFullSessionData(sessionId: string): Promise<{
  session: VoiceSession | null;
  transcripts: VoiceTranscript[];
  functionCalls: VoiceFunctionCall[];
} | null> {
  try {
    const [session, transcripts, functionCalls] = await Promise.all([
      supabase
        .from('voice_sessions')
        .select('*')
        .eq('id', sessionId)
        .single(),
      getSessionTranscripts(sessionId),
      getSessionFunctionCalls(sessionId),
    ]);

    if (session.error) {
      console.error('Failed to fetch session:', session.error);
      return null;
    }

    return {
      session: session.data,
      transcripts,
      functionCalls,
    };
  } catch (err) {
    console.error('Error fetching full session data:', err);
    return null;
  }
}

// ============================================================================
// Combined Recent Items (for Sidebar)
// ============================================================================

/**
 * Combined item type for "Recent" section
 */
export interface RecentItem {
  id: string;
  type: 'conversation' | 'voice_session';
  title: string;
  timestamp: Date;
  durationSeconds?: number | null;
}

/**
 * Get recent items (mix of conversations and voice sessions)
 * sorted by most recent first
 */
export async function getRecentItems(
  userId: string,
  limit: number = 7
): Promise<RecentItem[]> {
  try {
    // Fetch recent conversations
    const { data: conversations, error: convError } = await supabase
      .from('conversations')
      .select('id, title, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (convError) {
      console.error('Failed to fetch conversations:', convError);
    }

    // Fetch recent voice sessions
    const voiceSessions = await getRecentVoiceSessionsWithDetails(userId, limit);

    // Combine and sort by timestamp
    const items: RecentItem[] = [];

    // Add conversations
    (conversations || []).forEach((conv) => {
      if (conv.updated_at) {
        items.push({
          id: conv.id,
          type: 'conversation',
          title: conv.title || 'Untitled Conversation',
          timestamp: new Date(conv.updated_at),
        });
      }
    });

    // Add voice sessions
    voiceSessions.forEach((session) => {
      items.push({
        id: session.id,
        type: 'voice_session',
        title: session.title,
        timestamp: new Date(session.started_at || Date.now()),
        durationSeconds: session.durationSeconds,
      });
    });

    // Sort by timestamp (most recent first) and limit
    return items
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  } catch (err) {
    console.error('Error fetching recent items:', err);
    return [];
  }
}
