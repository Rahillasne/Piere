/**
 * Quality Score Calculator
 * Implements the multi-dimensional quality scoring system (0-100 points)
 */

import type { QualityMetrics, QualityScoreResult, Parameter } from '@shared/types';

// ============================================================================
// Scoring Constants
// ============================================================================

const SCORES = {
  COMPILATION: {
    SUCCESS: 15,
    FAST: 5, // < 2 seconds
    NO_WARNINGS: 5,
    MAX: 25,
  },
  GEOMETRIC: {
    RENDERS: 15,
    REASONABLE_SIZE: 5, // < 100k polygons
    NO_DEGENERATE: 5,
    MAX: 25,
  },
  PARAMETERS: {
    EXTRACTED: 10,
    VALID_RANGES: 10,
    TESTED: 5,
    MAX: 25,
  },
  SATISFACTION: {
    NO_REFINEMENT: 15,
    EXPORTED: 10,
    HIGH_RATING: 5, // 4+ stars
    MAX: 25,
  },
} as const;

const THRESHOLDS = {
  FAST_COMPILATION_MS: 2000,
  REASONABLE_POLYGON_COUNT: 100000,
  HIGH_RATING: 4,
} as const;

// ============================================================================
// Main Quality Score Calculator
// ============================================================================

/**
 * Calculate complete quality score from metrics
 * Returns scores for each dimension and total score (0-100)
 */
export function calculateQualityScore(
  metrics: Partial<QualityMetrics>
): QualityScoreResult {
  const compilationScore = calculateCompilationScore(metrics);
  const geometricScore = calculateGeometricScore(metrics);
  const parameterScore = calculateParameterScore(metrics);
  const satisfactionScore = calculateSatisfactionScore(metrics);

  const total_score =
    compilationScore.points +
    geometricScore.points +
    parameterScore.points +
    satisfactionScore.points;

  return {
    total_score: Math.min(total_score, 100), // Cap at 100
    compilation_score: compilationScore.points,
    geometric_score: geometricScore.points,
    parameter_score: parameterScore.points,
    satisfaction_score: satisfactionScore.points,
    breakdown: {
      compilation: compilationScore,
      geometric: geometricScore,
      parameters: parameterScore,
      satisfaction: satisfactionScore,
    },
  };
}

// ============================================================================
// Dimension-Specific Calculators
// ============================================================================

/**
 * Compilation Quality (0-25 points)
 * - Compiles successfully: 15 pts
 * - Compiles fast (<2s): 5 pts
 * - No warnings: 5 pts
 */
function calculateCompilationScore(metrics: Partial<QualityMetrics>) {
  let points = 0;
  const warnings = metrics.compilation_warnings ?? 0;
  const time_ms = metrics.compilation_time_ms;
  const success = metrics.compilation_success ?? false;

  // Success is the most important
  if (success) {
    points += SCORES.COMPILATION.SUCCESS;

    // Bonus for fast compilation
    if (time_ms && time_ms < THRESHOLDS.FAST_COMPILATION_MS) {
      points += SCORES.COMPILATION.FAST;
    }

    // Bonus for no warnings
    if (warnings === 0) {
      points += SCORES.COMPILATION.NO_WARNINGS;
    }
  }

  return {
    success,
    time_ms,
    warnings,
    points,
  };
}

/**
 * Geometric Quality (0-25 points)
 * - 3D model renders: 15 pts
 * - Reasonable polygon count (<100k): 5 pts
 * - No degenerate geometry: 5 pts
 */
