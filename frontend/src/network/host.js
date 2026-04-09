const devFallbackOrigin = 'http://127.0.0.1:8000';

export function getBackendHttpOrigin() {
    if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
        return devFallbackOrigin;
    }

    return `${window.location.protocol}//${window.location.host}`;
}

export function getBackendUrl(path) {
    return new URL(path, getBackendHttpOrigin()).toString();
}

export function getBackendWsUrl(path) {
    const url = new URL(path, getBackendHttpOrigin());
    url.protocol = url.protocol.replace('http', 'ws');
    return url.toString();
}
