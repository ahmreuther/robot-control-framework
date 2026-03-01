/*
Logging helpers. Newest entries go on top. Keep additions per robot when needed.
*/
export function logMessageToBox(msg) {
    const logContainer = document.getElementById('message-log');
    const line = document.createElement('div');
    line.classList.add('log-entry');
    line.textContent = msg;
    logContainer.prepend(line);
}
// Clear the log view.
export function clearLog() {
    document.getElementById('message-log').innerHTML ='';
}