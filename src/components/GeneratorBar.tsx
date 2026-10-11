import React, { useState, useRef } from 'react';
import { PhysicalEstimates } from '../types';
import { 
  Upload, 
  Wand2, 
  Sparkles, 
  Loader2, 
  Image as ImageIcon,
  CheckCircle2,
  X
} from 'lucide-react';

interface GeneratorBarProps {
  onImportImage: (base64: string, filename?: string) => Promise<void>;
  onGenerateText: (prompt: string) => Promise<void>;
  isGenerating: boolean;
  currentStep: string;
  materialName: string;
  analysisDescription?: string;
}

export const GeneratorBar: React.FC<GeneratorBarProps> = ({
  onImportImage,
  onGenerateText,
  isGenerating,
  currentStep,
  materialName,
  analysisDescription,
}) => {
  const [prompt, setPrompt] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        onImportImage(reader.result as string, file.name);
      };
      reader.readAsDataURL(file);
      e.target.value = '';
    }
  };

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isGenerating) return;
    onGenerateText(prompt.trim());
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Primary Input Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 p-2 bg-slate-900/90 rounded-xl border border-slate-800 shadow-lg">
        {/* Quick Upload Button */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isGenerating}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors shrink-0 disabled:opacity-50"
          title="Charger une photo de texture depuis votre ordinateur"
        >
          <Upload className="w-4 h-4" />
          <span>Importer une Texture</span>
        </button>

        {/* Text Prompt input */}
        <form onSubmit={handleTextSubmit} className="flex-1 flex items-center gap-2">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Ou décrivez une matière (ex: Marbre blanc veiné, Bois de chêne, Cuivre martelé...)"
            disabled={isGenerating}
            className="flex-1 h-9 px-3.5 bg-slate-950/70 border border-slate-800 focus:border-blue-500 rounded-lg text-xs text-slate-100 placeholder-slate-500 outline-none transition-colors"
          />
          <button
            type="submit"
            disabled={isGenerating || !prompt.trim()}
            className="flex items-center justify-center gap-1.5 px-3.5 h-9 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium border border-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          >
            {isGenerating ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
            ) : (
              <Wand2 className="w-3.5 h-3.5 text-blue-400" />
            )}
            <span className="hidden sm:inline">Générer</span>
          </button>
        </form>
      </div>

      {/* Discrete Status / Active Material info */}
      <div className="flex items-center justify-between px-2 text-[11px] text-slate-400">
        <div className="flex items-center gap-2 truncate">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
          <span className="font-medium text-slate-200 truncate">
            {materialName || 'Texture active'}
          </span>
          {analysisDescription && (
            <>
              <span className="text-slate-600 hidden md:inline">·</span>
              <span className="text-slate-400 truncate hidden md:inline max-w-lg">
                {analysisDescription}
              </span>
            </>
          )}
        </div>

        {isGenerating && (
          <div className="flex items-center gap-1.5 text-blue-400 font-medium shrink-0 animate-pulse">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>{currentStep || 'Traitement...'}</span>
          </div>
        )}
      </div>
    </div>
  );
};
