# Project conventions

- Branch names and commit messages must be in English.
- Keep domain code independent of Electron, React, and persistence.
- Represent monetary amounts as integer cents and calendar dates as YYYY-MM-DD.
- Depend on application ports; compose concrete adapters in the Electron main process.
- Use shadcn components and the existing dark theme tokens.
- Never overwrite the source Actual database or silently discard import errors.
- Changes to recurrence, migration, or reports require behavior-focused tests.
- Run npm test, npm run build, and npm run lint after relevant changes.
- Use an isolated LUME_DATA_DIR for UI testing; never insert fixtures in the personal database.
