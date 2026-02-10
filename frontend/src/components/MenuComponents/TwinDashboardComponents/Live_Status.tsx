import { useRobotInfoContext} from '../../../contexts/RobotInfoContext';

export default function Live_Status() {
    const {robotName, robotStatus, robotMode, axleValues, robotInfo} = useRobotInfoContext();
    const jointsText = Object.keys(axleValues).length === 0 ? '-' : Object.entries(axleValues).map(([k, v]) => `${k}: ${v.toFixed(2)}`).join(', ');

    return (
        <section className="panel">
            <header className="panel-header">
                <div className='panel-title'>Live Status</div>
            </header>
            <div className="panel-body overflow-auto">
                <StatusItem label="Connected Robot" value={robotName} />
                <StatusItem label="Status" value={robotStatus} valueClass={robotStatus === 'Connected' ? 'text-green-400' : 'text-yellow-400'} />
                <StatusItem label="Mode" value={robotMode} />
                <StatusItem label="Joints" value={jointsText} />
                <StatusItem label="Manufacturer" value={robotInfo.manufacturer ? robotInfo.manufacturer : '-'} />
                <StatusItem label="Serial Number" value={robotInfo.serialNumber ? robotInfo.serialNumber : '-'} />
            </div>
        </section>
    );
}

function StatusItem({ label, value, valueClass = '', }: { label: string; value: string; valueClass?: string; }) {
    return (
        <div className="flex justify-between items-center gap-2 whitespace-nowrap">
            <span className="text-gray-300">{label} :</span>
            <span className={`code ${valueClass} truncate max-w-[60%] text-right`}title={String(value)}>{value}</span>
        </div>
    )
}