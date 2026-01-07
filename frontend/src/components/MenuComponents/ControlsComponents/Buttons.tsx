import {Checkbox, Label} from "@heroui/react";

//buttons for the viewport settings like ignore joint limits, hide fixed joints, use radians, autocenter, show collision
function Buttons() {
  return (
    <div>
        <div className="flex items-center gap-3">
          <Checkbox id="basic-terms">
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
          </Checkbox>
          <Label htmlFor="basic-terms" className="text-white">Ignore Joint Limits</Label>
        </div>
        <div className="flex items-center gap-3">
          <Checkbox id="basic-terms">
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
          </Checkbox>
          <Label htmlFor="basic-terms" className="text-white">Hide Fixed Joints</Label>
        </div>
        <div className="flex items-center gap-3">
          <Checkbox id="basic-terms">
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
          </Checkbox>
          <Label htmlFor="basic-terms" className="text-white">Use Radians</Label>
        </div>
        <div className="flex items-center gap-3">
          <Checkbox id="basic-terms">
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
          </Checkbox>
          <Label htmlFor="basic-terms" className="text-white">Autocenter</Label>
        </div>
        <div className="flex items-center gap-3">
          <Checkbox id="basic-terms">
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
          </Checkbox>
          <Label htmlFor="basic-terms" className="text-white">Show Collision</Label>
        </div>
    </div>
  );
}

export default Buttons;