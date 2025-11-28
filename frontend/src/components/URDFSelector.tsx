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
  <ul id="urdf-selector">
    {options.map(opt => (
      <li
        key={opt.urdf}
        style={{ cursor: 'pointer', color: opt.color }}
        onClick={() => onSelect(opt)}
      >
        {opt.label}
      </li>
    ))}
  </ul>
);