function calculateGeometricScore(metrics: Partial<QualityMetrics>) {
  let points = 0;
  const render_success = metrics.render_success ?? false;
  const polygon_count = metrics.polygon_count;
  const has_issues = metrics.has_degenerate_geometry ?? false;

  // Rendering success is most important
  if (render_success) {
    points += SCORES.GEOMETRIC.RENDERS;

    // Bonus for reasonable polygon count
    if (
      polygon_count &&
      polygon_count < THRESHOLDS.REASONABLE_POLYGON_COUNT
    ) {
      points += SCORES.GEOMETRIC.REASONABLE_SIZE;
    }

    // Bonus for clean geometry
    if (!has_issues) {
      points += SCORES.GEOMETRIC.NO_DEGENERATE;
    }
  }

  return {
    render_success,
    polygon_count,
    has_issues,
    points,
  };
}

/**
 * Parameter Quality (0-25 points)
 * - Parameters extracted: 10 pts (proportional to expected count)
 * - Valid ranges: 10 pts (proportional to parameters with ranges)
 * - Parameters tested/work: 5 pts
 */
function calculateParameterScore(metrics: Partial<QualityMetrics>) {
  let points = 0;
  const extracted = metrics.parameters_extracted ?? 0;
  const valid_ranges = metrics.parameters_with_valid_ranges ?? 0;
  const tested = metrics.parameters_tested ?? false;

  // Points for extraction (assuming 3-8 parameters is ideal)
  const idealParamCount = 5;
  const extractionRatio = Math.min(extracted / idealParamCount, 1.0);
  points += Math.round(SCORES.PARAMETERS.EXTRACTED * extractionRatio);

  // Points for valid ranges (proportional)
  if (extracted > 0) {
    const rangeRatio = valid_ranges / extracted;
    points += Math.round(SCORES.PARAMETERS.VALID_RANGES * rangeRatio);
  }

  // Bonus for tested parameters
  if (tested && extracted > 0) {
    points += SCORES.PARAMETERS.TESTED;
  }

  return {
    extracted,
    valid_ranges,
    tested,
    points,
  };
}

/**
 * User Satisfaction (0-25 points)
 * - No refinement requests: 15 pts
 * - Model exported: 10 pts
 * - High rating (4+ stars): 5 pts
 */
