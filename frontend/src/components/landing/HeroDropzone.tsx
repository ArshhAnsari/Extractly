'use client';

import React, { useCallback, useRef, useState } from 'react';
import Image from 'next/image';
import { useGuestStore } from '@/lib/stores/guestStore';
import { useUiStore } from '@/lib/stores/uiStore';
import { Button } from '@/components/ui/button';
import { UploadCloud, X, FileText, Image as ImageIcon, File, ShieldCheck, FileSpreadsheet, Zap, Sparkles } from 'lucide-react';
import { formatBytes, cn } from '@/lib/utils';
import { motion } from 'framer-motion';

const TrustChip = ({ icon: Icon, children }: { icon: React.ElementType, children: React.ReactNode }) => (
  <div className="px-3 py-1.5 rounded-full bg-surface border border-border text-xs font-medium text-muted-foreground flex items-center gap-1.5 shadow-sm">
    <Icon className="h-3.5 w-3.5 text-primary" />
    {children}
  </div>
);

export function AIPreview() {
  // 5 seconds total for a complete Scan -> Hold -> Reset cycle
  const ANIM_DURATION = 5; 
  const baseBorder = "rgba(99,102,241,0.2)";
  const glowBorder = "rgba(99,102,241,0.8)";
  
  // High-precision timeline (8 waypoints)
  // 0.00 - 0.65: Laser scans down, cards appear sequentially
  // 0.65 - 0.85: Laser disappears, data stays on screen for reading
  // 0.85 - 0.95: Text cleanly fades out
  // 0.95 - 1.00: Laser resets to the top
  const scanTimes =     [0,    0.15,  0.35,  0.55,  0.65,   0.85,   0.95,  1];
  
  const laserTop =      ["0%", "25%", "58%", "91%", "100%", "100%", "0%",  "0%"];
  const laserOpacity =  [1,    1,     1,     1,     0,      0,      0,     1];

  // Name (appears at 15%)
  const nameOpacity =   [0,    1,     1,     1,     1,      1,      0,     0]; 
  const nameBorder =    [baseBorder, glowBorder, baseBorder, baseBorder, baseBorder, baseBorder, baseBorder, baseBorder];

  // Exp (appears at 35%)
  const expOpacity =    [0,    0,     1,     1,     1,      1,      0,     0];
  const expBorder =     [baseBorder, baseBorder, glowBorder, baseBorder, baseBorder, baseBorder, baseBorder, baseBorder];

  // Skills (appears at 55%)
  const skillsOpacity = [0,    0,     0,     1,     1,      1,      0,     0];
  const skillsBorder =  [baseBorder, baseBorder, baseBorder, glowBorder, baseBorder, baseBorder, baseBorder, baseBorder];

  return (
    <div className="relative w-full h-full panel bg-[#0A0A0F] rounded-2xl border border-border p-4 sm:p-6 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 mb-6">
        <Sparkles className="h-5 w-5 text-primary" />
        <span className="font-heading font-bold text-sm tracking-wide text-white">
          AI EXTRACTION PREVIEW
        </span>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 h-full min-h-0">
        
        {/* Left Side: Mock Resume & Laser */}
        <div className="flex-1 bg-[#111118] border border-border rounded-xl relative overflow-hidden min-h-[250px]">
          
          <div className="absolute inset-0 opacity-80 pointer-events-none p-4">
            <Image 
              src="/gemini-svg.svg" 
              alt="Mock Resume" 
              fill 
              className="object-contain object-top"
            />
          </div>

          {/* Animated scanning laser */}
          <motion.div
            className="absolute left-0 right-0 h-0.5 bg-primary shadow-[0_0_20px_rgba(99,102,241,1)] z-10"
            animate={{ 
              top: laserTop,
              opacity: laserOpacity
            }}
            transition={{
              duration: ANIM_DURATION,
              ease: "linear",
              times: scanTimes,
              repeat: Infinity,
            }}
          />
          
          {/* Subtle fade at the bottom */}
          <div className="absolute bottom-0 left-0 w-full h-12 bg-gradient-to-t from-[#111118] to-transparent z-10" />
        </div>

        {/* Right Side: AI-extracted fields */}
        <div className="flex-1 flex flex-col justify-center gap-3 sm:gap-4 min-h-0">
          
          {/* Candidate Name Card */}
          <motion.div
            animate={{ borderColor: nameBorder }}
            transition={{ duration: ANIM_DURATION, times: scanTimes, repeat: Infinity, ease: "linear" }}
            className="bg-primary/5 border border-primary/20 rounded-lg p-3 relative overflow-hidden"
          >
            <motion.div
               animate={{ opacity: nameOpacity }}
               transition={{ duration: ANIM_DURATION, times: scanTimes, repeat: Infinity, ease: "linear" }}
            >
              <div className="text-[10px] text-primary font-mono mb-1 font-semibold tracking-wider">
                CANDIDATE NAME
              </div>
              <div className="text-sm font-medium text-white">Sarah Jenkins</div>
            </motion.div>
          </motion.div>

          {/* Years Exp Card */}
          <motion.div
            animate={{ borderColor: expBorder }}
            transition={{ duration: ANIM_DURATION, times: scanTimes, repeat: Infinity, ease: "linear" }}
            className="bg-primary/5 border border-primary/20 rounded-lg p-3 relative overflow-hidden"
          >
            <motion.div
               animate={{ opacity: expOpacity }}
               transition={{ duration: ANIM_DURATION, times: scanTimes, repeat: Infinity, ease: "linear" }}
            >
              <div className="text-[10px] text-primary font-mono mb-1 font-semibold tracking-wider">
                YEARS EXP
              </div>
              <div className="text-sm font-medium text-white">5 Years</div>
            </motion.div>
          </motion.div>

          {/* Skills Card */}
          <motion.div
            animate={{ borderColor: skillsBorder }}
            transition={{ duration: ANIM_DURATION, times: scanTimes, repeat: Infinity, ease: "linear" }}
            className="bg-primary/5 border border-primary/20 rounded-lg p-3 relative overflow-hidden"
          >
            <motion.div
               animate={{ opacity: skillsOpacity }}
               transition={{ duration: ANIM_DURATION, times: scanTimes, repeat: Infinity, ease: "linear" }}
            >
              <div className="text-[10px] text-primary font-mono mb-1 font-semibold tracking-wider">
                SKILLS
              </div>
              <div className="text-sm font-medium text-white">React, TypeScript, Next.js</div>
            </motion.div>
          </motion.div>
          
        </div>
      </div>
    </div>
  );
}

