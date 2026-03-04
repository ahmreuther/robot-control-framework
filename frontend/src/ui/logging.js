/**
 * Simple UI logging helpers.
 * Provides functions to append messages to the log panel and clear the log.
 */

/**
 * Append a log message to the UI.
 * @param {string} msg - Log message to display.
 */
export function logMessageToBox(msg) {
    const logContainer = document.getElementById('message-log');
    const line = document.createElement('div');
    line.classList.add('log-entry');
    line.textContent = msg;
    logContainer.prepend(line);
}
/**
 * Clear the log view.
 */
export function clearLog() {
    document.getElementById('message-log').innerHTML ='';
}