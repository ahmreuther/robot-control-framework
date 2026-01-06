import Buttons from "./Buttons";
import { Selector } from "./Selector";
import { GenSliders } from "./Sliderx";

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