export function HeroDropzone() {
  const { pendingFiles, addFiles, removeFile } = useGuestStore();
  const { openModal } = useUiStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const processNewFiles = useCallback((newFiles: File[]) => {
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png'
    ];
    
    const validFiles = newFiles.filter(f => allowedTypes.includes(f.type));
    const slotsLeft = Math.max(0, 5 - pendingFiles.length);
    const filesToAdd = validFiles.slice(0, slotsLeft);
    
    if (filesToAdd.length > 0) {
      addFiles(filesToAdd);
    }
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [pendingFiles.length, addFiles]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      const droppedFiles = Array.from(e.dataTransfer.files);
      processNewFiles(droppedFiles);
    },
    [processNewFiles]
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      processNewFiles(Array.from(e.target.files));
    }
  };

  const getFileIcon = (type: string) => {
    if (type === 'application/pdf') return <FileText className="h-5 w-5 text-red-400" />;
    if (type.includes('image')) return <ImageIcon className="h-5 w-5 text-blue-400" />;
    if (type.includes('document')) return <FileText className="h-5 w-5 text-blue-600" />;
    return <File className="h-5 w-5 text-slate-400" />;
  };

  return (
    <section id="hero-dropzone" className="pt-8 pb-16 px-6 max-w-7xl mx-auto grid lg:grid-cols-2 gap-12 items-center min-h-[80vh]">
      <motion.div 
        className="flex flex-col text-left"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <h1 className="text-5xl lg:text-6xl font-heading font-bold mb-6 text-balance text-foreground leading-tight">
          Extract structured data from <span className="text-primary">any CV</span> in seconds.
        </h1>
        <p className="text-lg text-muted-foreground mb-8 max-w-xl text-balance">
          Upload up to 5 CVs right now. Define your fields and get clean, exportable candidate data instantly. No sign-up required to test.
        </p>

        <div className="flex gap-3 flex-wrap mb-10">
          <TrustChip icon={Zap}>No signup test</TrustChip>
          <TrustChip icon={File}>PDF/DOCX/Image</TrustChip>
          <TrustChip icon={FileSpreadsheet}>Export XLSX/CSV</TrustChip>
          <TrustChip icon={ShieldCheck}>Private</TrustChip>
        </div>

        <div 
          className={cn(
            "w-full max-w-xl border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center cursor-pointer transition-all duration-300",
            isDragging 
              ? "border-primary bg-primary/10 scale-[1.02]" 
              : "border-border bg-surface hover:border-primary/50 hover:bg-surface-elevated hover:shadow-lg"
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <UploadCloud className={cn("h-12 w-12 mb-4 transition-colors", isDragging ? "text-primary" : "text-muted-foreground")} />
          <p className="text-lg font-bold mb-1 text-foreground">Drag and drop files here</p>
          <p className="text-sm text-muted-foreground mb-4">or click to browse from your computer</p>
          <p className="text-xs text-muted-foreground bg-background px-3 py-1 rounded-full border border-border">Max 5 files</p>
          
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            multiple 
            accept=".pdf,.docx,.jpg,.jpeg,.png" 
            onChange={handleChange}
          />
        </div>

        <motion.div 
          className="lg:hidden mt-6 h-[360px] w-full max-w-xl"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <AIPreview />
        </motion.div>

        {pendingFiles.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="w-full max-w-xl mt-6 flex flex-col"
          >
            <div className="w-full space-y-2 mb-6">
              {pendingFiles.map((file, i) => (
                <div key={`${file.name}-${i}`} className="flex items-center justify-between bg-surface-elevated border border-border p-3 rounded-lg shadow-sm">
                  <div className="flex items-center space-x-3 overflow-hidden">
                    {getFileIcon(file.type)}
                    <span className="font-medium text-sm text-foreground truncate max-w-[200px] sm:max-w-xs">{file.name}</span>
                    <span className="text-xs text-muted-foreground">{formatBytes(file.size)}</span>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={(e) => { e.stopPropagation(); removeFile(i); }}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            
            <Button 
              size="lg" 
              className="w-full text-lg h-14 bg-primary hover:bg-primary-hover text-white shadow-lg shadow-primary/25 transition-all hover:-translate-y-0.5"
              onClick={() => openModal('wizard')}
            >
              Process Files <Sparkles className="ml-2 h-5 w-5" />
            </Button>
          </motion.div>
        )}
      </motion.div>

      <motion.div 
        className="hidden lg:block relative h-[500px]"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, delay: 0.2 }}
      >
        <AIPreview />
      </motion.div>
    </section>
  );
}
