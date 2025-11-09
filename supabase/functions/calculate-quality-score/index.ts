/**
 * Calculate Quality Score Edge Function
 * Automatically calculates and stores quality metrics for a message
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import type { Message, QualityMetrics, Parameter } from '../_shared/types.ts';
import { corsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Create Supabase client with user's auth
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    // Get authenticated user
    const {
      data: { user },
    } = await supabaseClient.auth.getUser();

    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse request body
    const { messageId, compilationData } = await req.json();

    if (!messageId) {
      return new Response(
        JSON.stringify({ error: 'messageId is required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Fetch message data
    const { data: message, error: messageError } = await supabaseClient
      .from('messages')
      .select('*')
      .eq('id', messageId)
      .single();

    if (messageError || !message) {
      return new Response(
        JSON.stringify({ error: 'Message not found' }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const content = message.content as any;

    // Only calculate quality for assistant messages with artifacts
    if (message.role !== 'assistant' || !content.artifact) {
      return new Response(
        JSON.stringify({ error: 'Message has no CAD artifact' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Extract data from message and compilation
    const code = content.artifact.code;
    const parameters: Parameter[] = content.artifact.parameters || [];
    const modelVersion = content.model || 'pierre';

    // Build quality metrics
    const metrics = buildQualityMetrics({
      messageId,
      conversationId: message.conversation_id,
      userId: user.id,
      code,
      parameters,
      compilationData,
      modelVersion,
    });

    // Check if quality metrics already exist
    const { data: existingMetrics } = await supabaseClient
      .from('quality_metrics')
      .select('id')
      .eq('message_id', messageId)
      .maybeSingle();

    let result;

    if (existingMetrics) {
      // Update existing metrics
      const { data, error } = await supabaseClient
        .from('quality_metrics')
        .update(metrics)
        .eq('id', existingMetrics.id)
        .select()
        .single();

      if (error) throw error;
      result = data;
    } else {
      // Insert new metrics
      const { data, error } = await supabaseClient
        .from('quality_metrics')
        .insert(metrics)
        .select()
        .single();

      if (error) throw error;
      result = data;
    }

    return new Response(JSON.stringify({ data: result }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error calculating quality score:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

// ============================================================================
// Quality Calculation Functions
// ============================================================================

interface CompilationData {
  success: boolean;
  timeMs?: number;
  stderr?: string[];
  stdout?: string[];
  polygonCount?: number;
  generationTimeMs?: number;
  tokensUsed?: number;
}

function buildQualityMetrics(input: {
  messageId: string;
  conversationId: string;
  userId: string;
  code: string;
  parameters: Parameter[];
  compilationData: CompilationData;
  modelVersion: string;
}): Omit<QualityMetrics, 'id' | 'created_at' | 'updated_at'> {
  const {
    messageId,
    conversationId,
    userId,
    code,
    parameters,
    compilationData,
    modelVersion,
  } = input;

  // Parameter validation
  const paramValidation = validateParameterRanges(parameters);
  const parametersTested = estimateParameterFunctionality(parameters, code);

  // Compilation analysis
  const compilation_warnings = compilationData.stderr
    ? countOpenSCADWarnings(compilationData.stderr)
    : 0;
  const has_degenerate_geometry = compilationData.stderr
    ? hasGeometryIssues(compilationData.stderr)
    : false;

  // Calculate individual scores
  const compilationScore = calculateCompilationScore({
    success: compilationData.success,
    timeMs: compilationData.timeMs,
    warnings: compilation_warnings,
  });

  const geometricScore = calculateGeometricScore({
    renderSuccess: compilationData.success && !has_degenerate_geometry,
    polygonCount: compilationData.polygonCount,
    hasIssues: has_degenerate_geometry,
  });

  const parameterScore = calculateParameterScore({
    extracted: paramValidation.total,
    validRanges: paramValidation.withValidRanges,
    tested: parametersTested,
  });

  const satisfactionScore = calculateSatisfactionScore({
    refinementRequested: false,
    exported: false,
    rating: undefined,
  });

  const total_score =
    compilationScore +
    geometricScore +
    parameterScore +
    satisfactionScore;

  return {
    message_id: messageId,
    conversation_id: conversationId,
    user_id: userId,
    total_score,
    compilation_success: compilationData.success,
    compilation_time_ms: compilationData.timeMs,
    compilation_warnings,
    compilation_score: compilationScore,
    render_success: compilationData.success && !has_degenerate_geometry,
    polygon_count: compilationData.polygonCount,
    has_degenerate_geometry,
    geometric_score: geometricScore,
    parameters_extracted: paramValidation.total,
    parameters_with_valid_ranges: paramValidation.withValidRanges,
    parameters_tested: parametersTested,
    parameter_score: parameterScore,
    refinement_requested: false,
    model_exported: false,
    satisfaction_score: satisfactionScore,
    code_length: code.length,
    model_version: modelVersion,
    generation_time_ms: compilationData.generationTimeMs,
    tokens_used: compilationData.tokensUsed,
  };
}

// Helper functions (duplicated from qualityCalculator.ts for Deno compatibility)

function calculateCompilationScore(data: {
  success: boolean;
  timeMs?: number;
  warnings: number;
}): number {
  let points = 0;
  if (data.success) {
    points += 15; // Success
    if (data.timeMs && data.timeMs < 2000) points += 5; // Fast
    if (data.warnings === 0) points += 5; // No warnings
  }
  return points;
}

function calculateGeometricScore(data: {
  renderSuccess: boolean;
  polygonCount?: number;
  hasIssues: boolean;
}): number {
  let points = 0;
  if (data.renderSuccess) {
    points += 15; // Renders
    if (data.polygonCount && data.polygonCount < 100000) points += 5; // Reasonable size
    if (!data.hasIssues) points += 5; // No issues
  }
  return points;
}

function calculateParameterScore(data: {
  extracted: number;
  validRanges: number;
  tested: boolean;
}): number {
  let points = 0;
  const idealParamCount = 5;
  const extractionRatio = Math.min(data.extracted / idealParamCount, 1.0);
  points += Math.round(10 * extractionRatio);

  if (data.extracted > 0) {
    const rangeRatio = data.validRanges / data.extracted;
    points += Math.round(10 * rangeRatio);
  }

  if (data.tested && data.extracted > 0) points += 5;
  return points;
}

function calculateSatisfactionScore(data: {
  refinementRequested: boolean;
  exported: boolean;
  rating?: number;
}): number {
  let points = 0;
  if (!data.refinementRequested) points += 15;
  if (data.exported) points += 10;
  if (data.rating && data.rating >= 4) points += 5;
  return points;
}

function validateParameterRanges(
  parameters: Parameter[]
): { total: number; withValidRanges: number } {
  const total = parameters.length;
  const withValidRanges = parameters.filter((param) => {
    if (param.type === 'number' && param.range) {
      const { min, max } = param.range;
      return (
        min !== undefined &&
        max !== undefined &&
        min < max &&
        min >= 0
      );
    }
    if (param.options && param.options.length > 0) return true;
    return false;
  }).length;

  return { total, withValidRanges };
}

function estimateParameterFunctionality(
  parameters: Parameter[],
  code: string
): boolean {
  if (parameters.length === 0) return false;

  const usedCount = parameters.filter((param) => {
    const regex = new RegExp(`\\b${param.name}\\b`, 'g');
    const matches = code.match(regex);
    return matches && matches.length >= 2;
  }).length;

  return usedCount / parameters.length >= 0.8;
}

function countOpenSCADWarnings(stderr: string[]): number {
  return stderr.filter((line) => line.toLowerCase().includes('warning')).length;
}

function hasGeometryIssues(stderr: string[]): boolean {
  const issues = [
    'degenerate',
    'non-manifold',
    'self-intersect',
    'invalid',
    'error.*geometry',
  ];

  return stderr.some((line) =>
    issues.some((issue) => new RegExp(issue, 'i').test(line))
  );
}
