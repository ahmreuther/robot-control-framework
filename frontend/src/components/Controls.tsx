import Buttons from "./Buttons";
import { Selector } from "./Selector";
import { GenSliders } from "./Sliderx";

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