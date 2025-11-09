import { default as openscad } from '@lib/openscad-wasm/openscad.js';
import { ZipReader, BlobReader, Uint8ArrayWriter } from '@zip.js/zip.js';
import type { OpenSCAD } from '@lib/openscad-wasm/openscad.d.ts';
import WorkspaceFile from '../lib/WorkspaceFile.ts';

import {
  FileSystemWorkerMessageData,
  OpenSCADWorkerMessageData,
  OpenSCADWorkerResponseData,
} from './types';
import OpenSCADError from '@/lib/OpenSCADError';
import { libraries } from '@/lib/libraries.ts';

// Credit
// https://github.com/seasick/openscad-web-gui/blob/main/src/worker/openSCAD.ts

/**
 * Validate OpenSCAD code complexity to prevent crashes and hangs
 * Returns an error message if the code is too complex, otherwise null
 */
function validateCodeComplexity(code: string): string | null {
  // Count potentially problematic operations
  const hullCount = (code.match(/hull\s*\(/g) || []).length;
  const sphereCount = (code.match(/sphere\s*\(/g) || []).length;
  const cylinderCount = (code.match(/cylinder\s*\(/g) || []).length;
  const scaleCount = (code.match(/scale\s*\(/g) || []).length;
  const unionCount = (code.match(/union\s*\(/g) || []).length;
  const differenceCount = (code.match(/difference\s*\(/g) || []).length;

  // Check for excessive hull operations (most expensive)
  if (hullCount > 6) {
    return `Code complexity error: Too many hull() operations (${hullCount} found, max 6 allowed). Hull operations are computationally expensive and can cause compilation to hang.`;
  }

  // Check for too many primitives
  const totalPrimitives = sphereCount + cylinderCount;
  if (totalPrimitives > 30) {
    return `Code complexity error: Too many primitives (${totalPrimitives} spheres/cylinders found, max 30 allowed).`;
  }

  // Check for dangerous combination: hull + many scales
  if (hullCount > 0 && scaleCount > 10) {
    return `Code complexity error: Complex hull+scale combination (${hullCount} hulls with ${scaleCount} scales). This combination often causes compilation failures.`;
  }

  // Check for excessive nesting of boolean operations
  const totalBooleanOps = unionCount + differenceCount;
  if (totalBooleanOps > 10) {
    return `Code complexity error: Too many boolean operations (${totalBooleanOps} union/difference operations found, max 10 allowed).`;
  }

  // All checks passed
  return null;
}

/**
 * Parse OpenSCAD parameter definitions from code
 * Returns a map of variable names to their numeric values
 */
function parseParameters(code: string): Map<string, number> {
  const params = new Map<string, number>();

  // Match parameter definitions: param_name = value;
  const paramRegex = /^([a-zA-Z_]\w*)\s*=\s*([^;]+);/gm;
  const matches = [...code.matchAll(paramRegex)];

  for (const match of matches) {
    const name = match[1].trim();
    const valueStr = match[2].trim();

    // Try to evaluate as a simple number
    if (/^-?\d+\.?\d*$/.test(valueStr)) {
      params.set(name, parseFloat(valueStr));
    }
  }

  return params;
}

/**
 * Evaluate a simple OpenSCAD expression with variable substitution
 * Supports: numbers, variables, +, -, *, /, parentheses
 */
function evalExpression(expr: string, context: Map<string, number>): number | null {
  try {
    // Remove whitespace
    expr = expr.replace(/\s+/g, '');

    // Direct number
    if (/^-?\d+\.?\d*$/.test(expr)) {
      return parseFloat(expr);
    }

    // Direct variable lookup
    if (/^[a-zA-Z_]\w*$/.test(expr) && context.has(expr)) {
      return context.get(expr)!;
    }

    // Simple arithmetic expression
    // Replace variables with their values
    let evaluableExpr = expr;
    for (const [name, value] of context.entries()) {
      // Use word boundary to avoid partial replacements
      const regex = new RegExp(`\\b${name}\\b`, 'g');
      evaluableExpr = evaluableExpr.replace(regex, value.toString());
    }

    // Check if all variables were replaced (should only contain numbers and operators)
    if (/[a-zA-Z_]/.test(evaluableExpr)) {
      // Still contains variables we don't know
      return null;
    }

    // Safe evaluation of simple math expressions
    // Only allow numbers, operators, and parentheses
    if (!/^[\d\s+\-*/.()]+$/.test(evaluableExpr)) {
      return null;
    }

    // Use Function constructor for safe evaluation (no access to scope)
    const result = new Function(`return ${evaluableExpr}`)();
    return typeof result === 'number' && !isNaN(result) ? result : null;
  } catch {
    return null;
  }
}

/**
 * Validate difference() operations to prevent degenerate geometry that crashes WASM
 * Returns an error message if difference geometry is invalid, otherwise null
 */
function validateDifferenceGeometry(code: string): string | null {
  // Only validate if difference() is present
  if (!code.includes('difference()')) {
    return null;
  }

  const paramContext = parseParameters(code);

  // Check for cylinder in difference() with center=true and excessive height
  const cylinderPattern = /cylinder\s*\([^)]*h\s*=\s*([^,)]+)[^)]*d(?:iameter)?\s*=\s*([^,)]+)[^)]*center\s*=\s*true/g;
  const cylinders = [...code.matchAll(cylinderPattern)];

  for (const cylinder of cylinders) {
    const hStr = cylinder[1].trim();
    const dStr = cylinder[2].trim();

    const h = evalExpression(hStr, paramContext);
    const d = evalExpression(dStr, paramContext);

    if (h !== null && d !== null) {
      // Check if height is excessive (> 100) or diameter is excessive (> 200)
      if (h > 100 || d > 200) {
        return `Difference geometry error: Cylinder dimensions too large (h=${h.toFixed(1)}, d=${d.toFixed(1)}). Large cylinders with center=true can cause WASM crashes. Try using smaller dimensions or center=false.`;
      }

      // Check for negative dimensions
      if (h <= 0 || d <= 0) {
        return `Difference geometry error: Cylinder has invalid dimensions (h=${h.toFixed(1)}, d=${d.toFixed(1)}). Dimensions must be positive.`;
      }
    }
  }

  // Check for cylinders with radius parameter instead of diameter
  const cylinderRadiusPattern = /cylinder\s*\([^)]*h\s*=\s*([^,)]+)[^)]*r\s*=\s*([^,)]+)[^)]*center\s*=\s*true/g;
  const cylindersWithRadius = [...code.matchAll(cylinderRadiusPattern)];

  for (const cylinder of cylindersWithRadius) {
    const hStr = cylinder[1].trim();
    const rStr = cylinder[2].trim();

    const h = evalExpression(hStr, paramContext);
    const r = evalExpression(rStr, paramContext);

    if (h !== null && r !== null) {
      if (h > 100 || r > 100) {
        return `Difference geometry error: Cylinder dimensions too large (h=${h.toFixed(1)}, r=${r.toFixed(1)}). Large cylinders with center=true can cause WASM crashes. Try using smaller dimensions or center=false.`;
      }

      if (h <= 0 || r <= 0) {
        return `Difference geometry error: Cylinder has invalid dimensions (h=${h.toFixed(1)}, r=${r.toFixed(1)}). Dimensions must be positive.`;
      }
    }
  }

  return null;
}

