import React from 'react';

export interface URDFOptions {
  urdf: string;
  color: string;
  label: string;
}

interface URDFSelectorProps {
  options: URDFOptions[];
  onSelect: (option: URDFOptions) => void;
}

export const URDFSelector: React.FC<URDFSelectorProps> = ({ options, onSelect }) => (
  <div>
    <ul 
      id="urdf-selector"
      className="bg-gray bg-opacity-60 p-3 rounded text-white"
      
    >
      {options.map(opt => (
        <li
          key={opt.urdf}
          className="
            cursor-pointer 
            opacity-50 
            hover:opacity-75 
            text-[20px] 
            font-thin
          "
          style={{ cursor: 'pointer', color: opt.color }}
          onClick={() => onSelect(opt)}
        >
          {opt.label}
        </li>
      ))}
    </ul>
  </div>
);