function calculateSatisfactionScore(metrics: Partial<QualityMetrics>) {
  let points = 0;
  const refinements = metrics.refinement_requested ? 1 : 0;
  const exported = metrics.model_exported ?? false;
  const rating = metrics.user_rating;

  // No refinements needed = success!
  if (!metrics.refinement_requested) {
    points += SCORES.SATISFACTION.NO_REFINEMENT;
  }

  // Export indicates user found it useful
  if (exported) {
    points += SCORES.SATISFACTION.EXPORTED;
  }

  // High rating is the ultimate validation
  if (rating && rating >= THRESHOLDS.HIGH_RATING) {
    points += SCORES.SATISFACTION.HIGH_RATING;
  }

  return {
    refinements,
    exported,
    rating,
    points,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Determine quality gate level for learning
 * - FAILURE (0-59): Don't learn from
 * - GOOD (60-84): Include in general learning pool
 * - EXCELLENT (85-100): Premium examples, weight heavily
 */
export function getQualityGate(score: number): 'FAILURE' | 'GOOD' | 'EXCELLENT' {
  if (score < 60) return 'FAILURE';
  if (score < 85) return 'GOOD';
  return 'EXCELLENT';
}

/**
 * Check if parameters have valid ranges
 * Used during metric collection
 */
export function validateParameterRanges(parameters: Parameter[]): {
  total: number;
  withValidRanges: number;
} {
  const total = parameters.length;
  const withValidRanges = parameters.filter((param) => {
    if (param.type === 'number' && param.range) {
      const { min, max } = param.range;
      return (
        min !== undefined &&
        max !== undefined &&
        min < max &&
        min >= 0 // Avoid negative dimensions (common failure)
      );
    }
    // Options are considered valid ranges
    if (param.options && param.options.length > 0) {
      return true;
    }
    return false;
  }).length;

  return { total, withValidRanges };
}

/**
 * Estimate if parameters actually affect the model
 * This is a heuristic - true testing would require rendering multiple times
 */
export function estimateParameterFunctionality(
  parameters: Parameter[],
  code: string
): boolean {
  if (parameters.length === 0) return false;

  // Check if parameter names appear in the code (basic check)
  const usedCount = parameters.filter((param) => {
    // Parameter should appear in code at least twice (declaration + usage)
    const regex = new RegExp(`\\b${param.name}\\b`, 'g');
    const matches = code.match(regex);
    return matches && matches.length >= 2;
  }).length;

  // At least 80% of parameters should be used
  return usedCount / parameters.length >= 0.8;
}

/**
 * Count OpenSCAD warnings from stderr
 */
export function countOpenSCADWarnings(stderr: string[]): number {
  if (!stderr || stderr.length === 0) return 0;

  return stderr.filter((line) =>
    line.toLowerCase().includes('warning')
  ).length;
}

/**
 * Detect degenerate geometry from stderr
 */
export function hasGeometryIssues(stderr: string[]): boolean {
  if (!stderr || stderr.length === 0) return false;

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

/**
 * Build complete quality metrics from compilation/render data
 * This is a convenience function to construct QualityMetrics from various sources
 */
export function buildQualityMetrics(input: {
  messageId: string;
  conversationId: string;
  code: string;
  parameters: Parameter[];
  compilationSuccess: boolean;
  compilationTimeMs?: number;
  stderr?: string[];
  stdout?: string[];
  polygonCount?: number;
  modelVersion: 'pierre' | 'metroboomin';
  generationTimeMs?: number;
  tokensUsed?: number;
}): Omit<QualityMetrics, 'id' | 'created_at' | 'updated_at' | 'user_id'> {
  const paramValidation = validateParameterRanges(input.parameters);
  const parametersTested = estimateParameterFunctionality(
    input.parameters,
    input.code
  );
  const compilation_warnings = input.stderr
    ? countOpenSCADWarnings(input.stderr)
    : 0;
  const has_degenerate_geometry = input.stderr
    ? hasGeometryIssues(input.stderr)
    : false;

  const partialMetrics: Partial<QualityMetrics> = {
    message_id: input.messageId,
    conversation_id: input.conversationId,
    compilation_success: input.compilationSuccess,
    compilation_time_ms: input.compilationTimeMs,
    compilation_warnings,
    render_success: input.compilationSuccess && !has_degenerate_geometry,
    polygon_count: input.polygonCount,
    has_degenerate_geometry,
    parameters_extracted: paramValidation.total,
    parameters_with_valid_ranges: paramValidation.withValidRanges,
    parameters_tested: parametersTested,
    code_length: input.code.length,
    model_version: input.modelVersion,
    generation_time_ms: input.generationTimeMs,
    tokens_used: input.tokensUsed,
    refinement_requested: false, // Set later by user behavior
    model_exported: false, // Set later by user behavior
  };

  // Calculate scores
  const scoreResult = calculateQualityScore(partialMetrics);

  return {
    ...partialMetrics,
    total_score: scoreResult.total_score,
    compilation_score: scoreResult.compilation_score,
    geometric_score: scoreResult.geometric_score,
    parameter_score: scoreResult.parameter_score,
    satisfaction_score: scoreResult.satisfaction_score,
  } as Omit<QualityMetrics, 'id' | 'created_at' | 'updated_at' | 'user_id'>;
}

/**
 * Format quality score for display
 */
export function formatQualityScore(score: number): {
  label: string;
  color: string;
  emoji: string;
} {
  const gate = getQualityGate(score);

  switch (gate) {
    case 'EXCELLENT':
      return {
        label: 'Excellent',
        color: 'green',
        emoji: '✓',
      };
    case 'GOOD':
      return {
        label: 'Good',
        color: 'blue',
        emoji: '👍',
      };
    case 'FAILURE':
      return {
        label: 'Needs Improvement',
        color: 'orange',
        emoji: '⚠',
      };
  }
}
