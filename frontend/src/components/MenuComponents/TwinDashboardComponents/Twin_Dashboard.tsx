
export default function  Twin_Dashboard() {
    return (
        <section className="panel">
            <header className="panel-header">
            <div className="panel-title">Twin Information</div>
            </header>
            <div className="panel-body">
                <StatusItem label="Manufacturer" value='-' />
                <StatusItem label="Model" value='-' />
                <StatusItem label="Lockout" value='-' />
                <StatusItem label="Locking User" value='-' />
                <StatusItem label="Remaining Lock Time" value='-' />
                <StatusItem label="Remaining Session Time" value='-' />
                <StatusItem label="Waypoints" value='-' />
                <StatusItem label="Errors" value="None" valueClass="text-green-400" />
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

