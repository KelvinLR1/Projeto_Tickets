'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { X, GripVertical } from 'lucide-react';
import TimerWidget from './TimerWidget';

interface InternalPiPProps {
    onClose: () => void;
}

const InternalPiP: React.FC<InternalPiPProps> = ({ onClose }) => {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            drag
            dragMomentum={false}
            className="fixed bottom-8 right-8 w-[350px] h-[450px] z-[9999] flex flex-col glass-card rounded-3xl border border-accent-theme/30 shadow-[0_20px_50px_rgba(0,0,0,0.3)] overflow-hidden bg-background/80 backdrop-blur-xl"
        >
            {/* Header / Drag Handle */}
            <div className="flex items-center justify-between p-3 border-b border-border-theme bg-accent-theme/5 cursor-grab active:cursor-grabbing">
                <div className="flex items-center gap-2">
                    <GripVertical className="w-4 h-4 text-accent-theme/50" />
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-accent-theme/70">Widget Modo</span>
                </div>
                <button
                    onClick={onClose}
                    className="p-1.5 hover:bg-red-500/20 hover:text-red-500 text-foreground/40 rounded-xl transition-all"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden pointer-events-auto">
                <TimerWidget />
            </div>

            {/* Corner resize handle (visual only for now, drag handle is header) */}
            <div className="absolute bottom-1 right-1 w-3 h-3 border-r-2 border-b-2 border-accent-theme/20 rounded-br-lg pointer-events-none" />
        </motion.div>
    );
};

export default InternalPiP;