/**
 * Validate hull geometry to prevent degenerate shapes that crash WASM
 * Returns an error message if hull geometry is invalid, otherwise null
 */
function validateHullGeometry(code: string): string | null {
  // Only validate if hull() is present
  if (!code.includes('hull()')) {
    return null;
  }

  // Parse parameter definitions for variable context
  const paramContext = parseParameters(code);

  // Extract hull blocks (simplified - matches hull() { ... })
  const hullBlockRegex = /hull\s*\(\s*\)\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g;
  const hullMatches = [...code.matchAll(hullBlockRegex)];

  for (const hullMatch of hullMatches) {
    const hullContent = hullMatch[1];

    // Extract sphere operations with translate and scale
    // Pattern: translate([x, y, z]) ... sphere(r=radius)
    const spherePattern = /translate\s*\(\s*\[\s*([^,\]]+)\s*,\s*([^,\]]+)\s*,\s*([^\]]+)\s*\]\s*\)[^]*?sphere\s*\(\s*r\s*=\s*([^)]+)\)/g;
    const spheres = [...hullContent.matchAll(spherePattern)];

    // Need at least 2 spheres to check overlap
    if (spheres.length < 2) {
      continue;
    }

    // Parse sphere positions and radii
    const sphereData: Array<{x: number; y: number; z: number; r: number}> = [];

    for (const sphere of spheres) {
      try {
        // Extract values - handle expressions like "body_height * 0.4"
        const xStr = sphere[1].trim();
        const yStr = sphere[2].trim();
        const zStr = sphere[3].trim();
        const rStr = sphere[4].trim();

        // Evaluate expressions using parameter context
        const x = evalExpression(xStr, paramContext);
        const y = evalExpression(yStr, paramContext);
        const z = evalExpression(zStr, paramContext);
        const r = evalExpression(rStr, paramContext);

        // Only validate if all values could be evaluated
        if (x !== null && y !== null && z !== null && r !== null) {
          sphereData.push({x, y, z, r});
        }
      } catch {
        // Skip this sphere if parsing fails
        continue;
      }
    }

    // Check for overlapping spheres (only if we have numeric data)
    if (sphereData.length >= 2) {
      for (let i = 0; i < sphereData.length; i++) {
        for (let j = i + 1; j < sphereData.length; j++) {
          const s1 = sphereData[i];
          const s2 = sphereData[j];

          // Calculate distance between sphere centers
          const dx = s2.x - s1.x;
          const dy = s2.y - s1.y;
          const dz = s2.z - s1.z;
          const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);

          // Check if spheres overlap or are too close
          // Enhanced safety threshold: 1.5x combined radii for stability margin
          const minSafeSeparation = (s1.r + s2.r) * 1.5;
          const minAbsoluteSeparation = (s1.r + s2.r) * 1.0;

          // CRITICAL: Spheres touching or overlapping = INSTANT CRASH
          if (distance < minAbsoluteSeparation) {
            return `Hull geometry error: Spheres in hull() are overlapping (sphere centers ${distance.toFixed(1)} apart, radii ${s1.r.toFixed(1)} + ${s2.r.toFixed(1)} = ${(s1.r + s2.r).toFixed(1)}). This causes INSTANT OpenSCAD crash. Increase separation to at least ${minSafeSeparation.toFixed(1)} units.`;
          }

          // WARNING: Spheres very close together = high crash risk
          if (distance < minSafeSeparation) {
            return `Hull geometry warning: Spheres in hull() are too close (separation: ${distance.toFixed(1)}, recommended: >${minSafeSeparation.toFixed(1)}). While not overlapping, this creates numerical instability and may crash. Increase separation for safety.`;
          }
        }
      }
    }
  }

  return null;
}

