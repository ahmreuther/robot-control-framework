# Frontend Architecture

## Current Target Structure

```
src/
  app/
    providers/
    layout/
    routes/
  features/
    address-space/
      api/
      components/
      hooks/
      model/
    robot-control/
      components/
      hooks/
      model/
    server-management/
      components/
      hooks/
      model/
    socket/
      parser/
      handlers/
      model/
  shared/
    api/
    lib/
    types/
    ui/
    styles/
  assets/
  test/
```

## Migration Status

- `features/address-space`: wired and used by app layout imports.
- `features/server-management`: wired and used by app layout + shared model typing.
- `features/socket`: wired with parser/handler/model exports.
- `features/robot-control`: intentionally deferred; viewport remains source of truth for now.
- `shared/ui`: wired and used by app layout imports.
- Legacy compatibility kept only for `components/Adressspace` (viewport imports).

## Compatibility Notes

- `components/Adressspace` is retained as a temporary shim for existing viewport imports.
- Existing viewport modules were intentionally not refactored in this phase.
