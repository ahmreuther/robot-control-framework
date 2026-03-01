/*
Layout helpers stay per robot. Keep new code following the same per-robot pattern.
*/
export function setInfoBoxState(expanded) {
    // --- DOM Elements ---
    const infoBox = document.getElementById('info-box');
    const infoToggleBtn = document.getElementById('info-toggle-btn');
    const propertiesBox = document.getElementById('properties-box');

    infoToggleBtn.style.display = "block";
    infoBox.style.width = expanded ? "750px" : "450px";
    propertiesBox.style.width = expanded ? "750px" : "450px";
    infoToggleBtn.textContent = expanded ? "collapse »" : "« expand";
}

// Toggle the OPC UA panel.
export function toggleOpcUaSection() {

    const toggleOpcUa = document.getElementById('toggle-opc-ua');
    const opcUaSection = document.getElementById('opc-ua');

    toggleOpcUa.addEventListener('click', () => {
        opcUaSection.classList.toggle('hidden');
    });
}

// Toggle the robot dashboard panel.
export function toggleRobotDashboardSection() {
    const toggleRobotDashboard = document.getElementById('toggle-robot-dashboard');
    const robotDashboardSection = document.getElementById('robot-dashboard');

    toggleRobotDashboard.addEventListener('click', () => {
            robotDashboardSection.classList.toggle('hidden');
    });
}

// Switch tabs (address space, subscriptions, events).
export function switchTab(tabName) {
    const buttons = document.querySelectorAll(".tab-btn");
    buttons.forEach((btn) => {
        if (btn.getAttribute("data-tab") === tabName) {
            btn.classList.add("active");
        } else {
            btn.classList.remove("active");
        }
    });

    const contents = document.querySelectorAll(".tab-content");
    contents.forEach((content) => {
        if (content.id === `tab-${tabName}`) {
            content.classList.add("active");
        } else {
            content.classList.remove("active");
        }
    });
    console.log(`Switched UI to ${tabName} tab.`);
}

// Make the target element match the source width.
export const syncWidth = (source, target) => {
    if (source && target) {
        target.style.width = source.style.width;
    }
};

// Mirror width changes from source to target.
export const initWidthObserver = (source, target) => {
    const observer = new MutationObserver(() => syncWidth(source, target));
    observer.observe(source, { attributes: true, attributeFilter: ['style'] });
    return observer;
};

// Remove the 'checked' class whenever it appears.
export const initAnimationBlocker = (element) => {
    if (!element) return null;
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.target.classList.contains('checked')) {
                mutation.target.classList.remove('checked');
            }
        });
    });
    observer.observe(element, { attributes: true, attributeFilter: ['class'] });
    return observer;
};

// Return the next width/label pair based on expansion state.
export const getToggleDimensions = (isCurrentlyExpanded) => {
    return {
        width: isCurrentlyExpanded ? "450px" : "750px",
        label: isCurrentlyExpanded ? "« expand" : "collapse »",
    };
};