import { useEffect, useRef } from 'react';

export function AnimatedCube() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const updateSize = () => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };
    updateSize();
    window.addEventListener('resize', updateSize);

    let animationId: number;
    let rotation = 0;

    // 3D cube vertices
    const vertices = [
      [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], // Back face
      [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]      // Front face
    ];

    // Cube edges
    const edges = [
      [0, 1], [1, 2], [2, 3], [3, 0], // Back face
      [4, 5], [5, 6], [6, 7], [7, 4], // Front face
      [0, 4], [1, 5], [2, 6], [3, 7]  // Connecting edges
    ];

    const project = (x: number, y: number, z: number, scale: number) => {
      const factor = 300 / (300 + z * scale);
      return {
        x: x * factor * scale + canvas.width / (2 * window.devicePixelRatio),
        y: y * factor * scale + canvas.height / (2 * window.devicePixelRatio)
      };
    };

    const rotateX = (x: number, y: number, z: number, angle: number) => {
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      return [x, y * cos - z * sin, y * sin + z * cos];
    };

    const rotateY = (x: number, y: number, z: number, angle: number) => {
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      return [x * cos + z * sin, y, -x * sin + z * cos];
    };

    const rotateZ = (x: number, y: number, z: number, angle: number) => {
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      return [x * cos - y * sin, x * sin + y * cos, z];
    };

    const animate = () => {
      const width = canvas.width / window.devicePixelRatio;
      const height = canvas.height / window.devicePixelRatio;

      ctx.fillStyle = 'oklch(0.15 0.08 296)';
      ctx.fillRect(0, 0, width, height);

      rotation += 0.005;
      const scale = 60;

      // Rotate and project vertices
      const projectedVertices = vertices.map(([x, y, z]) => {
        let [rx, ry, rz] = rotateX(x, y, z, rotation);
        [rx, ry, rz] = rotateY(rx, ry, rz, rotation * 0.7);
        [rx, ry, rz] = rotateZ(rx, ry, rz, rotation * 0.5);
        return project(rx, ry, rz, scale);
      });

      // Draw edges with gradient
      edges.forEach(([start, end], index) => {
        const startPoint = projectedVertices[start];
        const endPoint = projectedVertices[end];

        const gradient = ctx.createLinearGradient(
          startPoint.x, startPoint.y,
          endPoint.x, endPoint.y
        );

        const opacity = 0.3 + (Math.sin(rotation + index) * 0.2);
        gradient.addColorStop(0, `oklch(0.656 0.243 296 / ${opacity})`);
        gradient.addColorStop(1, `oklch(0.8 0.15 296 / ${opacity * 0.5})`);

        ctx.strokeStyle = gradient;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';

        ctx.beginPath();
        ctx.moveTo(startPoint.x, startPoint.y);
        ctx.lineTo(endPoint.x, endPoint.y);
        ctx.stroke();
      });

      // Draw vertices
      projectedVertices.forEach((point, index) => {
        const size = 4 + Math.sin(rotation + index) * 2;
        ctx.fillStyle = 'oklch(0.656 0.243 296 / 0.6)';
        ctx.beginPath();
        ctx.arc(point.x, point.y, size, 0, Math.PI * 2);
        ctx.fill();
      });

      animationId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', updateSize);
      cancelAnimationFrame(animationId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ opacity: 0.4 }}
    />
  );
}
