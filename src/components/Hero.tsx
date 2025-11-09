import { motion, useScroll, useTransform } from "framer-motion";
import { ArrowRight, Mic, Type, Box, Download } from "lucide-react";
import { Button } from "@/ui/button";
import { useNavigate } from "react-router-dom";

export function Hero() {
  const navigate = useNavigate();
  const { scrollY } = useScroll();
  const contentOpacity = useTransform(scrollY, [0, 300], [1, 0]);

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-black">
      {/* Animated Background - Always visible and animating */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        {/* Floating Geometric Shapes */}
        {[...Array(20)].map((_, i) => (
          <FloatingShape key={i} index={i} />
        ))}

        {/* Animated Grid */}
        <motion.div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: `
              linear-gradient(to right, rgba(59, 130, 246, 0.3) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(59, 130, 246, 0.3) 1px, transparent 1px)
            `,
            backgroundSize: '80px 80px',
          }}
          animate={{
            backgroundPosition: ['0px 0px', '80px 80px'],
          }}
          transition={{
            duration: 20,
            repeat: Infinity,
            ease: "linear",
          }}
        />

        {/* Glowing Orbs */}
        <motion.div
          className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-blue-500/20 blur-3xl"
          animate={{
            x: [0, 100, 0],
            y: [0, -50, 0],
            scale: [1, 1.2, 1],
          }}
          transition={{
            duration: 15,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
        <motion.div
          className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full bg-purple-500/20 blur-3xl"
          animate={{
            x: [0, -100, 0],
            y: [0, 50, 0],
            scale: [1, 1.3, 1],
          }}
          transition={{
            duration: 18,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
        <motion.div
          className="absolute top-1/2 right-1/3 w-80 h-80 rounded-full bg-pink-500/15 blur-3xl"
          animate={{
            x: [0, 80, 0],
            y: [0, -80, 0],
            scale: [1, 1.1, 1],
          }}
          transition={{
            duration: 12,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      </div>

      {/* Content */}
      <motion.div
        className="relative z-10 max-w-6xl mx-auto px-6 text-center"
        style={{ opacity: contentOpacity }}
      >
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="mb-6"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-md border border-white/20 mb-8">
            <Box className="w-4 h-4 text-blue-400" />
            <span className="text-sm text-white/90">AI-Powered 3D Design</span>
          </div>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="text-white mb-6 tracking-tight text-5xl md:text-6xl lg:text-7xl leading-tight"
        >
          Speak Your Ideas
          <br />
          <span className="text-white">
            Into Reality
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.8 }}
          className="text-xl text-white/80 mb-12 max-w-2xl mx-auto leading-relaxed"
        >
          Transform natural language into parametric 3D models. No CAD experience needed.
          Design, iterate, and export—all in your browser.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 1 }}
          className="flex flex-wrap items-center justify-center gap-4"
        >
          <Button
            size="lg"
            className="bg-white text-black hover:bg-white/90 group px-8 py-6"
            onClick={() => navigate('/login')}
          >
            Start Creating
            <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </Button>
        </motion.div>

        {/* Floating Feature Pills */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 1.4 }}
          className="mt-20 flex flex-wrap items-center justify-center gap-8"
        >
          <FeaturePill icon={Type} text="Text-to-CAD" delay={0} />
          <FeaturePill icon={Mic} text="Voice Mode" delay={0.1} />
          <FeaturePill icon={Box} text="Live 3D Preview" delay={0.2} />
          <FeaturePill icon={Download} text="Export STL" delay={0.3} />
        </motion.div>
      </motion.div>

      {/* Scroll Indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 1.5 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10"
      >
        <motion.div
          animate={{ y: [0, 10, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          className="w-6 h-10 border-2 border-white/40 rounded-full flex items-start justify-center p-2"
        >
          <motion.div
            animate={{ opacity: [0, 1, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            className="w-1.5 h-1.5 bg-white/60 rounded-full"
          />
        </motion.div>
      </motion.div>
    </section>
  );
}

function FloatingShape({ index }: { index: number }) {
  const colors = ['text-blue-400', 'text-purple-400', 'text-pink-400', 'text-cyan-400'];
  const sizes = [40, 60, 80, 100];
  const color = colors[index % colors.length];
  const size = sizes[index % sizes.length];

  const randomX = Math.random() * 100;
  const randomY = Math.random() * 100;
  const randomDuration = 15 + Math.random() * 15;
  const randomDelay = Math.random() * 5;

  return (
    <motion.div
      className="absolute"
      style={{
        left: `${randomX}%`,
        top: `${randomY}%`,
        width: size,
        height: size,
      }}
      initial={{ opacity: 0 }}
      animate={{
        opacity: [0, 0.4, 0],
        x: [0, (Math.random() - 0.5) * 200],
        y: [0, (Math.random() - 0.5) * 200],
        rotate: [0, 360],
        scale: [1, 1.5, 1],
      }}
      transition={{
        duration: randomDuration,
        repeat: Infinity,
        ease: "easeInOut",
        delay: randomDelay,
      }}
    >
      {index % 3 === 0 ? (
        <Box className={`w-full h-full ${color} opacity-30`} />
      ) : index % 3 === 1 ? (
        <div className={`w-full h-full border-2 ${color} opacity-30 rotate-45`} />
      ) : (
        <div className={`w-full h-full rounded-full border-2 ${color} opacity-30`} />
      )}
    </motion.div>
  );
}

function FeaturePill({ icon: Icon, text, delay }: { icon: any; text: string; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, delay: 1.4 + delay }}
      whileHover={{ scale: 1.05 }}
      className="flex items-center gap-2 px-6 py-3 rounded-full bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-colors cursor-default"
    >
      <Icon className="w-4 h-4 text-blue-400" />
      <span className="text-sm text-white/90">{text}</span>
    </motion.div>
  );
}
