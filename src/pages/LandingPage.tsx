import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Box, Sparkles, Sliders, FileDown, Image as ImageIcon, Code } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAuth } from '@/core/AuthContext';
import { Hero } from '@/components/Hero';

export function LandingPage() {
  const navigate = useNavigate();
  const { firebaseUser, session, isLoading } = useAuth();

  // Redirect to app if already authenticated
  useEffect(() => {
    if (!isLoading && (firebaseUser || session)) {
      navigate('/app', { replace: true });
    }
  }, [isLoading, firebaseUser, session, navigate]);

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen bg-pierre-bg-dark text-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-pierre-blue/20 border-t-pierre-blue rounded-full animate-spin" />
          <p className="text-sm text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  const features = [
    {
      icon: Sparkles,
      title: 'AI-Powered Design',
      description: 'Describe what you want in plain English and watch as Claude AI generates your 3D model instantly'
    },
    {
      icon: Box,
      title: 'Real-Time 3D Preview',
      description: 'See your model rendered live in your browser with full 3D interaction and rotation'
    },
    {
      icon: Sliders,
      title: 'Smart Parameters',
      description: 'Adjust dimensions with interactive sliders - no need to regenerate the entire model'
    },
    {
      icon: ImageIcon,
      title: 'Image Upload',
      description: 'Upload reference images to help the AI understand exactly what you want to create'
    },
    {
      icon: FileDown,
      title: 'Export Ready',
      description: 'Download STL files for 3D printing or SCAD files for further editing in CAD software'
    },
    {
      icon: Code,
      title: 'Browser-Based',
      description: 'No desktop software needed - OpenSCAD runs directly in your browser via WebAssembly'
    }
  ];

  return (
    <div className="min-h-screen bg-pierre-bg-dark text-white overflow-hidden relative">
      {/* Hero Section - New Animated Black Background Hero */}
      <Hero />

      {/* Features Grid with 3D tilt effect */}
      <section className="px-6 py-20 relative z-10">
        <div className="max-w-7xl mx-auto">
          <motion.div
            className="text-center mb-16"
            initial={{ y: 30, opacity: 0 }}
            whileInView={{ y: 0, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-3xl md:text-4xl mb-4 font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
              Everything you need to create
            </h2>
            <p className="text-lg text-slate-400">
              From concept to 3D print in minutes
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <FeatureCard key={feature.title} feature={feature} index={index} />
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="px-6 py-20 relative z-10">
        <div className="max-w-4xl mx-auto">
          <motion.div
            className="text-center mb-16"
            initial={{ y: 30, opacity: 0 }}
            whileInView={{ y: 0, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-3xl md:text-4xl mb-4 font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
              Simple three-step process
            </h2>
          </motion.div>

          <div className="space-y-6">
            {[
              {
                step: '01',
                title: 'Describe your model',
                description: 'Type what you want in plain English: "Create a phone stand 80mm tall with a 45 degree angle"'
              },
              {
                step: '02',
                title: 'Preview & adjust',
                description: 'See your 3D model instantly and use sliders to tweak dimensions in real-time'
              },
              {
                step: '03',
                title: 'Export & print',
                description: 'Download as STL for 3D printing or SCAD for further editing'
              }
            ].map((item, index) => (
              <motion.div
                key={item.step}
                className="relative flex gap-6 p-6 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-pierre-blue/30 transition-all duration-300 group overflow-hidden"
                initial={{ x: -50, opacity: 0 }}
                whileInView={{ x: 0, opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.15 }}
                whileHover={{ scale: 1.02, x: 10 }}
              >
                {/* Shimmer effect */}
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-pierre-blue/5 to-transparent"
                  initial={{ x: '-100%' }}
                  whileHover={{ x: '100%' }}
                  transition={{ duration: 0.8 }}
                />
                <div className="text-4xl text-pierre-blue/40 font-bold group-hover:text-pierre-blue/60 transition-colors duration-300">
                  {item.step}
                </div>
                <div className="relative z-10">
                  <h3 className="text-xl mb-2 font-semibold group-hover:text-pierre-blue transition-colors duration-300">
                    {item.title}
                  </h3>
                  <p className="text-slate-400 text-base">{item.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="px-6 py-20 relative z-10">
        <motion.div
          className="max-w-4xl mx-auto text-center p-12 rounded-3xl bg-gradient-to-br from-pierre-blue/5 via-purple-500/5 to-pierre-blue/5 border border-white/10 backdrop-blur-sm relative overflow-hidden group"
          initial={{ y: 30, opacity: 0 }}
          whileInView={{ y: 0, opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          whileHover={{ scale: 1.02 }}
        >
          {/* Animated background gradient */}
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-pierre-blue/10 via-purple-500/10 to-pierre-blue/10"
            animate={{
              backgroundPosition: ['0% 50%', '100% 50%', '0% 50%']
            }}
            transition={{
              duration: 5,
              repeat: Infinity,
              ease: 'linear'
            }}
            style={{ backgroundSize: '200% auto' }}
          />

          <div className="relative z-10">
            <h2 className="text-3xl md:text-4xl mb-4 font-bold">
              Ready to start creating?
            </h2>
            <p className="text-lg text-slate-300 mb-8">
              Join thousands of makers bringing their ideas to life
            </p>
            <motion.button
              onClick={() => navigate('/login')}
              className="bg-white text-black hover:bg-slate-100 border-0 px-8 py-4 text-lg rounded-xl shadow-xl shadow-white/10 font-medium"
              whileHover={{ scale: 1.1, boxShadow: '0 25px 50px rgba(255, 255, 255, 0.2)' }}
              whileTap={{ scale: 0.95 }}
            >
              Get Started Now
            </motion.button>
          </div>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-12 border-t border-white/5 relative z-10">
        <div className="max-w-7xl mx-auto text-center text-slate-500">
          <p>© 2025 Pierre. Named after Pierre Bézier, pioneer of CAD technology.</p>
        </div>
      </footer>
    </div>
  );
}

// 3D Tilt Feature Card Component
function FeatureCard({ feature, index }: { feature: any, index: number }) {
  const [rotateX, setRotateX] = useState(0);
  const [rotateY, setRotateY] = useState(0);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const rotateXValue = ((y - centerY) / centerY) * -10;
    const rotateYValue = ((x - centerX) / centerX) * 10;

    setRotateX(rotateXValue);
    setRotateY(rotateYValue);
  };

  const handleMouseLeave = () => {
    setRotateX(0);
    setRotateY(0);
  };

  return (
    <motion.div
      className="relative p-6 rounded-2xl bg-white/[0.02] border border-white/5 backdrop-blur-sm hover:bg-white/[0.05] hover:border-pierre-blue/30 transition-all duration-300 group overflow-hidden"
      initial={{ y: 50, opacity: 0 }}
      whileInView={{ y: 0, opacity: 1 }}
      viewport={{ once: true }}
      transition={{
        duration: 0.6,
        delay: index * 0.1,
        type: 'spring',
        stiffness: 100
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        transformStyle: 'preserve-3d',
        transform: `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`,
        transition: 'transform 0.1s ease-out'
      }}
    >
      {/* Shimmer effect on hover */}
      <motion.div
        className="absolute inset-0 bg-gradient-to-r from-transparent via-pierre-blue/10 to-transparent"
        initial={{ x: '-100%', skewX: -20 }}
        whileHover={{ x: '100%' }}
        transition={{ duration: 0.8 }}
      />

      {/* Icon with pop animation */}
      <motion.div
        className="w-12 h-12 rounded-xl bg-gradient-to-br from-pierre-blue/10 to-purple-500/10 border border-white/5 flex items-center justify-center mb-4 group-hover:from-pierre-blue/20 group-hover:to-purple-500/20 transition-all duration-300"
        whileHover={{
          scale: 1.2,
          rotate: [0, -10, 10, -10, 0],
          transition: { duration: 0.5 }
        }}
        style={{ transformStyle: 'preserve-3d', transform: 'translateZ(20px)' }}
      >
        <feature.icon className="w-6 h-6 text-pierre-blue" />
      </motion.div>

      <h3 className="text-xl mb-2 font-semibold relative z-10" style={{ transform: 'translateZ(10px)' }}>
        {feature.title}
      </h3>
      <p className="text-slate-400 text-sm relative z-10" style={{ transform: 'translateZ(5px)' }}>
        {feature.description}
      </p>
    </motion.div>
  );
}
