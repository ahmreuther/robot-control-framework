import Buttons from "./Buttons";
import { Selector } from "./Selector";
import { GenSliders } from "./Sliderx";

//Controls Tab
function Controls() {
    return (
        <div className="fixed">
        {/* Control elements go here */}
        <Buttons />
        <Selector />
        <GenSliders count={3} />       
        </div>
    );
}

export default Controls;