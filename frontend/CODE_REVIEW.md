# Code Cleanup & Architecture Review

## 🔴 Critical Tight Coupling Issues

### 1. **App.tsx - Business Logic in UI Component**
**Location:** [App.tsx](src/App.tsx#L48-L67)

**Problem:**
- State management logic (FK mode, angle synchronization) is mixed with view rendering
- Complex inline handlers with multiple state updates
- `SOLVE_STATUS` import from deeply nested component logic (should be constants/types)
- Multiple state variables that should be grouped (`jointAngles`, `fkJointAngles`, `fkMode` are interdependent)

**Suggested Fix:**
```typescript
// Create a custom hook instead
const useRobotController = () => {
  const [selectedRobot, setSelectedRobot] = useState(...)
  const [fkMode, setFkMode] = useState(false)
  // ... all state management logic here
  return { selectedRobot, fkMode, handleAngleChange, ... }
}

// Then in App:
const { selectedRobot, fkMode, handleAngleChange } = useRobotController()
```

---

### 2. **JointAnglesPanel - Rad/Deg Conversion Logic in Component**
**Location:** [JointAnglesPanel.tsx](src/components/viewport/JointAnglesPanel.tsx#L8-L9)

**Problem:**
- Math utilities (`radToDeg`, `degToRad`) defined at component level
- If these are used elsewhere, they're duplicated
- UI component is responsible for unit conversion logic

**Suggested Fix:**
```typescript
// Create src/utils/math.ts
export const radToDeg = (rad: number) => (rad * 180) / Math.PI
export const degToRad = (deg: number) => (deg * Math.PI) / 180

// Then import in components that need it
```

---

### 3. **Viewport - Too Many Props (Prop Drilling)**
**Location:** [Viewport.tsx](src/components/viewport/Viewport.tsx#L5-L14)

**Problem:**
- 8+ props being passed down
- Multiple callback props that are tightly coupled to App.tsx logic
- `onFkJointAnglesUpdate`, `onJointAnglesUpdate`, `onSolveStatusesChange` are App-specific concerns
- `onTransformDrag` directly controls FK mode logic in parent
- `fkJointAngles`, `fkMode` shouldn't be here - Viewport shouldn't need to know about FK mode

**Suggested Fix:**
```typescript
// Separate concerns:
// 1. Viewport only cares about URDF and 3D rendering
interface ViewportProps {
  urdfPath: string
  onRobotStateChange?: (state: RobotState) => void
}

// 2. Create a RobotController wrapper that handles FK/IK logic
// 3. App just manages which mode is active
```

---

### 4. **RobotWithIK - Mixed Concerns**
**Location:** [RobotIKLogic.tsx](src/components/viewport/RobotIKLogic.tsx)

**Problem:**
- Component handles both IK solving, animation, and forward kinematics
- Too many responsibilities (should be separated)
- Hard to test or reuse individual features
- Animation logic mixed with IK solving

**Suggested Fix:**
```typescript
// Split into:
// 1. useRobotIK hook - handles IK solving logic
// 2. useRobotAnimation hook - handles home pose animation
// 3. RobotWithIK component - composable, uses both hooks
```

---

### 5. **State Synchronization Between Components**
**Location:** [App.tsx](src/App.tsx#L48-L67) and [Viewport.tsx](src/components/viewport/Viewport.tsx#L40-L45)

**Problem:**
- `jointAngles` and `fkJointAngles` are synchronized manually via callbacks
- Multiple sources of truth for joint angles
- Easy to get out of sync
- Complex logic to handle which one to use

**Suggested Fix:**
```typescript
// Single source of truth approach:
type RobotState = {
  jointAngles: number[]
  mode: 'ik' | 'fk'
}

// Or use a state machine/context API to manage mode and angles together
```

---

### 6. **FK Mode Toggle Scattered Across Files**
**Problem:**
- FK mode is toggled in JointAnglesPanel (`onAngleChange`)
- FK mode is toggled in Viewport (`onDrag`)
- FK mode is toggled in App (`setFkMode`)
- Logic is duplicated and hard to maintain

**Suggested Fix:**
```typescript
// Create a custom hook to manage FK mode behavior:
const useFKModeAutoToggle = () => {
  const [fkMode, setFkMode] = useState(false)
  const handleSliderChange = () => setFkMode(true)
  const handleTransformDrag = () => setFkMode(false)
  return { fkMode, handleSliderChange, handleTransformDrag }
}
```

---

## 📋 Cleanup Tasks

### Remove Unused Code
- [ ] `onManualModeChange` prop in Viewport (defined but never used)
- [ ] Unused imports in App.tsx: `Live_Status`, `MessageLog`, `Menu` (commented out)

### Extract Constants
- [ ] Move `ROBOT_MODELS` to a separate `config/robots.ts` file
- [ ] Move `SOLVE_STATUS` to `constants/solveStatus.ts`

### Create Utility Files
- [ ] `/src/utils/math.ts` - angle conversion functions
- [ ] `/src/constants/config.ts` - robot models, camera settings
- [ ] `/src/types/index.ts` - shared type definitions

### Extract Custom Hooks
- [ ] `useRobotController()` - manages FK/IK mode and state
- [ ] `useSolveStatusLookup()` - status text generation
- [ ] `useFKModeAutoToggle()` - FK mode toggle logic

---

## 🎯 Architecture Recommendation

**Current:**
```
App (state management + UI) 
  ├── Viewport (state passed + multiple callbacks)
  │   └── RobotWithIK (receives many props)
  └── JointAnglesPanel (state + logic)
```

**Proposed:**
```
App (minimal state, uses custom hooks)
  ├── useRobotController (all logic)
  ├── Viewport (only URDF + 3D)
  │   └── RobotWithIK (simpler props)
  └── JointAnglesPanel (display only)
```

---

## Priority Order
1. **High** - Extract `useRobotController` hook
2. **High** - Move `ROBOT_MODELS` to config
3. **Medium** - Create utility functions file
4. **Medium** - Reduce Viewport prop drilling
5. **Low** - Remove unused imports and variables
