import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { Anthropic } from 'https://esm.sh/@anthropic-ai/sdk@0.53.0';
import {
  ContentBlockParam,
  MessageParam,
} from 'https://esm.sh/@anthropic-ai/sdk@0.53.0/resources/messages.d.mts';
import {
  Message,
  Model,
  Content,
  CoreMessage,
  ParametricArtifact,
} from '@shared/types.ts';
import { getAnonSupabaseClient } from '../_shared/supabaseClient.ts';
import Tree from '@shared/Tree.ts';
import parseParameters from '../_shared/parseParameter.ts';
import { formatUserMessage, reformatSignedUrl } from '../_shared/messageUtils.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { optimizeAIRequest } from '../_shared/aiOptimizer.ts';

// Helper to stream updated assistant message rows
function streamMessage(
  controller: ReadableStreamDefaultController,
  message: Message,
) {
  controller.enqueue(new TextEncoder().encode(JSON.stringify(message) + '\n'));
}

// Helper to escape regex special characters
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function generateTitleFromMessages(
  anthropic: Anthropic,
  messagesToSend: MessageParam[],
): Promise<string> {
  try {
    const titleSystemPrompt = `You are a helpful assistant that generates very concise, descriptive titles for 3D CAD conversations. Your titles should be:
1. Very brief (maximum 30 characters - this is strict!)
2. Descriptive of the main object being discussed
3. Focus on the object name, not the action
4. Clear and professional
5. Without quotes, special formatting, or ending punctuation
6. Consider the entire conversation context
7. Use 2-4 words maximum

Examples of good titles:
- "Desk Organizer"
- "Keyboard Case"
- "Storage Box"
- "Monitor Stand"
- "Phone Holder"`;

    const titleResponse = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 30,
      system: titleSystemPrompt,
      messages: [
        ...messagesToSend,
        {
          role: 'user',
          content:
            'Generate a very short title (max 30 characters) for this 3D design.',
        },
      ],
    });

    if (
      Array.isArray(titleResponse.content) &&
      titleResponse.content.length > 0
    ) {
      const lastContent =
        titleResponse.content[titleResponse.content.length - 1];
      if (lastContent.type === 'text') {
        let title = lastContent.text.trim();
        // Remove quotes if present
        title = title.replace(/^["']|["']$/g, '');
        // Truncate if still too long
        if (title.length > 30) title = title.substring(0, 27) + '...';
        return title;
      }
    }
  } catch (error) {
    console.error('Error generating object title:', error);
  }

  // Fallbacks - create a more descriptive title from the last user message
  let lastUserMessage: MessageParam | undefined;
  for (let i = messagesToSend.length - 1; i >= 0; i--) {
    if (messagesToSend[i].role === 'user') {
      lastUserMessage = messagesToSend[i];
      break;
    }
  }

  const extractTitle = (text: string): string => {
    // Clean up the text
    let cleaned = text.trim();
    // Remove common prefixes
    cleaned = cleaned.replace(/^(create|make|design|build|generate|model)\s+/i, '');
    // Take words up to 30 characters
    const words = cleaned.split(/\s+/);
    let title = '';
    for (const word of words) {
      if ((title + ' ' + word).trim().length > 30) break;
      title += (title ? ' ' : '') + word;
    }
    return title.trim() || 'New Design';
  };

  if (lastUserMessage && typeof lastUserMessage.content === 'string') {
    return extractTitle(lastUserMessage.content as string);
  } else if (lastUserMessage && Array.isArray(lastUserMessage.content)) {
    const textContent = lastUserMessage.content.find(
      (block: ContentBlockParam) => block.type === 'text',
    );
    if (textContent && 'text' in textContent) {
      return extractTitle(textContent.text as string);
    }
  }

  return 'New Design';
}

