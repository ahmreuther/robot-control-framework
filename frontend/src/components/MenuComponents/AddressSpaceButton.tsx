// AddressSpaceButton.tsx - Button to open/close the Address Space window
import { Button } from "@heroui/react";

interface AddressSpaceButtonProps {
  isOpen: boolean;
  onToggle: () => void;
}

export function AddressSpaceButton({ isOpen, onToggle }: AddressSpaceButtonProps) {
  return (
    <div className="flex flex-col gap-3 p-4 bg-black bg-opacity-70 rounded border border-white/20">
      <div className="font-bold text-sm uppercase tracking-wide text-white/90 pb-2 border-b border-white/20">
        Address Space Browser
      </div>
      <Button
        onPress={onToggle}
        className={`px-3 py-1 text-xs rounded ${
          isOpen 
            ? "bg-green-600/30 text-green-300 border border-green-500/50" 
            : "bg-white/10 text-white hover:bg-white/20"
        }`}
      >
        {isOpen ? "🌳 Address Space Open" : "Open Address Space"}
      </Button>
      <p className="text-xs text-white/50">
        Browse the OPC UA server's address space. Window state is saved automatically.
      </p>
    </div>
  );
}

export default AddressSpaceButton;
