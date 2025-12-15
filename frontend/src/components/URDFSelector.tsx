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
  <ul 
    id="urdf-selector"
    className="
      fixed 
      top-[2%] left-[2%] 
      z-10 
      text-ellipsis 
      list-none 
      pl-0
    "
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
);