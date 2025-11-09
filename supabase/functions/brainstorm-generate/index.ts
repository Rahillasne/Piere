import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { Anthropic } from 'https://esm.sh/@anthropic-ai/sdk@0.53.0';
import { MessageParam } from 'https://esm.sh/@anthropic-ai/sdk@0.53.0/resources/messages.d.mts';
import { ParametricArtifact } from '../_shared/types.ts';
import parseParameters from '../_shared/parseParameter.ts';
import { getBrainstormSystemPrompt } from '../_shared/brainstormPrompts.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { generateTemplateVariation, shouldUseTemplate } from '../_shared/openscadTemplates.ts';

/**
 * Brainstorm Generate Edge Function
 *
 * Generates multiple OpenSCAD design variations from a single prompt.
 * Used in brainstorm mode to show users multiple design approaches simultaneously.
 *
 * Request body:
 * {
 *   description: string;          // The user's design request
 *   num_variations?: number;       // Number of variations to generate (default: 3)
 *   variation_focus?: string[];    // Optional focus areas for each variation
 *   is_voice_mode?: boolean;       // Whether this is from voice interaction
 * }
 *
 * Response:
 * {
 *   variations: Array<{
 *     variation_index: number;
 *     title: string;
 *     code: string;
 *     parameters: Parameter[];
 *     reasoning?: string;
 *   }>;
 * }
 */

interface VariationRequest {
  description: string;
  num_variations?: number;
  variation_focus?: string[];
  is_voice_mode?: boolean;
}

interface VariationResult {
  variation_index: number;
  title: string;
  code: string;
  parameters: ReturnType<typeof parseParameters>;
  reasoning?: string;
}

// Helper to extract code from Claude response
function extractOpenSCADCode(text: string): string {
  // Remove markdown code blocks if present
  let code = text.replace(/```openscad\n?/g, '').replace(/```\n?/g, '');

  // If response has multiple parts, try to find the OpenSCAD code section
  const lines = code.split('\n');
  const codeLines: string[] = [];
  let inCodeSection = false;

  for (const line of lines) {
    // Start capturing when we see parameter declarations or OpenSCAD keywords
    if (
      line.match(/^\w+\s*=\s*.+;/) || // Parameter declaration
      line.match(/^(module|function|use|include)\s/) || // OpenSCAD keywords
      line.match(/^(cube|sphere|cylinder|union|difference|intersection)\(/) // Primitives
    ) {
      inCodeSection = true;
    }

    if (inCodeSection) {
      codeLines.push(line);
    }
  }

  // If we captured something, use it; otherwise use the full response
  const finalCode = codeLines.length > 5 ? codeLines.join('\n') : code;

  return finalCode.trim();
}

// Helper to intelligently determine number of variations based on request
function determineVariationCount(description: string, requestedCount?: number): number {
  // If user explicitly requested a number, honor it
  if (requestedCount !== undefined && requestedCount > 0) {
    return Math.max(1, Math.min(requestedCount, 4));
  }

  const lowerDesc = description.toLowerCase();

  // Keywords suggesting user wants multiple options/exploration
  const exploreKeywords = [
    'variations', 'options', 'different', 'alternatives', 'compare',
    'explore', 'brainstorm', 'ideas', 'possibilities', 'approaches'
  ];

  // Keywords suggesting user wants a single quick design
  const singleKeywords = [
    'make', 'create a', 'design a', 'quick', 'simple', 'just',
    'can you make', 'i need a', 'build me'
  ];

  // Keywords suggesting extensive exploration
  const extensiveKeywords = [
    'show me lots', 'many', 'all the', 'every', 'maximum'
  ];

  // Check for extensive exploration (4 variations)
  if (extensiveKeywords.some(keyword => lowerDesc.includes(keyword))) {
    console.log('Extensive exploration requested - generating 4 variations');
    return 4;
  }

  // Check for explicit exploration (3 variations)
  if (exploreKeywords.some(keyword => lowerDesc.includes(keyword))) {
    console.log('Exploration requested - generating 3 variations');
    return 3;
  }

  // Check for single design request (1 variation)
  if (singleKeywords.some(keyword => lowerDesc.includes(keyword))) {
    console.log('Single design requested - generating 1 variation');
    return 1;
  }

  // Default: 2 variations (balanced approach)
  console.log('Default request - generating 2 variations');
  return 2;
}

// Helper to generate variation title
function generateVariationTitle(index: number, description: string, focus?: string): string {
  if (focus) {
    return `Variation ${index + 1}: ${focus}`;
  }

  const defaultTitles = [
    `Variation ${index + 1}: Compact`,
    `Variation ${index + 1}: Spacious`,
    `Variation ${index + 1}: Modular`,
    `Variation ${index + 1}: Streamlined`,
  ];

  return defaultTitles[index] || `Variation ${index + 1}`;
}

/**
 * Pre-validate OpenSCAD code before returning to client
 * Mirrors validation logic from openSCAD.ts to catch errors early
 */
function validateCodeSafety(code: string): string | null {
  // 1. Check for scale() with division expressions (INSTANT CRASH)
  if (/scale\s*\(\s*\[[^\]]*\/[^\]]*\]\s*\)/.test(code)) {
    return "Code contains scale() with division expression - causes INSTANT WASM crash";
  }

  // 2. Check for linear_extrude + rotate + center=true (KNOWN CRASH PATTERN)
  if (/rotate.*linear_extrude.*center\s*=\s*true|linear_extrude.*center\s*=\s*true.*rotate/.test(code)) {
    return "Code contains linear_extrude(center=true) with rotate() - known crash pattern";
  }

  // 3. Check for excessive hull() count
  const hullCount = (code.match(/hull\s*\(/g) || []).length;
  if (hullCount > 6) {
    return `Too many hull() operations (${hullCount} > 6)`;
  }

  // 4. Check for extreme scale ratios in literal values
  const scaleMatches = code.match(/scale\s*\(\s*\[([^\]]+)\]\s*\)/g);
  if (scaleMatches) {
    for (const match of scaleMatches) {
      const values = match.match(/\[([\d., ]+)\]/)?.[1];
      if (values) {
        const nums = values.split(',').map(v => parseFloat(v.trim())).filter(n => !isNaN(n));
        if (nums.length >= 3) {
          const maxVal = Math.max(...nums);
          const minVal = Math.min(...nums);
          if (minVal > 0 && maxVal / minVal > 5) {
            return `Scale ratio too extreme (${maxVal.toFixed(1)}:${minVal.toFixed(1)} > 5:1)`;
          }
          if (minVal < 0.7) {
            return `Scale factor too small (${minVal.toFixed(2)} < 0.7)`;
          }
        }
      }
    }
  }

  // 5. Check for primitive count
  const primitiveCount = (code.match(/\b(sphere|cube|cylinder)\s*\(/g) || []).length;
  if (primitiveCount > 30) {
    return `Too many primitives (${primitiveCount} > 30)`;
  }

  return null; // Passed all validations
}

