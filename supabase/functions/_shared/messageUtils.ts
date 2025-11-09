import { CoreMessage } from '@shared/types.ts';
import { SupabaseClient } from './supabaseClient.ts';
import { ContentBlockParam } from 'https://esm.sh/@anthropic-ai/sdk@0.53.0/resources/messages.d.mts';

/**
 * Reformats a Supabase signed URL to use the correct host (local ngrok or production)
 * This is needed because signed URLs use the internal Supabase URL, but we need the external host
 */
export function reformatSignedUrl(signedUrl: string): string {
  const supabaseHost =
    (Deno.env.get('ENVIRONMENT') === 'local'
      ? Deno.env.get('NGROK_URL')
      : Deno.env.get('SUPABASE_URL')
    )?.trim() ?? '';

  const url = new URL(signedUrl);
  return `${supabaseHost}${url.pathname}${url.search}`;
}

export async function getSignedUrl(
  supabaseClient: SupabaseClient,
  bucket: string,
  path: string,
): Promise<string | null> {
  const { data: rawImageUrl } = await supabaseClient.storage
    .from(bucket)
    .createSignedUrl(path, 60 * 60);

  if (!rawImageUrl?.signedUrl) {
    return null;
  }

  return reformatSignedUrl(rawImageUrl.signedUrl);
}

export async function getSignedUrls(
  supabaseClient: SupabaseClient,
  bucket: string,
  paths: string[],
): Promise<string[]> {
  const { data: signedUrls } = await supabaseClient.storage
    .from(bucket)
    .createSignedUrls(paths, 60 * 60);

  return signedUrls
    ? signedUrls
        .filter((image) => !image.error && image.signedUrl)
        .map((image) => reformatSignedUrl(image.signedUrl))
    : [];
}

// Format user message blocks (supports text, error context and signed image URLs)
export async function formatUserMessage(
  message: CoreMessage,
  supabaseClient: SupabaseClient,
  userId: string,
  conversationId: string,
): Promise<{
  role: 'user';
  content: ContentBlockParam[];
}> {
  const parts: ContentBlockParam[] = [];

  if (message.content.text) {
    parts.push({ type: 'text', text: message.content.text });
  }

  if (message.content.error) {
    parts.push({
      type: 'text',
      text: `The OpenSCAD code generated has failed to compile and has given the following error, fix any syntax, logic, parameter, library, or other issues: ${message.content.error}`,
    });
  }

  if (message.content.images?.length) {
    const imageFiles = message.content.images.map(
      (imageId) => `${userId}/${conversationId}/${imageId}`,
    );
    const imageInputs = await getSignedUrls(
      supabaseClient,
      'images',
      imageFiles,
    );

    if (imageInputs.length > 0) {
      parts.push({
        type: 'text',
        text: `ANALYZE THESE REFERENCE IMAGES CAREFULLY to create an accurate 3D CAD model:

🔍 VISUAL ANALYSIS REQUIRED:
1. Identify the main object and its purpose
2. Measure relative proportions and dimensions (height vs width vs depth ratios)
3. Note all geometric features: shapes, curves, angles, symmetries
4. Identify structural elements: edges, corners, surfaces, holes, extrusions
5. Observe patterns, repetitions, and modular components
6. Extract text or symbolic elements (if present) and their depth/relief
7. Determine material thickness and wall dimensions
8. Note mounting features, connection points, or functional elements

🎯 CONVERSION GUIDELINES:
- Convert 2D visual information into 3D geometry with appropriate depth
- Maintain accurate proportions from the reference image
- Include all visible features (don't simplify unless structurally necessary)
- For text/logos: use linear_extrude() with appropriate depth
- For mounting: add proper holes, posts, or attachment points
- Consider printability: add adequate wall thickness (2-4mm minimum)

Reference image IDs: ${message.content.images.join(', ')}`,
      });
      parts.push(
        ...imageInputs.map((image) => ({
          type: 'image' as const,
          source: { type: 'url' as const, url: image },
        })),
      );
    } else {
      parts.push({
        type: 'text',
        text: `User uploaded ${message.content.images.length} reference image(s) with IDs: ${message.content.images.join(', ')}`,
      });
    }
  }

  if (message.content.stl_files?.length) {
    const stlFilePaths = message.content.stl_files.map(
      (fileId) => `${userId}/${conversationId}/${fileId}`,
    );
    const stlUrls = await getSignedUrls(
      supabaseClient,
      'cad-files',
      stlFilePaths,
    );

    if (stlUrls.length > 0) {
      parts.push({
        type: 'text',
        text: `📁 USER UPLOADED STL FILE - Follow their instructions to modify or recreate it:

🎯 YOUR TASK:
The user has uploaded an STL file that is currently displayed in their viewport. Based on their text prompt, you should:

1. **If they want modifications** (e.g., "make it bigger", "add holes", "change dimensions"):
   - Create parametric OpenSCAD code that recreates the design with their requested changes
   - Maintain the general shape and features of the original
   - Add parameters for customization

2. **If they want analysis** (e.g., "what is this?"):
   - They can already see the STL, so acknowledge it and ask what they want to do with it

3. **If they want a new parametric version**:
   - Recreate the geometry in OpenSCAD with full parametric control
   - Add customizable parameters (dimensions, features, etc.)

⚠️ IMPORTANT:
- OpenSCAD cannot import or use STL files directly
- You must RECREATE the geometry using OpenSCAD primitives (cube, cylinder, sphere, etc.)
- Follow the user's text instructions precisely
- Make the design fully parametric with adjustable parameters

STL file reference: ${message.content.stl_files.join(', ')}
Available at: ${stlUrls.join(', ')}`,
      });
    } else {
      parts.push({
        type: 'text',
        text: `User uploaded ${message.content.stl_files.length} STL reference file(s) with IDs: ${message.content.stl_files.join(', ')}`,
      });
    }
  }

  return { role: 'user', content: parts };
}
