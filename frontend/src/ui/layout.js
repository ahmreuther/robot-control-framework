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

// Toggle OPC UA panel (works)
export function toggleOpcUaSection() {

    const toggleOpcUa = document.getElementById('toggle-opc-ua');
    const opcUaSection = document.getElementById('opc-ua');

    toggleOpcUa.addEventListener('click', () => {
        opcUaSection.classList.toggle('hidden');
    });
}

// Toggle Robot Dashboard panel (works)
export function toggleRobotDashboardSection() {
    const toggleRobotDashboard = document.getElementById('toggle-robot-dashboard');
    const robotDashboardSection = document.getElementById('robot-dashboard');

    toggleRobotDashboard.addEventListener('click', () => {
            robotDashboardSection.classList.toggle('hidden');
    });
}

export function switchTab(tabName) { //Done i think maybe TODO because different
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

/**
 * Forces the target element to match the source element's width
 */
export const syncWidth = (source, target) => {
    if (source && target) {
        target.style.width = source.style.width;
    }
};

/**
 * Creates an observer that ensures target width follows source width
 */
export const initWidthObserver = (source, target) => {
    const observer = new MutationObserver(() => syncWidth(source, target));
    observer.observe(source, { attributes: true, attributeFilter: ['style'] });
    return observer;
};

/**
 * Creates an observer that prevents the 'checked' class from being applied.
 * Starts the observer immediately after calling the method
 */
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

/**
 * Pure logic to determine the next UI state based on current expansion
 */
export const getToggleDimensions = (isCurrentlyExpanded) => {
    return {
        width: isCurrentlyExpanded ? "450px" : "750px",
        label: isCurrentlyExpanded ? "« expand" : "collapse »",
    };
};