// Generate a single variation
async function generateVariation(
  anthropic: Anthropic,
  description: string,
  variationIndex: number,
  isVoiceMode: boolean,
  focus?: string,
): Promise<VariationResult> {
  let systemPrompt = getBrainstormSystemPrompt({
    isVoiceMode,
    variationIndex,
  });

  // 🛡️ SAFETY: Detect if this is a refinement (user modifying existing design)
  // Common refinement keywords indicate user wants to modify, not create new
  const isRefinement = description.toLowerCase().includes('transform') ||
                       description.toLowerCase().includes('make it') ||
                       description.toLowerCase().includes('make this') ||
                       description.toLowerCase().includes('add a ') ||
                       description.toLowerCase().includes('add ') ||
                       description.toLowerCase().includes('change') ||
                       description.toLowerCase().includes('bigger') ||
                       description.toLowerCase().includes('smaller') ||
                       description.toLowerCase().includes('taller') ||
                       description.toLowerCase().includes('wider') ||
                       description.toLowerCase().includes('modify');

  // ✅ UNIVERSAL SAFETY RULES: Apply to ALL generations to prevent WASM crashes
  console.log('[Voice CAD] Adding universal safety rules to prevent WASM crashes');
  systemPrompt += `

🛡️ CRITICAL OPENSCAD SAFETY RULES (PREVENT WASM CRASHES):

**MANDATORY CONSTRAINTS FOR ALL DESIGNS:**

1. **SCALE OPERATIONS - EXTREMELY DANGEROUS:**
   ❌ NEVER: scale([1, 1, 0.4]) → creates degenerate geometry, WASM crash
   ❌ NEVER: scale([1, 1, 0.3]) → too flat, numerical instability
   ❌ NEVER: scale([1, 1, 5.0]) → too stretched, causes crashes
   ✅ SAFE: scale([1, 1, 1.2]) → moderate scaling (0.7 to 1.5 range)
   ✅ SAFE: Use cylinder(r=10, h=2) instead of scale([1,1,0.2]) sphere(r=10)

   **Scale factor limits:**
   - Minimum: 0.7 (no squashing below 70%)
   - Maximum: 1.5 (no stretching above 150%)

2. **FOR FLAT SHAPES (lids, plates, bases):**
   ❌ NEVER use scaled spheres: scale([1,1,0.4]) sphere()
   ✅ ALWAYS use cylinders: cylinder(r=radius, h=small_height)

3. **HULL() OPERATIONS:**
   - Maximum 6 hull() operations per design
   - Sphere separation ≥ sum of their radii
   - NEVER use multiple hull() inside difference()

4. **GEOMETRY LIMITS:**
   - Maximum 30 primitives (spheres, cubes, cylinders)
   - Maximum sphere radius: 80
   - Maximum height: 200
   - All dimensions must be positive

5. **LITERAL NUMBERS IN SCALE():**
   ❌ BAD: scale([1, 1, height/radius]) → WASM crash
   ✅ GOOD: scale([1, 1, 1.2]) → works

**VIOLATION = INSTANT WASM CRASH - USER LOSES ALL WORK!**
`;

  if (isRefinement) {
    console.log('[Voice CAD] Adding additional refinement-specific constraints');
    systemPrompt += `

🛡️ REFINEMENT-SPECIFIC RULES:

**YOU ARE REFINING AN EXISTING DESIGN - BE CONSERVATIVE!**

1. Make MINIMAL changes - only adjust what user requested
2. DO NOT restructure hull() operations
3. DO NOT add new hull() operations
4. Maximum 30% parameter change per refinement
5. If user wants bigger/taller:
   - Increase z-positions MORE than radii to maintain separation
   - Don't just scale everything up

**Remember: The universal safety rules above STILL APPLY!**
`;
  }

  const baseUserPrompt = focus
    ? `${description}\n\nFocus this variation on: ${focus}`
    : description;

  // 🔄 RETRY LOOP: Attempt generation up to 3 times with validation
  const MAX_ATTEMPTS = 3;
  let lastError: string | null = null;
  let attempt = 0;

  while (attempt < MAX_ATTEMPTS) {
    attempt++;
    console.log(`[Retry ${attempt}/${MAX_ATTEMPTS}] Generating variation ${variationIndex}`);

    try {
      // Build prompt with error feedback from previous attempt
      let userPrompt = baseUserPrompt;
      if (lastError) {
        userPrompt += `\n\n⚠️ PREVIOUS ATTEMPT FAILED VALIDATION:\n${lastError}\n\n✅ Fix this specific issue and regenerate. Use literal numbers in scale(), avoid division expressions.`;
      }

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 20000, // Must be greater than budget_tokens
        system: systemPrompt,
        thinking: {
          type: 'enabled',
          budget_tokens: 10000, // Reduced from 15000 for faster generation
        },
        messages: [{
          role: 'user',
          content: userPrompt,
        }],
      });

      // Extract code from response
      let code = '';
      let reasoning = '';

      for (const block of response.content) {
        if (block.type === 'thinking') {
          reasoning = block.thinking || '';
        } else if (block.type === 'text') {
          code += block.text;
        }
      }

      // Clean up the code
      code = extractOpenSCADCode(code);

      // ✅ PRE-VALIDATE CODE BEFORE RETURNING
      const validationError = validateCodeSafety(code);
      if (validationError) {
        lastError = validationError;
        console.log(`[Attempt ${attempt}] Validation failed: ${validationError}`);

        // If this was the last attempt, use template fallback
        if (attempt >= MAX_ATTEMPTS) {
          console.log('[Final Attempt Failed] Using template fallback...');
          return generateTemplateVariation(description, variationIndex);
        }

        // Otherwise, retry with error feedback
        continue;
      }

      // ✅ SUCCESS! Code passed validation
      console.log(`[Attempt ${attempt}] Success! Code passed validation.`);

      // Parse parameters
      const parameters = parseParameters(code);

      // Generate title
      const title = generateVariationTitle(variationIndex, description, focus);

      return {
        variation_index: variationIndex,
        title,
        code,
        parameters,
        reasoning: reasoning || undefined,
      };

    } catch (error) {
      lastError = `Generation error: ${error.message}`;
      console.error(`[Attempt ${attempt}] Error:`, error);

      // If this was the last attempt, use template fallback
      if (attempt >= MAX_ATTEMPTS) {
        console.log('[All Attempts Failed] Using template fallback...');
        return generateTemplateVariation(description, variationIndex);
      }

      // Otherwise, retry
      continue;
    }
  }

  // Should never reach here, but fallback just in case
  console.log('[Unexpected] Retry loop exhausted, using template fallback');
  return generateTemplateVariation(description, variationIndex);
}

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Check auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Parse request body
    const body: VariationRequest = await req.json();
    const {
      description,
      num_variations,
      variation_focus = [],
      is_voice_mode = false,
    } = body;

    if (!description) {
      return new Response(
        JSON.stringify({ error: 'Missing description parameter' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // For voice mode, always generate just 1 design (like text-to-CAD)
    // For regular brainstorm mode, intelligently determine number of variations
    const validatedNumVariations = is_voice_mode
      ? 1
      : determineVariationCount(description, num_variations);

    // Initialize Anthropic
    const anthropic = new Anthropic({
      apiKey: Deno.env.get('ANTHROPIC_API_KEY'),
    });

    // Generate all variations in parallel
    console.log(`Generating ${validatedNumVariations} variations for: ${description}`);

    const variationPromises = Array.from(
      { length: validatedNumVariations },
      (_, index) =>
        generateVariation(
          anthropic,
          description,
          index,
          is_voice_mode,
          variation_focus[index]
        )
    );

    const variations = await Promise.all(variationPromises);

    console.log(`Successfully generated ${variations.length} variations`);

    // Return all variations
    return new Response(
      JSON.stringify({ variations }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in brainstorm-generate function:', error);

    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
