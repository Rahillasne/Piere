/**
 * AI Optimizer for Pierre (Deno-compatible)
 * Implements 2025 best practices for Claude Sonnet 4.5
 */

import type { Model } from '@shared/types.ts';

// ============================================================================
// Configuration Constants
// ============================================================================

export const CLAUDE_SONNET_CONFIG = {
  model: 'claude-sonnet-4-5-20250929',
  max_tokens: 8000,
  temperature: 0.3,
  top_p: 0.95,
} as const;

export const EXTENDED_THINKING_CONFIG = {
  budget_tokens: 8000, // Reduced from 12000 for faster generation
  enabled_for_complex_tasks: true,
} as const;

const COMPLEXITY_THRESHOLDS = {
  prompt_length_chars: 500,
  complex_keywords: [
    'organic', 'complex', 'intricate', 'detailed',
    'curved', 'flowing', 'multiple parts', 'assembly',
    'parametric', 'modular', 'configurable',
    'thread', 'gear', 'mechanism',
  ],
  min_complex_keywords: 2,
} as const;

// ============================================================================
// Intelligent Model Selection
// ============================================================================

export function selectOptimalModelConfig(params: {
  userPrompt: string;
  hasReferenceImage: boolean;
  isRefinement: boolean;
  previousAttemptFailed: boolean;
}): {
  model: Model;
  useExtendedThinking: boolean;
  temperature: number;
  reasoning: string;
} {
  const { userPrompt, hasReferenceImage, isRefinement, previousAttemptFailed } = params;

  const complexityScore = calculateComplexity(userPrompt, hasReferenceImage);

  // Previous attempt failed → max quality
  if (previousAttemptFailed) {
    return {
      model: 'metroboomin',
      useExtendedThinking: true,
      temperature: 1.0, // Extended thinking requires temperature=1
      reasoning: 'Previous attempt failed - using maximum quality mode',
    };
  }

  // Reference image → extended thinking
  if (hasReferenceImage) {
    return {
      model: 'metroboomin',
      useExtendedThinking: true,
      temperature: 1.0, // Extended thinking requires temperature=1
      reasoning: 'Reference image detected - using extended thinking',
    };
  }

  // High complexity (threshold increased from 7 to 8 for speed)
  if (complexityScore >= 8) {
    return {
      model: 'metroboomin',
      useExtendedThinking: true,
      temperature: 1.0, // Extended thinking requires temperature=1
      reasoning: `High complexity (${complexityScore}/10) - using extended thinking`,
    };
  }

  // Medium complexity
  if (complexityScore >= 4) {
    return {
      model: 'pierre',
      useExtendedThinking: false,
      temperature: 0.3,
      reasoning: `Medium complexity (${complexityScore}/10) - fast quality mode`,
    };
  }

  // Simple tasks
  return {
    model: 'pierre',
    useExtendedThinking: false,
    temperature: 0.4,
    reasoning: `Low complexity (${complexityScore}/10) - fast mode`,
  };
}

function calculateComplexity(prompt: string, hasImage: boolean): number {
  let score = 0;

  const promptLength = prompt.length;
  if (promptLength > 1000) score += 3;
  else if (promptLength > 500) score += 2;
  else if (promptLength > 200) score += 1;

  const lowerPrompt = prompt.toLowerCase();
  const complexKeywordCount = COMPLEXITY_THRESHOLDS.complex_keywords.filter((keyword) =>
    lowerPrompt.includes(keyword)
  ).length;

  score += Math.min(complexKeywordCount * 1.5, 4);

  if (lowerPrompt.includes('multiple') || lowerPrompt.includes('several')) score += 1;
  if (lowerPrompt.includes('assembly') || lowerPrompt.includes('connect')) score += 1;

  if (hasImage) score += 2;

  return Math.min(Math.round(score), 10);
}

/**
 * Detect crash-prone patterns in user prompts
 * Returns risk factors and recommended thinking budget
 */
function detectCrashRiskPatterns(prompt: string, isRefinement: boolean): {
  hasCrashRisk: boolean;
  riskFactors: string[];
  recommendedBudget: number;
} {
  const lowerPrompt = prompt.toLowerCase();
  const riskFactors: string[] = [];

  // Organic shapes (hull-related crashes)
  const organicKeywords = ['fruit', 'apple', 'pear', 'bottle', 'vase', 'organic', 'bulb', 'egg'];
  if (organicKeywords.some(k => lowerPrompt.includes(k))) {
    riskFactors.push('organic_shape');
  }

  // Assembly complexity (multiple parts with connections)
  const assemblyKeywords = ['assembly', 'multiple parts', 'connect', 'attach', 'join', 'mechanism'];
  if (assemblyKeywords.some(k => lowerPrompt.includes(k))) {
    riskFactors.push('assembly');
  }

  // Architectural (linear_extrude risks with roofs/buildings)
  const archKeywords = ['house', 'building', 'roof', 'pitched', 'architecture', 'structure'];
  if (archKeywords.some(k => lowerPrompt.includes(k))) {
    riskFactors.push('architectural');
  }

  // Refinement with size changes (scale risks)
  if (isRefinement) {
    const sizeChangeKeywords = ['bigger', 'taller', 'wider', 'larger', 'smaller', 'stretch', 'scale'];
    if (sizeChangeKeywords.some(k => lowerPrompt.includes(k))) {
      riskFactors.push('refinement_scaling');
    }
  }

  // Complex curved surfaces
  const curvedKeywords = ['curved', 'smooth', 'rounded', 'flowing', 'spiral', 'twist'];
  if (curvedKeywords.some(k => lowerPrompt.includes(k))) {
    riskFactors.push('complex_curves');
  }

  const hasCrashRisk = riskFactors.length > 0;

  // Determine recommended thinking budget based on risk level
  // OPTIMIZED FOR SPEED: Reduced budgets while maintaining safety
  let recommendedBudget = 8000; // Default (reduced from 12000)

  if (riskFactors.length >= 3) {
    // Multiple risk factors = very high risk
    recommendedBudget = 12000; // Reduced from 15000
  } else if (riskFactors.length >= 2) {
    // Two risk factors = high risk
    recommendedBudget = 10000; // Reduced from 15000
  } else if (riskFactors.includes('organic_shape') || riskFactors.includes('assembly')) {
    // Known high-risk single factors
    recommendedBudget = 10000; // Reduced from 15000
  }

  return {
    hasCrashRisk,
    riskFactors,
    recommendedBudget,
  };
}

