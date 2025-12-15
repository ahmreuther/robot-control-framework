import {Label, ListBox, Select} from "@heroui/react";

export function Selector() {
  return (
    <Select className="w-[256px]" placeholder="Select one">
      <Label className="text-white">Up Axis</Label>
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          <ListBox.Item id="+X" textValue="+X" className="text-black">
            +X
            <ListBox.ItemIndicator />
          </ListBox.Item>
          <ListBox.Item id="-X" textValue="-X" className="text-black">
            -X
            <ListBox.ItemIndicator />
          </ListBox.Item>
          <ListBox.Item id="+Y" textValue="+Y" className="text-black">
            +Y
            <ListBox.ItemIndicator />
          </ListBox.Item>
          <ListBox.Item id="-Y" textValue="-Y" className="text-black">
            -Y
            <ListBox.ItemIndicator />
          </ListBox.Item>
          <ListBox.Item id="+Z" textValue="+Z" className="text-black">
            +Z
            <ListBox.ItemIndicator />
          </ListBox.Item>
          <ListBox.Item id="-Z" textValue="-Z" className="text-black">
            -Z
            <ListBox.ItemIndicator />
          </ListBox.Item>
        </ListBox>
      </Select.Popover>
    </Select>
  );
}