/**
 * Validate scale transformations to prevent extreme ratios and degenerate geometry
 * Returns an error message if scale transforms are problematic, otherwise null
 */
function validateScaleTransforms(code: string): string | null {
  // Only validate if scale() is present
  if (!code.includes('scale(')) {
    return null;
  }

  // Parse parameter definitions for variable context
  const paramContext = parseParameters(code);

  // Match scale transformations: scale([x, y, z]) sphere(r=R)
  // This regex captures scale factors and checks for sphere operations after
  const scalePatternRegex = /scale\s*\(\s*\[([^\]]+)\]\s*\)\s*(?:.*?\n?.*?)sphere\s*\(\s*r\s*=\s*([^)]+)\)/g;
  const matches = [...code.matchAll(scalePatternRegex)];

  for (const match of matches) {
    const scaleFactorsStr = match[1];
    const radiusStr = match[2].trim();

    // Parse scale factors [x, y, z]
    const scaleFactors = scaleFactorsStr.split(',').map(s => {
      const val = evalExpression(s.trim(), paramContext);
      return val !== null ? val : 1;
    });

    if (scaleFactors.length >= 3) {
      const [x, y, z] = scaleFactors;

      // Check for extreme scale ratios (non-uniform scaling)
      const maxScale = Math.max(x, y, z);
      const minScale = Math.min(x, y, z);

      if (minScale > 0 && maxScale / minScale > 5) {
        return `Scale transform error: Extreme scale ratio detected (${maxScale.toFixed(1)}:${minScale.toFixed(1)}). Non-uniform scaling with ratios > 5:1 on spheres causes numerical instability and WASM crashes. Use separate spheres with translate() instead.`;
      }

      // Check for very thin dimensions (degenerate geometry)
      if (minScale < 0.2) {
        return `Scale transform error: Scale factor too small (${minScale.toFixed(2)}). Factors < 0.2 create degenerate geometry that crashes during CSG operations. Increase the minimum scale factor or use thicker geometry.`;
      }

      // Check radius combined with large scale
      const radius = evalExpression(radiusStr, paramContext);
      if (radius !== null && radius > 50 && maxScale > 1.5) {
        return `Scale transform error: Large sphere (r=${radius.toFixed(0)}) with non-uniform scaling detected. This combination creates excessive polygon subdivisions. Reduce sphere radius to < 50 or use uniform scaling only.`;
      }
    }
  }

  return null;
}

/**
 * Validates parameter expressions to prevent WASM crashes
 * Detects dangerous patterns like divisions or complex expressions in critical operations
 *
 * CRITICAL: scale() operations with division expressions cause INSTANT WASM crashes
 * Example crash pattern: scale([1, 1, height/radius])
 *
 * @param code OpenSCAD code to validate
 * @returns Error message if validation fails, null otherwise
 */