// Simplified system prompt for direct OpenSCAD code generation
const OPENSCAD_SYSTEM_PROMPT = `You are Pierre, an AI CAD editor that creates parametric OpenSCAD models.

Your job is simple:
1. Read the user's request
2. Generate clean, parametric OpenSCAD code that creates the requested 3D model
3. Include parameters at the top of the code for customization
4. Ensure the code is syntactically correct and creates a manifold, 3D-printable object

RESPONSE FORMAT:
- Return ONLY OpenSCAD code, nothing else
- No explanations, no markdown, no code blocks - just raw OpenSCAD code
- Start directly with parameter declarations
- Include parameters at the top for user customization
- Add brief comments to explain complex sections

PARAMETER FORMAT (CRITICAL):
Parameters MUST be declared in this exact format at the top of the file:
- Format: parameter_name = value;
- One parameter per line
- No extra spaces around the equals sign (just one space on each side)
- Optional comment after the semicolon
- Examples:
  height = 100;
  radius = 25;
  wall_thickness = 3; // Optional comment
  use_base = true;

CODE REQUIREMENTS:
- Declare ALL adjustable values as parameters at the top
- Use descriptive parameter names (width, height, radius, thickness, etc.)
- Use proper OpenSCAD syntax (cube(), sphere(), cylinder(), etc.)
- Combine shapes with union(), difference(), intersection()
- Make the model manifold and 3D-printable
- Keep it simple and focused on the user's request

🚨🚨 CRITICAL: HULL() CRASHES IF MISUSED 🚨🚨

**NEVER use hull() with overlapping/close spheres - this causes INSTANT WASM CRASH!**

SAFE hull() usage:
✅ sphere(r=20) at z=0 + sphere(r=15) at z=40 → distance=40 ≥ 35 (sum of radii) = SAFE
❌ sphere(r=20) at z=10 + sphere(r=15) at z=25 → distance=15 < 35 (sum of radii) = CRASH!

**FOR ORGANIC SHAPES (fruits, bottles, vases, anything round):**
- ❌ DON'T: Use hull() with multiple spheres
- ✅ DO: Use scale() on single or well-separated spheres
- ✅ DO: Use rotate_extrude() for symmetric shapes
- ✅ DO: Use union() of scaled spheres with proper spacing

**Example - Creating rounded/organic shapes:**
❌ BAD: hull() { sphere(r=30); translate([0,0,20]) sphere(r=20); } → CRASHES!
✅ GOOD: union() { scale([1.2,1.2,0.9]) sphere(r=30); translate([0,0,40]) scale([0.6,0.6,1.1]) sphere(r=20); } → WORKS!

**OpenSCAD Capabilities:**
- Geometric primitives: cube(), sphere(), cylinder(), polyhedron()
- Boolean operations: union(), difference(), intersection()
- Transformations: translate(), rotate(), scale(), mirror()
- Extrusions: linear_extrude(), rotate_extrude()
- hull() for smooth organic shapes (USE WITH EXTREME CAUTION - see warning above!)

**Examples:**

User: "a mug"
Assistant:
// Mug parameters
cup_height = 100;
cup_radius = 40;
handle_radius = 30;
handle_thickness = 10;
wall_thickness = 3;

difference() {
    union() {
        // Main cup body
        cylinder(h=cup_height, r=cup_radius);

        // Handle
        translate([cup_radius-5, 0, cup_height/2])
        rotate([90, 0, 0])
        difference() {
            torus(handle_radius, handle_thickness/2);
            torus(handle_radius, handle_thickness/2 - wall_thickness);
        }
    }

    // Hollow out the cup
    translate([0, 0, wall_thickness])
    cylinder(h=cup_height, r=cup_radius-wall_thickness);
}

module torus(r1, r2) {
    rotate_extrude()
    translate([r1, 0, 0])
    circle(r=r2);
}

User: "a simple fish"
Assistant:
// Fish parameters
body_length = 60;
body_width = 25;
body_height = 20;
tail_width = 15;
tail_length = 25;
fin_size = 12;

union() {
    // Main body using hull for organic shape
    hull() {
        // Front of fish (pointed)
        translate([body_length/2, 0, 0])
        sphere(r=5);

        // Middle sections for smooth body
        for(i = [0:3]) {
            translate([body_length/4 - i*body_length/12, 0, 0])
            scale([1, 1.2, 1])  // Use literal numbers, never parameter divisions (prevents WASM crashes)
            sphere(r=body_height/2);
        }
    }

    // Tail fin
    hull() {
        translate([-body_length/2, 0, 0])
        sphere(r=3);

        translate([-body_length/2 - tail_length, tail_width/2, 0])
        sphere(r=2);

        translate([-body_length/2 - tail_length, -tail_width/2, 0])
        sphere(r=2);
    }

    // Top fin
    hull() {
        translate([body_length/6, 0, body_height/2])
        sphere(r=2);

        translate([body_length/6, 0, body_height/2 + fin_size])
        sphere(r=1);

        translate([0, 0, body_height/2 + fin_size])
        sphere(r=1);
    }

    // Side fins (pectoral)
    for(side = [-1, 1]) {
        hull() {
            translate([body_length/4, side * body_width/2, 0])
            sphere(r=2);

            translate([body_length/4 + fin_size, side * (body_width/2 + fin_size/2), -fin_size/2])
            sphere(r=1);
        }
    }
}

User: "a basic character head"
Assistant:
// Character head parameters
head_size = 40;
eye_spacing = 20;
eye_size = 8;
pupil_size = 4;
mouth_width = 25;
mouth_height = 5;
ear_size = 15;

union() {
    // Main head
    sphere(r=head_size);

    // Eyes (white part)
    for(side = [-1, 1]) {
        translate([side * eye_spacing/2, head_size * 0.5, head_size * 0.3])
        sphere(r=eye_size);
    }

    // Ears using hull for smooth attachment
    for(side = [-1, 1]) {
        hull() {
            translate([side * head_size * 0.7, 0, head_size * 0.5])
            sphere(r=5);

            translate([side * head_size * 0.9, 0, head_size * 0.8])
            sphere(r=ear_size/2);
        }
    }
}

// Subtract features
difference() {
    // Add the positive shapes
    union() {
        sphere(r=head_size);
        for(side = [-1, 1]) {
            translate([side * eye_spacing/2, head_size * 0.5, head_size * 0.3])
            sphere(r=eye_size);

            hull() {
                translate([side * head_size * 0.7, 0, head_size * 0.5])
                sphere(r=5);
                translate([side * head_size * 0.9, 0, head_size * 0.8])
                sphere(r=ear_size/2);
            }
        }
    }

    // Pupils (subtract from eyes)
    for(side = [-1, 1]) {
        translate([side * eye_spacing/2, head_size * 0.6, head_size * 0.3])
        sphere(r=pupil_size);
    }

    // Mouth
    translate([0, head_size * 0.8, head_size * 0.1])
    rotate([80, 0, 0])
    scale([mouth_width, mouth_height, mouth_height])
    sphere(r=1);
}`;

