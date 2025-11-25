import plcLogo from '../assets/Logo_PLCM_RGB_mit Text.svg';
import roboTeachLogo from '../assets/RoboTeach_Logo.png';

type LogoProps = {
  size?: number;
};

function CornerLogo({ size = 300 }: LogoProps) {
  return (
    <div className="CornerLogo">
      <img src={plcLogo} alt="PLCM Logo" style={{ height: size }} />
      <img src={roboTeachLogo} alt="RoboTeach Logo" style={{ height: size }} />
    </div>
  );
}

export default CornerLogo;