// ============================================================================
// Prompt Enhancement
// ============================================================================

export function enhancePromptForOpenSCAD(userPrompt: string): string {
  const enhancements: string[] = [];

  if (containsSpatialTerms(userPrompt) && !containsExplicitAxes(userPrompt)) {
    enhancements.push(
      'Be explicit about axes (X=left/right, Y=front/back, Z=up/down).'
    );
  }

  if (isComplexDesign(userPrompt)) {
    enhancements.push(
      'Break into logical modules. Create helper modules for reusable components.'
    );
  }

  if (userPrompt.includes('connect') || userPrompt.includes('attach')) {
    enhancements.push(
      'For connections: Be specific about edges (e.g., "bottom edge flush with top edge").'
    );
  }

  if (!userPrompt.toLowerCase().includes('parameter')) {
    enhancements.push(
      'Make key dimensions parametric for adjustability.'
    );
  }

  return enhancements.length > 0
    ? `${userPrompt}\n\n[Guidelines: ${enhancements.join(' ')}]`
    : userPrompt;
}

function containsSpatialTerms(prompt: string): boolean {
  const spatialTerms = ['rotate', 'translate', 'move', 'position', 'place', 'orient'];
  return spatialTerms.some((term) => prompt.toLowerCase().includes(term));
}

function containsExplicitAxes(prompt: string): boolean {
  const axes = ['x-axis', 'y-axis', 'z-axis', 'x axis', 'y axis', 'z axis'];
  return axes.some((axis) => prompt.toLowerCase().includes(axis));
}

function isComplexDesign(prompt: string): boolean {
  const complexIndicators = [
    'multiple parts',
    'assembly',
    'several components',
    'different pieces',
    'modular',
  ];
  return complexIndicators.some((indicator) =>
    prompt.toLowerCase().includes(indicator)
  );
}

// ============================================================================
// System Prompt Optimization
// ============================================================================

export function buildOptimizedSystemPrompt(
  taskType: 'generation' | 'refinement',
  basePrompt: string
): string {
  const researchBacked = `
## PROVEN TECHNIQUES (from 10K+ real generations)
✓ hull() for smooth organic shapes (92.5% success rate)
✓ Wall thickness: 2-10mm optimal range
✓ Height: 10-500mm safe zone
✓ Parameters: 3-8 is ideal for user satisfaction
✓ Avoid parameters below 1mm (causes geometry errors)
✓ Avoid >50 small components (causes render artifacts)

## SPATIAL REASONING BEST PRACTICES
- Be explicit about axes: X (left/right), Y (front/back), Z (up/down)
- Avoid axis confusion in rotate() and translate()
- Use exact edge-to-edge positioning for connections
- Modular design: Break complex shapes into simple primitives

## QUALITY GATES (Automatic Scoring 0-100)
Your code is scored across 4 dimensions:
- Compilation Quality (0-25): Must compile fast (<2s) with no warnings
- Geometric Quality (0-25): Must render cleanly with reasonable polygons
- Parameter Quality (0-25): Extract 3-8 parameters with valid ranges
- User Satisfaction (0-25): First-try success, no refinements needed

TARGET: 85+ score (EXCELLENT tier) on first attempt.
`.trim();

  return `${basePrompt}\n\n${researchBacked}`;
}

// ============================================================================
// Complete Optimization Pipeline
// ============================================================================

export function optimizeAIRequest(params: {
  userPrompt: string;
  hasReferenceImage: boolean;
  isRefinement: boolean;
  previousAttemptFailed: boolean;
  currentModel?: Model;
}) {
  const { userPrompt, hasReferenceImage, isRefinement, previousAttemptFailed, currentModel } = params;

  // Select optimal configuration
  const modelConfig = selectOptimalModelConfig({
    userPrompt,
    hasReferenceImage,
    isRefinement,
    previousAttemptFailed,
  });

  // Enhance prompt
  const enhancedPrompt = enhancePromptForOpenSCAD(userPrompt);

  // Calculate complexity for logging
  const complexityScore = calculateComplexity(userPrompt, hasReferenceImage);

  // 🎯 PHASE 4.6: Detect crash-prone patterns and adjust thinking budget
  const crashRisk = detectCrashRiskPatterns(userPrompt, isRefinement);

  // Adjust budget based on crash risk and whether extended thinking is enabled
  const adjustedBudget = crashRisk.hasCrashRisk && modelConfig.useExtendedThinking
    ? crashRisk.recommendedBudget  // 15000 for high-risk designs
    : EXTENDED_THINKING_CONFIG.budget_tokens; // Standard 12000

  return {
    modelConfig,
    enhancedPrompt,
    complexityScore,
    reasoning: modelConfig.reasoning,
    shouldUseExtendedThinking: modelConfig.useExtendedThinking,
    optimizedTemperature: modelConfig.temperature,
    thinkingBudget: adjustedBudget,
    crashRiskFactors: crashRisk.riskFactors, // For logging/debugging
  };
}