function validateParameterExpressions(code: string): string | null {
  // Check for scale() operations with division expressions
  // Pattern: scale([...expression with /...])
  const scaleDivisionRegex = /scale\s*\(\s*\[[^\]]*\/[^\]]*\]\s*\)/;
  if (scaleDivisionRegex.test(code)) {
    return `Parameter expression error: scale() operation contains division expression. This causes INSTANT WASM crash. Use literal numbers only in scale() (e.g., scale([1, 1, 1.5]) not scale([1, 1, height/radius])).`;
  }

  // Check for scale() operations with multiplication/arithmetic that could be divisions
  const scaleComplexExprRegex = /scale\s*\(\s*\[[^\]]*[\+\-\*\/][^\]]*\]\s*\)/;
  if (scaleComplexExprRegex.test(code)) {
    // Allow simple multiplication (e.g., scale([2*1.5, 1, 1])) but warn
    const hasDiv = /scale\s*\(\s*\[[^\]]*\/[^\]]*\]\s*\)/.test(code);
    if (hasDiv) {
      return `Parameter expression error: scale() contains division. Use literal numbers only.`;
    }
    // For other arithmetic, just check if it's not too complex
    const scaleMatches = code.match(/scale\s*\(\s*\[([^\]]+)\]\s*\)/g);
    if (scaleMatches) {
      for (const match of scaleMatches) {
        // Extract the array content
        const arrayContent = match.match(/\[([^\]]+)\]/)?.[1];
        if (arrayContent) {
          // Count operators - if more than 2, it's too complex
          const operatorCount = (arrayContent.match(/[\+\-\*\/]/g) || []).length;
          if (operatorCount > 2) {
            return `Parameter expression error: scale() contains complex expression (${operatorCount} operators). Simplify to literal numbers or simple multiplication only.`;
          }
        }
      }
    }
  }

  return null;
}

/**
 * Validate parameter sizes to prevent out-of-memory crashes
 * Returns an error message if parameters exceed safe limits, otherwise null
 */
function validateParameterSizes(code: string): string | null {
  const params = parseParameters(code);

  // Check for sphere radius parameters
  for (const [name, value] of params) {
    // Check sphere radii
    if (name.toLowerCase().includes('radius') || name.toLowerCase().includes('_r')) {
      if (value > 80) {
        return `Parameter size error: Sphere radius too large (${name}=${value}). Maximum safe radius is 80 to prevent memory exhaustion. Reduce the parameter or split into multiple smaller spheres.`;
      }
    }

    // Check cylinder/sphere heights
    if (name.toLowerCase().includes('height') || name.toLowerCase().includes('_h')) {
      if (value > 200) {
        return `Parameter size error: Height too large (${name}=${value}). Maximum safe height is 200 to prevent excessive polygon count. Consider scaling down your design.`;
      }
    }

    // Check for negative dimensions (invalid geometry)
    if ((name.toLowerCase().includes('radius') ||
         name.toLowerCase().includes('height') ||
         name.toLowerCase().includes('width') ||
         name.toLowerCase().includes('length')) && value < 0) {
      return `Parameter size error: Negative dimension (${name}=${value}). All dimensions must be positive.`;
    }
  }

  return null;
}

/**
 * Validate linear_extrude operations to prevent CGAL/WASM crashes
 * Returns an error message if extrusion patterns are problematic, otherwise null
 */
function validateLinearExtrudeGeometry(code: string): string | null {
  // Only validate if linear_extrude is present
  if (!code.includes('linear_extrude')) {
    return null;
  }

  // CRITICAL PATTERN 1: linear_extrude with center=true combined with rotate()
  // This creates coordinate misalignment that crashes CGAL during boolean operations
  const rotateThenExtrudePattern = /rotate\s*\([^)]+\)\s*(?:[^{]*?\n?)*?linear_extrude\s*\([^)]*center\s*=\s*true[^)]*\)/g;
  const matches1 = [...code.matchAll(rotateThenExtrudePattern)];

  if (matches1.length > 0) {
    return `Linear extrude error: Using linear_extrude(center=true) combined with rotate() causes coordinate misalignment and CGAL crashes. Fix: Use center=false and adjust positioning with translate() instead. Example: translate([0, 0, -height/2]) linear_extrude(height=h) polygon([...])`;
  }

  // CRITICAL PATTERN 2: linear_extrude with center=true on polygon() (common crash pattern)
  const centerExtrudePattern = /linear_extrude\s*\([^)]*center\s*=\s*true[^)]*\)\s*polygon/g;
  const matches2 = [...code.matchAll(centerExtrudePattern)];

  if (matches2.length > 0) {
    return `Linear extrude error: Using center=true with polygon() can cause non-manifold geometry. Recommendation: Use center=false (default) and translate the result if needed. This ensures proper geometry alignment for boolean operations.`;
  }

  // Check for excessive extrusion height
  const heightPattern = /linear_extrude\s*\(\s*height\s*=\s*([^,)]+)/g;
  const heightMatches = [...code.matchAll(heightPattern)];

  for (const match of heightMatches) {
    const heightStr = match[1].trim();

    // Try to evaluate if it's a simple expression
    const params = parseParameters(code);
    const height = evalExpression(heightStr, params);

    if (height !== null && height > 200) {
      return `Linear extrude error: Extrusion height too large (${height}). Maximum safe height is 200. Large extrusions create excessive polygons and can crash WASM. Consider reducing the height parameter.`;
    }
  }

  // Check for complex polygon definitions (>12 points = crash risk)
  const polygonPattern = /polygon\s*\(\s*\[([^\]]+)\]\s*\)/g;
  const polygonMatches = [...code.matchAll(polygonPattern)];

  for (const match of polygonMatches) {
    const pointsStr = match[1];
    // Count array elements (each point is [x,y])
    const arrayDepth = (pointsStr.match(/\[/g) || []).length;

    if (arrayDepth > 12) {
      return `Linear extrude error: Complex polygon with more than 12 points detected. Complex polygons combined with extrusion can cause CGAL assertion failures. Simplify the polygon or use multiple simpler shapes instead.`;
    }
  }

  return null;
}

