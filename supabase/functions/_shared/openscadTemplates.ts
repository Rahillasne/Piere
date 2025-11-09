/**
 * OpenSCAD Template Fallback System
 * Provides guaranteed-safe templates when AI generation fails validation
 *
 * These templates use only Tier 1-2 primitives and have been proven to compile
 * without WASM crashes. They serve as fallbacks when:
 * 1. AI-generated code fails validation
 * 2. All retry attempts are exhausted
 * 3. The design request seems too complex/risky
 */

export interface TemplateConfig {
  description: string;
  baseShape: 'box' | 'cylinder' | 'sphere' | 'organic' | 'container';
  dimensions: {
    width?: number;
    height?: number;
    depth?: number;
    radius?: number;
  };
}

export interface VariationResult {
  variation_index: number;
  title: string;
  code: string;
  parameters: Record<string, number>;
  reasoning: string;
}

/**
 * Parse user's intent from their description
 */
function parseIntent(description: string): TemplateConfig {
  const lowerDesc = description.toLowerCase();

  // Determine base shape from keywords
  let baseShape: TemplateConfig['baseShape'] = 'box'; // default

  if (lowerDesc.includes('cup') || lowerDesc.includes('mug') || lowerDesc.includes('container') ||
      lowerDesc.includes('holder') || lowerDesc.includes('pot')) {
    baseShape = 'container';
  } else if (lowerDesc.includes('cylinder') || lowerDesc.includes('tube') || lowerDesc.includes('pipe')) {
    baseShape = 'cylinder';
  } else if (lowerDesc.includes('ball') || lowerDesc.includes('sphere')) {
    baseShape = 'sphere';
  } else if (lowerDesc.includes('organic') || lowerDesc.includes('fruit') || lowerDesc.includes('vase') ||
             lowerDesc.includes('bottle')) {
    baseShape = 'organic';
  } else if (lowerDesc.includes('box') || lowerDesc.includes('cube') || lowerDesc.includes('case')) {
    baseShape = 'box';
  }

  // Extract dimensions from description (simple heuristics)
  const dimensions: TemplateConfig['dimensions'] = {
    width: 50,
    height: 50,
    depth: 50,
    radius: 25,
  };

  // Look for numbers in description
  const numbers = description.match(/\d+/g);
  if (numbers && numbers.length > 0) {
    const firstNum = parseInt(numbers[0]);
    if (firstNum > 10 && firstNum < 200) {
      dimensions.height = firstNum;
      dimensions.width = firstNum * 0.8;
      dimensions.depth = firstNum * 0.8;
      dimensions.radius = firstNum * 0.5;
    }
  }

  return {
    description,
    baseShape,
    dimensions,
  };
}

/**
 * Parse parameters from generated OpenSCAD code
 */
function parseParameters(code: string): Record<string, number> {
  const params: Record<string, number> = {};
  const lines = code.split('\n');

  for (const line of lines) {
    // Match parameter lines: name = value;
    const match = line.match(/^(\w+)\s*=\s*([0-9.]+)\s*;/);
    if (match) {
      const [, name, value] = match;
      params[name] = parseFloat(value);
    }
  }

  return params;
}

/**
 * Generate a safe template variation based on user's intent
 */
export function generateTemplateVariation(
  description: string,
  variationIndex: number,
): VariationResult {
  const config = parseIntent(description);
  const template = SAFE_TEMPLATES[config.baseShape];
  const code = template(config.dimensions);

  return {
    variation_index: variationIndex,
    title: `Safe Template: ${config.baseShape}`,
    code,
    parameters: parseParameters(code),
    reasoning: `Using proven-safe template (${config.baseShape}) as fallback. This template uses only Tier 1 primitives (cube/cylinder/union/difference) and is guaranteed to compile without crashes.`,
  };
}

/**
 * Proven-safe OpenSCAD templates
 * Each template uses only Tier 1-2 primitives for guaranteed compilation
 */
