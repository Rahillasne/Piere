export function FloatingGrid() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute inset-0" style={{
        backgroundImage: `
          linear-gradient(oklch(0.28 0.08 296 / 0.3) 1px, transparent 1px),
          linear-gradient(90deg, oklch(0.28 0.08 296 / 0.3) 1px, transparent 1px)
        `,
        backgroundSize: '50px 50px',
        maskImage: 'radial-gradient(ellipse 80% 50% at 50% 50%, black 0%, transparent 70%)',
        WebkitMaskImage: 'radial-gradient(ellipse 80% 50% at 50% 50%, black 0%, transparent 70%)'
      }} />

      {/* Floating orbs - Purple glow */}
      <div className="absolute top-1/4 left-1/4 w-64 h-64 rounded-full blur-3xl opacity-20"
        style={{
          background: 'radial-gradient(circle, #A855F7 0%, transparent 70%)',
          animation: 'float 8s ease-in-out infinite'
        }} />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full blur-3xl opacity-20"
        style={{
          background: 'radial-gradient(circle, #A855F7 0%, transparent 70%)',
          animation: 'float 10s ease-in-out infinite reverse'
        }} />

      <style>{`
        @keyframes float {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(30px, -30px) scale(1.1); }
        }
      `}</style>
    </div>
  );
}
