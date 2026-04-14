import { Button, Input } from '@heroui/react';
import { useState } from 'react';

import { type ModelConfig } from './URDFSelector';

export interface AddRobotProps {
  addRobot: (name: string) => void;
  onSelectURDF?: (model: ModelConfig) => void;
}

function AddRobot({ addRobot, onSelectURDF }: AddRobotProps) {
  const [robotName, setRobotName] = useState('');
  const [selectedModel, setSelectedModel] = useState<ModelConfig | null>(null);

  function handleAddRobot() {
    if (!selectedModel) return;

    // If robot name is empty, use model label
    const name = robotName.trim() || selectedModel.label;
    addRobot(name);

    // Trigger URDF selection in parent
    if (onSelectURDF) {
      onSelectURDF(selectedModel);
    }

    // Reset form
    setRobotName('');
    setSelectedModel(null);
  }

  return (
    <div className="flex flex-col gap-3 p-4 bg-black bg-opacity-70 rounded border border-white/20">
      <div className="font-bold text-sm uppercase tracking-wide text-white/90 pb-2 border-b border-white/20">
        Add Robot
      </div>

      <Input
        value={robotName}
        onChange={(e) => setRobotName(e.target.value)}
        aria-label="Robot Name"
        className="w-full text-xs"
        placeholder="Robot name (optional)"
      />

      <div className="mt-2">
        <div className="text-xs text-white/70 mb-2">
          Select URDF Model:{' '}
          {selectedModel && <span className="text-blue-400">({selectedModel.label})</span>}
        </div>
      </div>

      <Button
        onPress={handleAddRobot}
        isDisabled={!selectedModel}
        className="mt-3 bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-500"
      >
        Add Robot
      </Button>
    </div>
  );
}
export default AddRobot;