class OpenSCADWrapper {
  log: { stdErr: string[]; stdOut: string[] } = {
    stdErr: [],
    stdOut: [],
  };

  files: WorkspaceFile[] = [];

  // Persistent WASM instance for 10x performance boost
  private instance: OpenSCAD | null = null;
  private instancePromise: Promise<OpenSCAD> | null = null;

  // Cache for downloaded libraries (in-memory cache)
  private libraryCache = new Map<string, Blob>();

  async getInstance(): Promise<OpenSCAD> {
    // Return existing instance if available
    if (this.instance) {
      return this.instance;
    }

    // Return in-progress instance creation if happening
    if (this.instancePromise) {
      return this.instancePromise;
    }

    // Create new instance
    this.instancePromise = this.createInstance();
    this.instance = await this.instancePromise;
    this.instancePromise = null;

    return this.instance;
  }

  private async createInstance(): Promise<OpenSCAD> {
    const instance = await openscad({
      noInitialRun: true,
      print: this.logger('stdOut'),
      printErr: this.logger('stdErr'),
    });

    // Font loading removed - OpenSCAD works without custom fonts
    // Custom fonts can be added later if needed

    // Create libraries directory
    if (!this.fileExists(instance, '/libraries')) {
      instance.FS.mkdir('/libraries');
    }

    return instance;
  }

  private async syncFilesToInstance(instance: OpenSCAD) {
    for (const file of this.files) {
      // Make sure the directory of the file exists
      if (file.path) {
        const path = file.path.split('/');
        path.pop();
        const dir = path.join('/');

        if (dir && !this.fileExists(instance, dir)) {
          this.createDirectoryRecursive(instance, dir);
        }

        const content = await file.arrayBuffer();
        instance.FS.writeFile(file.path, new Int8Array(content));
      }
    }
  }

  fileExists(instance: OpenSCAD, path: string) {
    try {
      instance.FS.stat(path);
      return true;
    } catch {
      return false;
    }
  }

  createDirectoryRecursive(instance: OpenSCAD, path: string) {
    const parts = path.split('/');
    let currentPath = '';

    for (const part of parts) {
      currentPath += '/' + part;

      if (!this.fileExists(instance, currentPath)) {
        instance.FS.mkdir(currentPath);
      }
    }
  }

  logger = (type: 'stdErr' | 'stdOut') => (text: string) => {
    this.log[type].push(text);
  };

  /**
   *
   * @param data
   * @returns
   */
  async exportFile(
    data: OpenSCADWorkerMessageData,
  ): Promise<OpenSCADWorkerResponseData> {
    const parameters = data.params.map(({ name, type, value }) => {
      if (type === 'string' && typeof value === 'string') {
        value = this.escapeShell(value);
      } else if (type === 'number[]' && Array.isArray(value)) {
        value = `[${value.join(',')}]`;
      } else if (type === 'string[]' && Array.isArray(value)) {
        value = `[${value
          .map((item) => {
            if (typeof item === 'string') return this.escapeShell(item);
          })
          .join(',')}]`;
      }

      return `-D${name}=${value}`;
    });

    parameters.push('--export-format=binstl');
    parameters.push(`--enable=manifold`);
    parameters.push(`--enable=fast-csg`);
    parameters.push(`--enable=lazy-union`);

    return await this.executeOpenscad(data.code, data.fileType, parameters);
  }

