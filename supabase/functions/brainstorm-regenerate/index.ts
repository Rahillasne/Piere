import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { Anthropic } from 'https://esm.sh/@anthropic-ai/sdk@0.53.0';
import parseParameters from '../_shared/parseParameter.ts';
import { corsHeaders } from '../_shared/cors.ts';

/**
 * Brainstorm Regenerate Edge Function
 *
 * Regenerates failed OpenSCAD code with error context
 * Used when compilation fails - provides error feedback to Claude for automatic fix
 *
 * Request body:
 * {
 *   original_code: string;        // The code that failed
 *   error_message: string;         // Compilation error message
 *   stderr_output?: string[];      // OpenSCAD stderr output
 *   description?: string;          // Original user request (optional)
 * }
 */

interface RegenerateRequest {
  original_code: string;
  error_message: string;
  stderr_output?: string[];
  description?: string;
}

/**
 * Extract OpenSCAD code from Claude's response
 */
function extractOpenSCADCode(text: string): string {
  // Remove markdown code blocks
  let cleanedText = text.replace(/```openscad\n?/g, '').replace(/```\n?/g, '');

  // If the text starts with a parameter declaration or OpenSCAD keyword, assume it's all code
  const codeStartPattern = /^(\s*\/\/.*\n)*\s*(\w+\s*=|module|function|use|include|cube|sphere|cylinder|union|difference)/m;

  if (codeStartPattern.test(cleanedText)) {
    return cleanedText.trim();
  }

  // Otherwise, try to find the code section
  const lines = cleanedText.split('\n');
  const codeLines: string[] = [];
  let inCodeBlock = false;

  for (const line of lines) {
    if (codeStartPattern.test(line)) {
      inCodeBlock = true;
    }

    if (inCodeBlock) {
      codeLines.push(line);
    }
  }

  return codeLines.length > 0 ? codeLines.join('\n').trim() : cleanedText.trim();
}

const REGENERATION_SYSTEM_PROMPT = `You are an expert OpenSCAD code repair specialist. Your task is to fix broken OpenSCAD code.

🔧 REGENERATION MODE (ERROR RECOVERY):

You will receive:
1. OpenSCAD code that FAILED compilation
2. The specific error message from the compiler
3. OpenSCAD stderr output (if available)

Your task:
1. **Analyze the error carefully** - understand the root cause
2. **Fix the specific issue** - don't rewrite from scratch, just fix the problem
3. **Validate the fix** - ensure it follows all safety rules
4. **Return corrected OpenSCAD code**

🛡️ CRITICAL SAFETY RULES (MUST FOLLOW):

**SCALE() OPERATIONS:**
- ❌ NEVER use expressions in scale(): scale([1, 1, h/r]) → CRASH
- ✅ ONLY use literal numbers: scale([1, 1, 1.5]) → SAFE
- Keep scale ratios under 5:1
- Minimum scale factor ≥ 0.7

**HULL() OPERATIONS:**
- Ensure spheres in hull() are well-separated (distance ≥ sum of radii)
- Maximum 6 hull() operations per design
- NEVER use overlapping spheres

**LINEAR_EXTRUDE:**
- NEVER combine linear_extrude(center=true) with rotate()
- For roofs/pitched structures, use rotated cubes instead

**PARAMETER LIMITS:**
- Sphere radius ≤ 80
- Height ≤ 200
- All dimensions must be positive

**OUTPUT FORMAT:**
Return ONLY the corrected OpenSCAD code. No explanations, no markdown code blocks.
Just the raw OpenSCAD code that will compile successfully.
`;

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Parse request body
    const { original_code, error_message, stderr_output, description }: RegenerateRequest = await req.json();

    if (!original_code || !error_message) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: original_code and error_message' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log('[Regenerate] Attempting to fix failed code');
    console.log('[Regenerate] Error:', error_message);

    // Initialize Anthropic client
    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicApiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable not set');
    }
    const anthropic = new Anthropic({ apiKey: anthropicApiKey });

    // Build error context prompt
    let errorContext = `The previous code FAILED compilation with this error:\n${error_message}\n`;

    if (stderr_output && stderr_output.length > 0) {
      errorContext += `\nOpenSCAD stderr output:\n${stderr_output.join('\n')}\n`;
    }

    if (description) {
      errorContext += `\nOriginal user request: ${description}\n`;
    }

    errorContext += `\nFailed code:\n${original_code}\n`;
    errorContext += `\nYour task: Fix this code to make it compile successfully. Focus on the specific error.`;

    // Call Claude to regenerate
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 16000,
      system: REGENERATION_SYSTEM_PROMPT,
      thinking: {
        type: 'enabled',
        budget_tokens: 6000, // Reduced from 10000 for faster regeneration
      },
      messages: [{
        role: 'user',
        content: errorContext,
      }],
    });

    // Extract fixed code
    let fixedCode = '';
    for (const block of response.content) {
      if (block.type === 'text') {
        fixedCode += block.text;
      }
    }

    fixedCode = extractOpenSCADCode(fixedCode);

    // Parse parameters from fixed code
    const parameters = parseParameters(fixedCode);

    console.log('[Regenerate] Successfully generated fixed code');

    return new Response(
      JSON.stringify({
        code: fixedCode,
        parameters,
        regenerated: true,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('[Regenerate] Error:', error);
    return new Response(
      JSON.stringify({
        error: error.message || 'Failed to regenerate code',
        details: error.toString(),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