// Enhanced system prompt specifically for image-to-CAD conversion
const IMAGE_TO_CAD_SYSTEM_PROMPT = `You are Pierre, an AI CAD editor with advanced vision capabilities that creates parametric OpenSCAD models from reference images.

Your job when analyzing images:
1. CAREFULLY ANALYZE the reference image(s) to understand the object's structure
2. Extract accurate proportions, dimensions, and geometric features
3. Generate clean, parametric OpenSCAD code that faithfully recreates what you see
4. Include all visible features - don't oversimplify

CRITICAL VISION ANALYSIS STEPS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📐 DIMENSION & PROPORTION EXTRACTION:
   - Analyze the object's aspect ratios (height:width:depth)
   - Identify relative sizes of different components
   - Estimate appropriate absolute dimensions for 3D printing

🔷 GEOMETRIC FEATURE IDENTIFICATION:
   - Shapes: circles, rectangles, polygons, curves
   - Count vertices (e.g., octagon has 8 sides)
   - Identify symmetries and patterns
   - Note chamfers, fillets, and edge treatments

🎨 STRUCTURAL ELEMENTS:
   - Text and logos (use linear_extrude with appropriate depth)
   - Borders and frames (measure thickness)
   - Mounting holes and posts
   - Surface relief and depth variations
   - Connection mechanisms

🧩 3D INTERPRETATION FROM 2D:
   - Estimate appropriate depth/thickness for flat objects
   - For signs/badges: typically 3-10mm base thickness
   - For text: typically 1-3mm extrusion depth
   - For functional parts: consider structural requirements

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

RESPONSE FORMAT:
- Return ONLY OpenSCAD code, nothing else
- No explanations, no markdown, no code blocks - just raw OpenSCAD code
- Start directly with parameter declarations
- Include parameters for all key dimensions
- Add brief comments to explain vision-based decisions

PARAMETER FORMAT (CRITICAL):
Parameters MUST be declared in this exact format at the top of the file:
- Format: parameter_name = value;
- One parameter per line
- No extra spaces around the equals sign (just one space on each side)
- Optional comment after the semicolon
- Examples:
  sign_size = 100; // Octagonal stop sign diameter
  border_width = 4;
  text_depth = 2; // Raised text extrusion
  base_thickness = 3;
  mounting_hole_diameter = 8;

CODE REQUIREMENTS FOR IMAGE-BASED MODELS:
- Accurately represent all visible features from the image
- Maintain correct proportions (use aspect ratios from image)
- Include text/logos if visible (use text() with linear_extrude())
- Add mounting features if shown in the image
- Use appropriate polygon counts (e.g., $fn for circles/cylinders)
- Make the model manifold and 3D-printable
- Don't oversimplify - capture the details you see

**OpenSCAD Techniques for Image Conversion:**

For Text (if visible in image):
  linear_extrude(height=text_depth)
  text("STOP", size=font_size, font="Arial:style=Bold",
       halign="center", valign="center");

For Polygons (e.g., octagon, hexagon):
  cylinder(h=thickness, r=radius, $fn=8); // 8 sides for octagon

For Borders/Frames:
  difference() {
    outer_shape();
    inner_shape(); // Slightly smaller
  }

For Mounting Holes:
  cylinder(h=thickness*2, r=hole_radius, center=true, $fn=32);

**Example Image-to-CAD Conversions:**

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Example 1: Stop Sign from Image
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
User: [uploads image of a stop sign]
"create this as a 3D model"

Vision Analysis:
- Shape: Red octagon (8-sided polygon)
- Text: "STOP" in white, centered, bold
- Border: White border around edge
- Colors: Red background (#FF0000), white text/border
- Proportions: Standard stop sign is ~750mm wide in real life
- Features: Flat sign face, needs mounting holes

Assistant (Generated Code):
// Stop Sign Parameters
sign_size = 100; // Octagonal diameter
border_width = 4;
text_depth = 2; // Raised text
base_thickness = 3;
mounting_hole_diameter = 8;
mounting_hole_spacing = 80;

$fn = 64; // Smooth circles

difference() {
    union() {
        // Main octagonal sign body
        cylinder(h=base_thickness, r=sign_size/2, $fn=8);

        // Raised "STOP" text
        translate([0, 0, base_thickness])
        linear_extrude(height=text_depth)
        text("STOP", size=sign_size*0.35, font="Arial:style=Bold",
             halign="center", valign="center");

        // White border (slightly raised)
        translate([0, 0, base_thickness + text_depth])
        linear_extrude(height=0.5)
        difference() {
            circle(r=sign_size/2);
            circle(r=sign_size/2 - border_width);
            $fn = 8;
        }
    }

    // Mounting holes
    for(angle = [0, 180]) {
        rotate([0, 0, angle])
        translate([mounting_hole_spacing/2, 0, -1])
        cylinder(h=base_thickness + 4, r=mounting_hole_diameter/2);
    }
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

KEY PRINCIPLE: When you see an image, ANALYZE IT THOROUGHLY before generating code.
Don't create a generic shape - create an ACCURATE representation of what you see.
Include text, logos, mounting features, and all visible structural details.
`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', {
      status: 405,
      headers: corsHeaders,
    });
  }

  const supabaseClient = getAnonSupabaseClient({
    global: {
      headers: { Authorization: req.headers.get('Authorization') ?? '' },
    },
  });

  const { data: userData, error: userError } =
    await supabaseClient.auth.getUser();
  if (!userData.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  if (userError) {
    return new Response(JSON.stringify({ error: userError.message }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const {
    messageId,
    conversationId,
    model,
    newMessageId,
  }: {
    messageId: string;
    conversationId: string;
    model: Model;
    newMessageId: string;
  } = await req.json();

  const { data: messages, error: messagesError } = await supabaseClient
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .overrideTypes<Array<{ content: Content; role: 'user' | 'assistant' }>>();
  if (messagesError) {
    return new Response(
      JSON.stringify({
        error:
          messagesError instanceof Error
            ? messagesError.message
            : 'Unknown error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      },
    );
  }
  if (!messages || messages.length === 0) {
    return new Response(JSON.stringify({ error: 'Messages not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  // Insert placeholder assistant message that we will stream updates into
  let content: Content = { model };
  const { data: newMessageData, error: newMessageError } = await supabaseClient
    .from('messages')
    .insert({
      id: newMessageId,
      conversation_id: conversationId,
      role: 'assistant',
      content,
      parent_message_id: messageId,
    })
    .select()
    .single()
    .overrideTypes<{ content: Content; role: 'assistant' }>();
  if (!newMessageData) {
    return new Response(
      JSON.stringify({
        error:
          newMessageError instanceof Error
            ? newMessageError.message
            : 'Unknown error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      },
    );
  }

  try {
    const messageTree = new Tree<Message>(messages);
    const newMessage = messages.find((m) => m.id === messageId);
    if (!newMessage) {
      throw new Error('Message not found');
    }
    const currentMessageBranch = messageTree.getPath(newMessage.id);

    const messagesToSend: MessageParam[] = (
      await Promise.all(
        currentMessageBranch.map((msg: CoreMessage) => {
          if (msg.role === 'user') {
            return formatUserMessage(
              msg,
              supabaseClient,
              userData.user.id,
              conversationId,
            );
          }
          // Assistant messages: send code or text from history as plain text
          return {
            role: 'assistant' as const,
            content: [
              {
                type: 'text' as const,
                text: msg.content.artifact
                  ? msg.content.artifact.code || ''
                  : msg.content.text || '',
              },
            ],
          };
        }),
      )
    ).flat();

    const anthropic = new Anthropic({
      apiKey: Deno.env.get('ANTHROPIC_API_KEY') ?? '',
    });

    console.log('[CAD Generation] Starting simplified pipeline');
    console.log('[CAD Generation] Messages to send:', messagesToSend.length);
    console.log('[CAD Generation] User message:', newMessage.content.text?.substring(0, 100));

    const responseStream = new ReadableStream({
      async start(controller) {
        try {
          console.log('[CAD Generation] Making AI request...');

          // Detect if the current message has images or STL files
          const hasImages = newMessage.content.images && newMessage.content.images.length > 0;
          const hasStlFiles = newMessage.content.stl_files && newMessage.content.stl_files.length > 0;
          const hasReferenceFiles = hasImages || hasStlFiles;
          console.log('[CAD Generation] Has reference images:', hasImages);
          console.log('[CAD Generation] Has STL files:', hasStlFiles);

          // 🛡️ SAFETY: Detect if this is a refinement request
          // A refinement is when there's previous OpenSCAD code in the conversation
          console.log('[CAD Generation] currentMessageBranch length:', currentMessageBranch.length);
          console.log('[CAD Generation] currentMessageBranch roles:', currentMessageBranch.map((m: CoreMessage) => m.role).join(', '));

          // 🔍 IMPROVED REFINEMENT DETECTION (fixes voice-to-CAD v2+ crashes)
          // Check for previous OpenSCAD code using robust criteria:
          // 1. Has substantial code (>50 chars) - more reliable than looking for '//'
          // 2. Multiple messages in branch indicates version progression
          const hasExistingCode = currentMessageBranch.some(
            (msg: CoreMessage) =>
              msg.role === 'assistant' &&
              msg.content.artifact?.code &&
              msg.content.artifact.code.length > 50 // Has substantial OpenSCAD code
          );

          let isRefinement = currentMessageBranch.length > 1 && hasExistingCode;

          // 🎤 VOICE MODE: Now supports refinements just like text-to-CAD!
          // Safety rules in system prompt prevent WASM crashes
          const isVoiceMode = model === 'pierre';
          if (isVoiceMode && isRefinement) {
            console.log('[CAD Generation] Voice mode refinement detected - using same safety rules as text-to-CAD');
          }

          console.log('[CAD Generation] Is refinement request:', isRefinement);
          console.log('[CAD Generation] Refinement detection details:', {
            branchLength: currentMessageBranch.length,
            hasExistingCode,
            assistantMessageCount: currentMessageBranch.filter((m: CoreMessage) => m.role === 'assistant').length,
            codeLength: currentMessageBranch
              .filter((m: CoreMessage) => m.role === 'assistant' && m.content.artifact?.code)
              .map((m: CoreMessage) => m.content.artifact?.code?.length || 0),
          });
          console.log('[CAD Generation] Reason:',
            currentMessageBranch.length <= 1
              ? `Only ${currentMessageBranch.length} message(s) in branch - this is v1`
              : hasExistingCode
              ? `Branch has ${currentMessageBranch.length} messages with existing OpenSCAD code - this is v${currentMessageBranch.filter((m: CoreMessage) => m.role === 'assistant').length + 1}`
              : 'Multiple messages but no previous OpenSCAD code found - treating as v1'
          );

          // Use AI optimizer to determine best configuration
          const optimization = optimizeAIRequest({
            userPrompt: newMessage.content.text || '',
            hasReferenceImage: hasReferenceFiles,
            isRefinement,
            previousAttemptFailed: Boolean(newMessage.content.error),
          });

          console.log('[CAD Generation] Optimization:', {
            hasImages,
            hasStlFiles,
            hasReferenceFiles,
            isRefinement,
            useExtendedThinking: optimization.shouldUseExtendedThinking,
            temperature: optimization.optimizedTemperature,
            reasoning: optimization.reasoning,
            complexityScore: optimization.complexityScore,
          });

          // Select appropriate system prompt based on reference file presence (images or STL)
          let systemPrompt = hasReferenceFiles
            ? IMAGE_TO_CAD_SYSTEM_PROMPT
            : OPENSCAD_SYSTEM_PROMPT;

          console.log('[CAD Generation] Using system prompt:',
            hasReferenceFiles ? 'IMAGE_TO_CAD_SYSTEM_PROMPT' : 'OPENSCAD_SYSTEM_PROMPT'
          );
          console.log('[CAD Generation] System prompt length:', systemPrompt.length);

          // Voice mode uses SAME prompting as text-to-CAD - no special instructions needed
          if (isVoiceMode) {
            console.log('[CAD Generation] Voice mode detected - using standard text-to-CAD prompting');
          }

          // 🛡️ SAFETY: Add refinement safety instructions to prevent WASM crashes
          if (isRefinement) {
            console.log('[CAD Generation] Adding refinement safety rules to system prompt');
            systemPrompt += `

🛡️ CRITICAL REFINEMENT SAFETY RULES (PREVENT WASM CRASHES):

You are modifying an EXISTING design. The user has requested changes to previous code.

**MANDATORY SAFETY CONSTRAINTS:**
1. Make MINIMAL changes - only adjust parameters, DO NOT restructure hull() operations
2. If user says "bigger/larger/increase size":
   - Increase z-positions MORE than radii to maintain sphere separation
   - Maximum 30% size change per refinement to prevent complexity explosion
   - Ensure distance between hull spheres ≥ sum of their radii
3. Preserve existing safe geometry - DO NOT add new hull() operations
4. 🚨 **SCALE() SAFETY (MOST CRITICAL)**:
   - **NEVER EVER use expressions in scale()** - ❌ scale([1, 1, h/r]) = INSTANT CRASH
   - **ONLY use literal numbers** - ✅ scale([1, 1, 1.5]) = SAFE
   - Keep scale ratios under 5:1 (e.g., avoid scale([1,1,20]))
   - Minimum scale factor must be ≥ 0.7 (updated from 0.3 for stability)
   - For large spheres (r>50), use ONLY uniform scaling
   - Examples:
     • ❌ FORBIDDEN: scale([1, 1, height/radius]) → INSTANT WASM CRASH
     • ❌ FORBIDDEN: scale([w/2, 1, h/2]) → INSTANT CRASH
     • ✅ SAFE: scale([1, 1, 1.5]) → literal numbers only
     • ✅ SAFE: scale([0.8, 1.2, 1.0]) → all factors ≥ 0.7
5. **TEMPLATE FALLBACK**: If modification seems risky (e.g., adding hull/scale):
   - Fall back to proven safe approach (simple union of spheres/cylinders)
   - Apply user's size requirements to safe template
   - Guarantee compilation success over complexity
6. Parameter size limits:
   - Sphere radius ≤ 80
   - Height ≤ 200
   - All dimensions must be positive

**WHY THESE RULES:**
- Extreme scale ratios cause numerical instability → WASM crash
- **Dynamic expressions in scale() cause WASM runtime errors** (use literal numbers only)
- Large radii with scaling create excessive polygons → out of memory
- Overlapping hull spheres create degenerate geometry → WASM crash

**YOUR APPROACH:**
- Modify ONLY the parameters mentioned by the user
- Keep the overall structure and hull() operations intact
- When in doubt, make conservative changes (smaller adjustments)`;
          }

          // 🧠 PHASE 4.2: Add pre-generation thinking instructions when extended thinking is enabled
          if (optimization.shouldUseExtendedThinking) {
            console.log('[CAD Generation] Adding extended thinking instructions');
            systemPrompt += `

🧠 EXTENDED THINKING: Plan approach, detect crash risks (hull overlaps, scale expressions, extrude+rotate), validate ranges.`;
          }

          // 🛡️ PHASE 4.3: Compact safety checklist (streamlined for speed)
          systemPrompt += `

🛡️ VERIFY: No scale() expressions (ONLY literals). No hull() overlaps. No extrude(center=true)+rotate(). Radii≤80, Height≤200, Scale 0.7-5x.`;

          // Build AI request parameters
          const aiRequestParams: any = {
            model: 'claude-sonnet-4-5-20250929',
            system: systemPrompt,
            max_tokens: 16000,
            messages: messagesToSend,
            temperature: optimization.optimizedTemperature,
          };

          console.log('[CAD Generation] AI request config:', {
            model: aiRequestParams.model,
            systemPromptLength: systemPrompt.length,
            messageCount: messagesToSend.length,
            temperature: optimization.optimizedTemperature,
            hasExtendedThinking: optimization.shouldUseExtendedThinking,
          });

          // Log the user's actual request
          const userMessage = messagesToSend[messagesToSend.length - 1];
          if (userMessage && userMessage.role === 'user') {
            const userContent = Array.isArray(userMessage.content)
              ? userMessage.content.find((c: any) => c.type === 'text')?.text || ''
              : userMessage.content || '';
            console.log('[CAD Generation] User request:', userContent.substring(0, 200));
          }

          // Enable extended thinking for complex tasks (especially with images)
          if (optimization.shouldUseExtendedThinking) {
            aiRequestParams.thinking = {
              type: 'enabled',
              budget_tokens: optimization.thinkingBudget,
            };
            console.log('[CAD Generation] Extended thinking enabled with budget:', optimization.thinkingBudget);
          }

          // 🎯 PHASE 4.4: Two-Stage Generation for Ultra-Complex Designs (DISABLED FOR SPEED)
          let codeResponse: PromiseFulfilledResult<any> | PromiseRejectedResult;
          const shouldUseTwoStage = false; // Disabled for maximum speed - was: optimization.shouldUseExtendedThinking && optimization.complexityScore >= 8

          if (shouldUseTwoStage) {
            console.log('[CAD Generation] Using TWO-STAGE generation (complexity:', optimization.complexityScore, ')');

            // STAGE 1: Request design description + validation
            const stage1Prompt = systemPrompt + `

🎯 TWO-STAGE GENERATION MODE - STAGE 1

This is STAGE 1: Design Description & Planning.

Provide a detailed design description including:
1. **Geometric approach** - Which primitives (cube, cylinder, sphere) and operations (union, difference) you'll use
2. **Parameter plan** - List 3-8 parameters with their purpose and safe default values
3. **Safety verification** - Confirm no crash-prone patterns (no overlapping spheres in hull, no scale expressions, no linear_extrude+rotate+center)
4. **Estimated complexity** - Count of primitives, hull operations, boolean operations

Do NOT generate OpenSCAD code yet. Just describe your approach in detail.
Output format:
GEOMETRIC APPROACH: [description]
PARAMETERS: [list with values]
SAFETY CHECK: [verification]
COMPLEXITY: [counts]
`;

            try {
              const stage1Response = await anthropic.messages.create({
                model: aiRequestParams.model,
                max_tokens: 8000,
                system: stage1Prompt,
                messages: messagesToSend,
                thinking: {
                  type: 'enabled',
                  budget_tokens: 8000,
                },
                temperature: aiRequestParams.temperature,
              });

              // Extract description from stage 1
              let description = '';
              for (const block of stage1Response.content) {
                if (block.type === 'text') {
                  description += block.text;
                }
              }

              console.log('[CAD Generation] STAGE 1 complete, description length:', description.length);

              // STAGE 2: Generate code based on validated description
              const stage2Prompt = systemPrompt + `

🎯 TWO-STAGE GENERATION MODE - STAGE 2

This is STAGE 2: Code Generation.

You previously described this approach:

${description}

Now generate the OpenSCAD code implementing this exact design.
Return ONLY OpenSCAD code following your plan. No additional explanations.
Ensure all safety rules from STAGE 1 are followed.
`;

              const stage2Response = await anthropic.messages.create({
                model: aiRequestParams.model,
                max_tokens: 16000,
                system: stage2Prompt,
                messages: [
                  ...messagesToSend,
                  {
                    role: 'assistant',
                    content: description,
                  },
                  {
                    role: 'user',
                    content: 'Generate the OpenSCAD code for this design.',
                  },
                ],
                thinking: {
                  type: 'enabled',
                  budget_tokens: 7000,
                },
                temperature: aiRequestParams.temperature,
              });

              console.log('[CAD Generation] STAGE 2 complete, code generation done');
              codeResponse = { status: 'fulfilled', value: stage2Response } as PromiseFulfilledResult<any>;

            } catch (error) {
              console.error('[CAD Generation] Two-stage generation failed, falling back to single-stage');
              codeResponse = { status: 'rejected', reason: error } as PromiseRejectedResult;
            }

          } else {
            // Standard single-stage generation
            console.log('[CAD Generation] Using SINGLE-STAGE generation (complexity:', optimization.complexityScore, ')');

            const response = await anthropic.messages.create(aiRequestParams);
            codeResponse = { status: 'fulfilled', value: response } as PromiseFulfilledResult<any>;
          }

          // Make title generation request in parallel with final response processing
          const [, titleResponse] = await Promise.allSettled([
            Promise.resolve(codeResponse), // Already resolved/rejected above
            generateTitleFromMessages(anthropic, messagesToSend),
          ]);

          console.log('[CAD Generation] AI response status:', codeResponse.status);

          // Extract the generated OpenSCAD code
          let code = '';
          let aiResponseText = '';

          if (codeResponse.status === 'fulfilled') {
            const response = codeResponse.value;
            console.log('[CAD Generation] Response content blocks:', response.content.length);

            // ✅ IMPROVED: Log block types and skip thinking blocks
            const blockTypes = response.content.map(b => b.type).join(', ');
            console.log('[CAD Generation] Block types:', blockTypes);

            // Find text content in the response (skip thinking blocks)
            for (const block of response.content) {
              if (block.type === 'text') {
                console.log('[CAD Generation] Processing text block (length:', block.text.length, ')');
                aiResponseText += block.text;
              } else if (block.type === 'thinking') {
                console.log('[CAD Generation] Skipping thinking block (length:', block.thinking?.length || 0, ')');
                // Skip thinking blocks - they contain internal reasoning, not code
              } else {
                console.log('[CAD Generation] Unknown block type:', block.type);
              }
            }

            console.log('[CAD Generation] AI response length:', aiResponseText.length);
            console.log('[CAD Generation] AI response preview:', aiResponseText.substring(0, 300));

            // The AI should return pure OpenSCAD code
            // Clean it up if needed (remove markdown code blocks, etc.)
            code = aiResponseText.trim();

            // Remove markdown code blocks if present
            if (code.startsWith('```')) {
              console.log('[CAD Generation] Removing markdown code blocks...');
              code = code.replace(/```(?:openscad|scad)?\n?/g, '').replace(/```$/g, '').trim();
            }

            console.log('[CAD Generation] Extracted code length:', code.length);
            console.log('[CAD Generation] Code preview:', code.substring(0, 200));

            // ✅ VALIDATION: Check if code looks like OpenSCAD
            const hasOpenSCADKeywords = /\b(module|function|cube|sphere|cylinder|translate|rotate|union|difference|intersection)\b/.test(code);
            if (!hasOpenSCADKeywords && code.length > 0) {
              console.warn('[CAD Generation] ⚠️ Extracted text does not contain OpenSCAD keywords!');
              console.warn('[CAD Generation] Full extracted text:', aiResponseText.substring(0, 500));
            } else if (code.length > 0) {
              console.log('[CAD Generation] ✅ Valid OpenSCAD code detected');
            }
          } else {
            console.error('[CAD Generation] AI request failed:', codeResponse.reason);
          }

          // Generate title
          let title = 'Pierre Model';
          if (titleResponse.status === 'fulfilled') {
            title = titleResponse.value;
            const lower = title.toLowerCase();
            if (lower.includes('sorry') || lower.includes('apologize')) {
              title = 'Pierre Model';
            }
          }
          console.log('[CAD Generation] Generated title:', title);

          // Create the artifact with code and parameters
          if (code && code.length > 0) {
            console.log('[CAD Generation] Parsing parameters from code...');
            const parameters = parseParameters(code);
            console.log('[CAD Generation] Found parameters:', parameters.length);

            const artifact: ParametricArtifact = {
              title,
              version: 'v1',
              code,
              parameters,
            };

            content = {
              ...content,
              artifact,
              text: `Here's your ${title}! You can adjust the parameters on the left to customize it.`,
            };

            console.log('[CAD Generation] ✅ Artifact created successfully');
          } else {
            console.error('[CAD Generation] ❌ No code generated!');
            content = {
              ...content,
              text: 'Sorry, I was unable to generate the CAD model. Please try rephrasing your request or being more specific.',
            };
          }

          // Stream the final message
          streamMessage(controller, { ...newMessageData, content });

        } catch (error) {
          console.error('[CAD Generation] ❌ Error:', error);
          content = {
            ...content,
            text: 'An error occurred while generating your model. Please try again.',
          };
        } finally {
          // Save to database
          const { data: finalMessageData } = await supabaseClient
            .from('messages')
            .update({ content })
            .eq('id', newMessageData.id)
            .select()
            .single()
            .overrideTypes<{ content: Content; role: 'assistant' }>();

          if (finalMessageData) {
            streamMessage(controller, finalMessageData as Message);
          }

          console.log('[CAD Generation] Pipeline complete');
          controller.close();
        }
      },
    });

    return new Response(responseStream, {
      headers: {
        'Content-Type': 'text/plain',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        ...corsHeaders,
      },
    });
  } catch (error) {
    console.error(error);

    if (!content.text && !content.artifact) {
      content = {
        ...content,
        text: 'An error occurred while processing your request.',
      };
    }

    const { data: updatedMessageData } = await supabaseClient
      .from('messages')
      .update({ content })
      .eq('id', newMessageData.id)
      .select()
      .single()
      .overrideTypes<{ content: Content; role: 'assistant' }>();

    if (updatedMessageData) {
      return new Response(JSON.stringify({ message: updatedMessageData }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      },
    );
  }
});