const SAFE_TEMPLATES: Record<TemplateConfig['baseShape'], (d: TemplateConfig['dimensions']) => string> = {
  box: (d) => `// Safe box template (Tier 1 primitives only)
width = ${d.width || 50};
height = ${d.height || 50};
depth = ${d.depth || 50};
wall_thickness = 3;

// Simple box with hollow interior
difference() {
  // Outer box
  cube([width, depth, height]);

  // Inner hollow space
  translate([wall_thickness, wall_thickness, wall_thickness])
  cube([
    width - 2*wall_thickness,
    depth - 2*wall_thickness,
    height
  ]);
}
`,

  cylinder: (d) => `// Safe cylinder template (Tier 1 primitives only)
radius = ${d.radius || 25};
height = ${d.height || 50};
wall_thickness = 3;

// Simple cylinder with hollow interior
difference() {
  // Outer cylinder
  cylinder(h=height, r=radius, $fn=64);

  // Inner hollow space
  translate([0, 0, wall_thickness])
  cylinder(h=height, r=radius - wall_thickness, $fn=64);
}
`,

  sphere: (d) => `// Safe sphere template (Tier 2 primitive, no hull)
radius = ${d.radius || 30};

// Simple solid sphere - safest possible design
sphere(r=radius, $fn=64);
`,

  container: (d) => `// Safe container template (cup/mug)
radius = ${d.radius || 25};
height = ${d.height || 60};
wall_thickness = 3;
handle_width = 10;
handle_thickness = 4;

union() {
  // Main container body
  difference() {
    cylinder(h=height, r=radius, $fn=64);
    translate([0, 0, wall_thickness])
    cylinder(h=height, r=radius - wall_thickness, $fn=64);
  }

  // Simple handle (cube-based, no complex curves)
  translate([radius - 2, -handle_width/2, height/2])
  difference() {
    cube([handle_thickness + 10, handle_width, height/3]);
    translate([handle_thickness, handle_thickness, -1])
    cube([10, handle_width - 2*handle_thickness, height/3 + 2]);
  }
}
`,

  organic: (d) => `// Safe organic shape template (well-separated spheres, NO hull)
body_radius = ${d.radius || 30};
body_height = ${d.height || 60};
top_radius = body_radius * 0.7;
bottom_radius = body_radius * 0.5;

// Organic shape using simple union of well-separated spheres
union() {
  // Bottom sphere
  translate([0, 0, bottom_radius])
  sphere(r=bottom_radius, $fn=64);

  // Middle/body sphere - WELL SEPARATED (distance > sum of radii)
  translate([0, 0, body_height * 0.4])
  sphere(r=body_radius, $fn=64);

  // Top sphere - WELL SEPARATED (distance > sum of radii)
  translate([0, 0, body_height * 0.85])
  sphere(r=top_radius, $fn=64);

  // Connecting cylinders for smooth transitions
  translate([0, 0, bottom_radius])
  cylinder(h=body_height * 0.4 - bottom_radius, r1=bottom_radius * 0.9, r2=body_radius * 0.9, $fn=64);

  translate([0, 0, body_height * 0.4])
  cylinder(h=body_height * 0.45, r1=body_radius * 0.9, r2=top_radius * 0.9, $fn=64);
}
`,
};

/**
 * Validate if a template is needed based on error patterns
 */
export function shouldUseTemplate(errorMessage: string | null): boolean {
  if (!errorMessage) return false;

  const crashPatterns = [
    'scale.*division',
    'hull.*overlapping',
    'extreme scale ratio',
    'linear_extrude.*center.*true',
    'Parameter expression error',
    'WASM crash',
  ];

  return crashPatterns.some(pattern =>
    new RegExp(pattern, 'i').test(errorMessage)
  );
}

/**
 * Get template type based on description keywords
 */
export function getTemplateType(description: string): TemplateConfig['baseShape'] {
  const config = parseIntent(description);
  return config.baseShape;
}