  /**
   *
   * @param data
   * @returns
   */
  async preview(
    data: OpenSCADWorkerMessageData,
  ): Promise<OpenSCADWorkerResponseData> {
    const parameters = data.params
      .map(({ name, type, value }) => {
        if (type === 'string' && typeof value === 'string') {
          value = this.escapeShell(value);
        } else if (type === 'number[]' && Array.isArray(value)) {
          value = `[${value.join(',')}]`;
        } else if (type === 'string[]' && Array.isArray(value)) {
          value = `[${value
            .map((item) => {
              if (typeof item === 'string') return this.escapeShell(item);
            })
            .join(',')}]`;
        } else if (type === 'boolean[]' && Array.isArray(value)) {
          value = `[${value.join(',')}]`;
        }
        return `-D${name}=${value}`;
      })
      .filter((x) => !!x);

    const exportParams = [
      '--export-format=binstl',
      '--enable=manifold',
      '--enable=fast-csg',
      '--enable=lazy-union',
      '--enable=roof',
    ];

    const render = await this.executeOpenscad(
      data.code,
      data.fileType,
      parameters.concat(exportParams),
    );

    // Check `render.log.stdErr` for "Current top level object is not a 3d object."
    // and if it is, rerun it with exporting the preview as a SVG.
    if (
      render.log.stdErr.includes('Current top level object is not a 3D object.')
    ) {
      // Create the SVG, which will internally be saved as out.svg
      const svgExport = await this.executeOpenscad(
        data.code,
        'svg',
        parameters.concat([
          '--export-format=svg',
          '--enable=manifold',
          '--enable=fast-csg',
          '--enable=lazy-union',
          '--enable=roof',
        ]),
      );

      if (svgExport.exitCode === 0) {
        return svgExport;
      }

      // If the SVG export failed, return the original error, but add the logs from the SVG export
      render.log.stdErr.push(...svgExport.log.stdErr);
      render.log.stdOut.push(...svgExport.log.stdOut);
    }

    return render;
  }

  async writeFile(data: FileSystemWorkerMessageData) {
    // Filter out any existing file with the same path
    this.files = this.files.filter((file) => file.name !== data.path);

    // Only add the file if content exists
    if (data.content) {
      // Ensure the path is set before adding
      if (!data.content.path) {
        data.content.path = data.path;
      }
      this.files.push(data.content);
    }

    return true; // TODO `boolean` might not be the best thing to return here
  }

  async readFile(
    data: FileSystemWorkerMessageData,
  ): Promise<FileSystemWorkerMessageData> {
    const found = this.files.find((file) => file.name === data.path);

    return {
      path: data.path,
      content: found,
    };
  }

  async unlinkFile(data: FileSystemWorkerMessageData) {
    this.files = this.files.filter((file) => file.name !== data.path);

    return true; // TODO `boolean` might not be the best thing to return here
  }

