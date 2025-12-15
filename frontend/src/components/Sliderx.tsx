import {Label, Slider} from "@heroui/react";
import {NumberField, Description, FieldError} from '@heroui/react';


export function GenSliders({ count }: { count: number }) {
  const sliders = Array.from({ length: count }, (_, i) => <Sliderx key={i} />);
  return <>{sliders}</>; // Fragment, damit mehrere Komponenten zurückgegeben werden
}


function Sliderx() {
  return (
    <div>
        {/* Slider */}
        <Slider className="w-full max-w-xs " defaultValue={50}>
          <Label className="text-white">Volume</Label>
          <Slider.Output />
          <Slider.Track>
            <Slider.Fill />
            <Slider.Thumb />
          </Slider.Track>
        </Slider>
        
        {/* Numberfield */}
        <NumberField>
          <Label />
          <NumberField.Group>
            <NumberField.DecrementButton />
            <NumberField.Input />
            <NumberField.IncrementButton />
          </NumberField.Group>
          <Description />
          <FieldError />
        </NumberField>
    </div>

  );
}