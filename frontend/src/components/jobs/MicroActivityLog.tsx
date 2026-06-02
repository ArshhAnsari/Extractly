'use client';

import { useState, useEffect } from 'react';

interface MicroActivityLogProps {
  status: string;
  doneFiles: number;
}

const placeholderFiles = [
  "resume_final.pdf",
  "john_doe_cv.docx",
  "frontend_dev_resume.pdf",
  "portfolio_and_cv.pdf",
  "smith_resume_2026.docx",
  "applicant_data.pdf",
  "engineering_cv.pdf"
];

export function MicroActivityLog({ status, doneFiles }: MicroActivityLogProps) {
  const [currentText, setCurrentText] = useState("Processing files...");
  const [opacity, setOpacity] = useState(1);

  useEffect(() => {
    if (status !== 'PROCESSING') return;

    // Fade out
    setOpacity(0);
    
    const timeout = setTimeout(() => {
      // Pick a random filename from placeholders to simulate activity
      // In a real app with WebSocket, we'd get the actual filename
      const randomFile = placeholderFiles[doneFiles % placeholderFiles.length];
      setCurrentText(`Analyzing: ${randomFile}...`);
      // Fade in
      setOpacity(1);
    }, 200);

    return () => clearTimeout(timeout);
  }, [doneFiles, status]);

  if (status !== 'PROCESSING') return null;

  return (
    <div 
      className="text-xs text-muted-foreground mt-2 font-mono truncate transition-opacity duration-200"
      style={{ opacity }}
    >
      {currentText}
    </div>
  );
}