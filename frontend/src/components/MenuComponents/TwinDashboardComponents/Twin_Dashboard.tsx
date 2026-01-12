
//twin dashboard showing basic information about the connected twin
function  Twin_Dashboard() {
    return (
        <div className="p-4 bg-black bg-opacity-70 rounded border border-white/20 space-y-2">
            <div className="font-bold text-sm uppercase tracking-wide text-white/90 pb-2 border-b border-white/20">Twin Information</div>
            <p className="text-white/80 text-xs">Manufacturer : -</p>
            <p className="text-white/80 text-xs">Model : -</p>
            <p className="text-white/80 text-xs">Lockout : -</p>
            <p className="text-white/80 text-xs">Locking User : -</p>
            <p className="text-white/80 text-xs">Remaining Lock Time : -</p>
            <p className="text-white/80 text-xs">Remaining Session Time : -</p>
            <p className="text-white/80 text-xs">Waypoints : -</p>
            <p className="text-white/80 text-xs">Errors : <span className="text-green-400">None</span></p>
        </div>
    );
}

export default Twin_Dashboard;