import React from 'react';

export type ModelConfig = {
  id: string;
  label: string;
  url: string;
};

export interface URDFOptions {
  urdf: string;
  color: string;
  label: string;
}

interface URDFSelectorProps {
  options: ModelConfig[];
  onSelect: (option: ModelConfig) => void;
}

export const URDFSelector: React.FC<URDFSelectorProps> = ({ options, onSelect }) => (
  <div 
    id="urdf-selector"
    className="text-white text-xs bg-black bg-opacity-70 p-4 rounded border border-white/20 z-10 pointer-events-auto"
  >
    <div className="font-bold mb-3 text-sm uppercase tracking-wide text-white/90">Robot Model</div>
    <ul className="list-none pl-0 space-y-2">
      {options.map(opt => (
        <li
          key={opt.url}
          className="cursor-pointer px-2 py-1 rounded hover:bg-white/10 hover:text-blue-300 transition-colors text-white/80"
          onClick={() => onSelect(opt)}
        >
          {opt.label}
        </li>
      ))}
    </ul>
  </div>
);