
//twin dashboard showing basic information about the connected twin
function  Twin_Dashboard() {
    return (
        <section className="panel">
            <header className="panel-header">
            <div className="panel-title">Twin Information</div>
            </header>
            <div className="panel-body">
            <p className="text-white/80">Manufacturer : -</p>
            <p className="text-white/80">Model : -</p>
            <p className="text-white/80">Lockout : -</p>
            <p className="text-white/80">Locking User : -</p>
            <p className="text-white/80">Remaining Lock Time : -</p>
            <p className="text-white/80">Remaining Session Time : -</p>
            <p className="text-white/80">Waypoints : -</p>
            <p className="text-white/80">Errors : <span className="text-green-400">None</span></p>
            </div>
        </section>
    );
}

export default Twin_Dashboard;