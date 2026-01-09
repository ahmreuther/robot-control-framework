import Buttons from "./ControlsComponents/Buttons";
import { Selector } from "./ControlsComponents/Selector";
import { GenSliders } from "./ControlsComponents/Sliderx";

//Controls Tab
function Controls() {
    return (
        <div className="flex flex-col gap-4">
        {/* Control elements go here */}
        <Buttons />
        <Selector />
        <GenSliders count={3} />       
        </div>
    );
}

export default Controls;