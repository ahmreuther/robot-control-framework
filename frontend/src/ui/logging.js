export function logMessageToBox(msg) {
    const logContainer = document.getElementById('message-log');
    const line = document.createElement('div');
    line.classList.add('log-entry');
    line.textContent = msg;
    logContainer.prepend(line);
}
//done
export function clearLog() {
    document.getElementById('message-log').innerHTML ='';
}