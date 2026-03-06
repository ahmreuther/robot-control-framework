# Web Skill Composition - Frontend

React + TypeScript + Vite with ESLint (type-aware) and Prettier for code quality.

## Setup

```bash
cd frontend
npm install
```

## Available Scripts

- `npm run dev` - Start dev server (HMR enabled)
- `npm run build` - TypeScript check + Vite build
- `npm run preview` - Preview production build
- `npm run typecheck` - Run TypeScript type checking
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Auto-fix ESLint issues
- `npm run format` - Format code with Prettier
- `npm run format:check` - Check if code is formatted

## Development Workflow

1. **Type checking**: Runs on build; check with `npm run typecheck`
2. **Linting**: Type-aware ESLint catches async/promise bugs, unused vars, hook deps
3. **Formatting**: Auto-formats on save (requires Prettier extension) or `npm run format`

### Quick checks before commit

```bash
npm run typecheck
npm run lint
npm run format
```

## Configuration

- **ESLint**: [eslint.config.js](eslint.config.js)
  - Type-aware linting for `.ts/.tsx` files
  - React Hooks validation
  - Import auto-sorting
  - Disables type-checking for `.js` files
- **Prettier**: [.prettierrc](.prettierrc)
  - Single quotes, trailing commas, 100-char width
- **TypeScript**: [tsconfig.json](tsconfig.json)
  - Strict mode, bundler module resolution for Vite











## Functions
WebSkillComposition follows a clearly structured workflow that supports both **offline** and **online programming**.
This allows you to first simulate robot movements safely and then transfer them directly to the physical robot—all within the same user interface.
### 1. Select robot and start digital twin
- Create an instance of a **robot URDF model** (e.g., Franka R3, EVA, UR5e) via the right sidepanel
- The model is loaded in the 3D view and the **kinematic simulation** is immediately ready for use.
- The same IK/FK logic works for all supported models.
### 2. Select control mode

**Offline mode**:

- No connection to the real robot.
- Perfect for **planning, simulation, and testing**.
- Movements only affect the digital twin.

**Online mode**:
- Add a Server via the right sidepannel and connect your robot to the server
- Connection to the chosen **OPC UA Robotics Server** is automaticaly established.
- Live data from the physical robot is transferred.

### 3. Create movements
**Joint space control**:
    
- Adjust joint angles directly using sliders or by dragging individual joints in the 3D model.

**Task Space Control (TCP)**:

- Move or rotate the tool center point (TCP) using a yellow control ball.
- Inverse kinematics automatically calculates the appropriate joint angles.

**Lead-Through (Hand-Guiding)** – only in online mode with supported robots:
- Move the robot by hand; changes are displayed directly in the digital twin.

### 4. Execute skills
Each movement or action is based on a **skill**:
- **JointPTPMoveSkill**: Point-to-point movement in the joint space.
- **EndEffSkill**: Open/close grippers or other end effector operations.
- Skills are **standardized** and work identically for all connected robots.
### 5. Activate live synchronization
In online mode, **digital and physical twins** can be continuously synchronized:
- Changes to the physical robot → immediately visible in the digital twin.
- Manipulations in the digital twin → immediate execution on the physical robot.
### 6. Monitor and analyze
- Browse the address structure of the robot in the **OPC UA browser**.
- Subscribe to variables and events (e.g., joint positions, temperatures, errors).
- Track messages in the log panel (status, warnings, errors).
---
**How you can put WebSkillComposition to practical use:**
1. Select a robot and simulate it kinematically in the browser.
2. Test movements and skills in offline mode.
3. Establish a connection to the physical robot.
4. Execute the same skills live – manufacturer-independent and standardized.
5. Monitor status and feedback live.
  
## Keyboard shortcuts
While working with the WebSkillComposition 3D viewer, you can quickly switch between view, transformation, and IK control modes using the keyboard.
For mobile devieces buttons can be used for these actions
These shortcuts enable smooth operation without having to constantly click on UI elements.
| Key | Function |
|-------|----------|
| **Q** | Switch between **world** and **local coordinate systems** for transformations |
| **W** | Set transformation mode to **Translation** |
| **E** | Set transformation mode to **Rotation** |
| **T** | **Show or hide** the IK interface for manipulating the end effector |
---



## Notes

- `.prettierrc` and `eslint.config.js` should be committed (shared across team)
- `.tsbuildinfo` is in `.gitignore` (build artifact)
- VS Code: Install [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode) extension for format-on-save