  /**
   *
   * @param code Code for the OpenSCAD input file
   * @param fileType e.g. STL, AMF, 3MF, OFF, etc
   * @param parameters array of parameters to pass to OpenSCAD
   * @returns
   */
  async executeOpenscad(
    code: string,
    fileType: string,
    parameters: string[],
  ): Promise<OpenSCADWorkerResponseData> {
    const start = Date.now();

    // Reset log
    this.log.stdErr = [];
    this.log.stdOut = [];

    // ✅ VALIDATE CODE COMPLEXITY: Prevent crashes from overly complex geometry
    const complexityError = validateCodeComplexity(code);
    if (complexityError) {
      this.log.stdErr.push(complexityError);
      this.log.stdErr.push('');
      this.log.stdErr.push('Suggestion: Simplify your design by:');
      this.log.stdErr.push('  - Using fewer hull() operations (try direct sphere/cylinder combinations instead)');
      this.log.stdErr.push('  - Reducing the number of scale() transformations');
      this.log.stdErr.push('  - Breaking complex shapes into simpler components');

      throw new OpenSCADError(
        complexityError,
        code,
        this.log.stdErr,
      );
    }

    // ✅ VALIDATE HULL GEOMETRY: Prevent degenerate hulls that crash WASM
    const hullGeometryError = validateHullGeometry(code);
    if (hullGeometryError) {
      this.log.stdErr.push(hullGeometryError);
      this.log.stdErr.push('');
      this.log.stdErr.push('Suggestion: Fix hull geometry by:');
      this.log.stdErr.push('  - Ensuring spheres in hull() are well-separated');
      this.log.stdErr.push('  - Using rotate_extrude() for organic shapes instead of complex hulls');
      this.log.stdErr.push('  - Breaking large hulls into multiple smaller hull operations');

      throw new OpenSCADError(
        hullGeometryError,
        code,
        this.log.stdErr,
      );
    }

    // ✅ VALIDATE DIFFERENCE GEOMETRY: Prevent invalid difference operations that crash WASM
    const differenceGeometryError = validateDifferenceGeometry(code);
    if (differenceGeometryError) {
      this.log.stdErr.push(differenceGeometryError);
      this.log.stdErr.push('');
      this.log.stdErr.push('Suggestion: Fix difference geometry by:');
      this.log.stdErr.push('  - Using smaller cylinder dimensions (h < 100, d/r < 100)');
      this.log.stdErr.push('  - Setting center=false and adjusting position manually');
      this.log.stdErr.push('  - Ensuring hole dimensions are smaller than the object being cut');

      throw new OpenSCADError(
        differenceGeometryError,
        code,
        this.log.stdErr,
      );
    }

    // ✅ VALIDATE SCALE TRANSFORMS: Re-enabled to prevent WASM crashes
    const scaleTransformError = validateScaleTransforms(code);
    if (scaleTransformError) {
      this.log.stdErr.push(scaleTransformError);
      this.log.stdErr.push('');
      this.log.stdErr.push('Suggestion: Fix scale transforms by:');
      this.log.stdErr.push('  - Using separate spheres with translate() instead of extreme scaling');
      this.log.stdErr.push('  - Keeping scale ratios under 5:1 (e.g., scale([2,2,8]) → use two spheres)');
      this.log.stdErr.push('  - Increasing minimum scale factors to at least 0.7');
      this.log.stdErr.push('  - Reducing sphere radius when using non-uniform scaling');

      throw new OpenSCADError(
        scaleTransformError,
        code,
        this.log.stdErr,
      );
    }

    // ✅ VALIDATE PARAMETER EXPRESSIONS: Prevent WASM crashes from divisions in scale()
    const parameterExpressionError = validateParameterExpressions(code);
    if (parameterExpressionError) {
      this.log.stdErr.push(parameterExpressionError);
      this.log.stdErr.push('');
      this.log.stdErr.push('Suggestion: Fix parameter expressions by:');
      this.log.stdErr.push('  - Using literal numbers in scale() (e.g., scale([1, 1, 1.5]))');
      this.log.stdErr.push('  - Never use division in scale() (e.g., NOT scale([1, 1, h/r]))');
      this.log.stdErr.push('  - Calculate values beforehand as parameters');
      this.log.stdErr.push('  - Keep expressions simple (max 2 operators)');

      throw new OpenSCADError(
        parameterExpressionError,
        code,
        this.log.stdErr,
      );
    }

    // ✅ VALIDATE PARAMETER SIZES: Prevent out-of-memory crashes
    const parameterSizeError = validateParameterSizes(code);
    if (parameterSizeError) {
      this.log.stdErr.push(parameterSizeError);
      this.log.stdErr.push('');
      this.log.stdErr.push('Suggestion: Fix parameter sizes by:');
      this.log.stdErr.push('  - Reducing sphere radius to ≤ 80 (current design may be too large)');
      this.log.stdErr.push('  - Reducing height to ≤ 200');
      this.log.stdErr.push('  - Scaling down the entire design proportionally');
      this.log.stdErr.push('  - Ensuring all dimensions are positive numbers');

      throw new OpenSCADError(
        parameterSizeError,
        code,
        this.log.stdErr,
      );
    }

    // ✅ VALIDATE LINEAR_EXTRUDE GEOMETRY: Prevent CGAL/WASM crashes from problematic extrusion patterns
    const linearExtrudeError = validateLinearExtrudeGeometry(code);
    if (linearExtrudeError) {
      this.log.stdErr.push(linearExtrudeError);
      this.log.stdErr.push('');
      this.log.stdErr.push('Suggestion: Fix linear_extrude issues by:');
      this.log.stdErr.push('  - Using center=false (default) instead of center=true');
      this.log.stdErr.push('  - Adjusting position with translate() after extrusion');
      this.log.stdErr.push('  - For roofs: Use rotated cubes instead of extruded polygons');
      this.log.stdErr.push('  - Simplifying polygon geometry (max 12 points)');
      this.log.stdErr.push('  - Reducing extrusion height to ≤ 200');

      throw new OpenSCADError(
        linearExtrudeError,
        code,
        this.log.stdErr,
      );
    }

    const inputFile = '/input.scad';
    const outputFile = '/out.' + fileType;
    const instance = await this.getInstance();
    const importLibraries: string[] = [];

    // Sync user files to instance
    await this.syncFilesToInstance(instance);

    // Write the code to a file (overwrite if exists)
    instance.FS.writeFile(inputFile, code);

    // Load required libraries with caching
    for (const library of libraries) {
      if (
        code.includes(library.name) &&
        !importLibraries.includes(library.name)
      ) {
        importLibraries.push(library.name);

        // Check if library is already loaded in the filesystem
        const libraryPath = '/libraries/' + library.name;
        if (this.fileExists(instance, libraryPath)) {
          // Library already loaded, skip
          continue;
        }

        try {
          // Check in-memory cache first
          let zip: Blob;
          if (this.libraryCache.has(library.name)) {
            zip = this.libraryCache.get(library.name)!;
          } else {
            // Download and cache
            const response = await fetch(library.url);
            zip = await response.blob();
            this.libraryCache.set(library.name, zip);
          }

          // Unzip the file
          const files = await new ZipReader(new BlobReader(zip)).getEntries();

          // Libraries should go into the library folder
          await Promise.all(
            files
              // We don't want any directories, they are included in the filename anyway
              .filter((f) => f.directory === false)

              // Collect all files into an WorkspaceFile array
              .map(async (f) => {
                const writer = new Uint8ArrayWriter();
                const fileName = f.filename;

                if (!f.getData) throw new Error('getData is not defined');

                const blob = await f.getData(writer);
                const path = '/libraries/' + library.name + '/' + fileName;

                const pathParts = path.split('/');
                pathParts.pop();
                const dir = pathParts.join('/');

                if (dir && !this.fileExists(instance, dir)) {
                  this.createDirectoryRecursive(instance, dir);
                }

                instance.FS.writeFile(path, new Int8Array(blob));
              }),
          );
        } catch (error) {
          console.error('Error importing library', library.name, error);
        }
      }
    }

    const args = [inputFile, '-o', outputFile, ...parameters];
    let exitCode;
    let output;

    const COMPILATION_TIMEOUT_MS = 30000; // 30 seconds
    const compilationStart = Date.now();

    // Log compilation attempt for debugging
    console.log('[OpenSCAD] Starting WASM compilation...');
    console.log('[OpenSCAD] Arguments:', args.join(' '));
    console.log('[OpenSCAD] Code length:', code.length, 'characters');

    try {
      // Note: callMain is synchronous and blocking, so we can't interrupt it directly
      // For now, we check the duration after completion and warn users
      exitCode = instance.callMain(args);

      const compilationDuration = Date.now() - compilationStart;
      console.log(`[OpenSCAD] Compilation completed in ${compilationDuration}ms with exit code ${exitCode}`);

      if (compilationDuration > COMPILATION_TIMEOUT_MS) {
        console.warn(
          `Compilation took ${compilationDuration}ms, which exceeds the recommended timeout of ${COMPILATION_TIMEOUT_MS}ms. Consider simplifying the model.`,
        );
      }
    } catch (error) {
      const compilationDuration = Date.now() - compilationStart;
      console.error(`[OpenSCAD] WASM crashed after ${compilationDuration}ms`);
      console.error('[OpenSCAD] Error details:', error);
      console.error('[OpenSCAD] stderr length:', this.log.stdErr.length);

      if (compilationDuration > COMPILATION_TIMEOUT_MS) {
        throw new OpenSCADError(
          'OpenSCAD compilation timeout: Model is too complex. Try simplifying the design or reducing the number of operations.',
          code,
          this.log.stdErr,
        );
      }

      // Enhanced error message for WASM crashes with no stderr
      const errorMessage = error instanceof Error
        ? 'OpenSCAD WASM crashed: ' + error.message
        : 'OpenSCAD WASM crashed unexpectedly';

      // Add helpful context if stderr is empty (indicates WASM-level crash)
      if (this.log.stdErr.length === 0) {
        this.log.stdErr.push('WASM execution failed without error output.');
        this.log.stdErr.push('This usually indicates:');
        this.log.stdErr.push('  - Invalid hull geometry (overlapping spheres)');
        this.log.stdErr.push('  - Invalid linear_extrude or polygon operations');
        this.log.stdErr.push('  - Extrusion with center=true causing coordinate issues');
        this.log.stdErr.push('  - Non-manifold geometry from rotate + linear_extrude');
        this.log.stdErr.push('  - Complex transformations causing numerical instability');
        this.log.stdErr.push('  - Out of memory in WASM module');
        this.log.stdErr.push('');
        this.log.stdErr.push('Common fixes:');
        this.log.stdErr.push('  - Use cube() instead of linear_extrude for roofs');
        this.log.stdErr.push('  - Set center=false in extrusion operations');
        this.log.stdErr.push('  - Simplify polygon point counts (max 12 points)');
        this.log.stdErr.push('  - Avoid rotate() + linear_extrude(center=true) combination');
      }

      throw new OpenSCADError(
        errorMessage,
        code,
        this.log.stdErr,
      );
    }

    if (exitCode === 0) {
      try {
        output = instance.FS.readFile(outputFile, { encoding: 'binary' });
      } catch (error) {
        if (error instanceof Error) {
          throw new Error('Cannot read generated file: ' + error.message);
        } else {
          throw new Error('Cannot read generated file');
        }
      }
    } else {
      throw new OpenSCADError(
        'OpenSCAD compilation failed',
        code,
        this.log.stdErr,
      );
    }

    return {
      output,
      exitCode,
      duration: Date.now() - start,
      log: this.log,
      fileType,
    };
  }

  escapeShell(cmd: string) {
    return '"' + cmd.replace(/(["'$`\\])/g, '\\$1') + '"';
  }
}

export default OpenSCADWrapper;
